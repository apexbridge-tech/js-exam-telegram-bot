import type TelegramBot from "node-telegram-bot-api";
import {
  getAnswersForQuestion,
  getQuestionById,
  type AnswerRow,
  type QuestionRow,
} from "../../services/question.service.js";
import {
  getQuestionIdAt,
  recordSingleChoice,
  selectedAnswerIds,
  setCurrentIndex,
  toggleMultiChoice,
  getSessionById,
} from "../../services/session.service.js";
import {
  answersKeyboardMulti,
  answersKeyboardSingle,
  navControls,
  extrasControls,
} from "../keyboards.js";
import {
  renderQuestionBody,
  renderQuestionHeader,
  renderReviewAnswers,
  escapeMd,
} from "../views.js";
import { isQuestionCorrect } from "../../services/scoring.service.js";
import { inferReference } from "../../services/ref.service.js";

/**
 * Register handlers for answer selection, toggling, and extras (reveal/learn).
 */
export function registerAnswerHandlers(bot: TelegramBot): void {
  bot.on(
    "callback_query",
    async (q: TelegramBot.CallbackQuery): Promise<void> => {
      const data: string = q.data ?? "";
      const msg = q.message;
      if (!msg) return;

      // --- Single-choice: ans:<sid>:<qid>:<idx>:<aid>
      const ans = parseAns(data);
      if (ans) {
        const [sid, qid, idx, aid] = ans;
        try {
          await recordSingleChoice(sid, qid, aid);
          const sess = await getSessionById(sid);
          if (!sess) return;

          if (sess.mode === "practice") {
            const ok: boolean = await isQuestionCorrect(sid, qid);
            await safeAnswerCallback(
              bot,
              q.id,
              ok ? "✅ Correct" : "❌ Incorrect"
            );

            // Show the checkmark briefly on current question, then advance
            await refreshAnswers(bot, msg.chat.id, sid, idx, msg.message_id);
            setTimeout(async () => {
              const nextIdx: number = Math.min(40, idx + 1);
              await setCurrentIndex(sid, nextIdx);
              await showQuestion(
                bot,
                msg.chat.id,
                sid,
                nextIdx,
                msg.message_id
              );
            }, 300);
            return;
          }

          // Exam mode: save → quick visual update → advance
          await refreshAnswers(bot, msg.chat.id, sid, idx, msg.message_id);
          const nextIdx: number = Math.min(40, idx + 1);
          await setCurrentIndex(sid, nextIdx);
          await showQuestion(bot, msg.chat.id, sid, nextIdx, msg.message_id);
          await safeAnswerCallback(bot, q.id, "Saved ✓");
        } catch (e) {
          await safeAnswerCallback(bot, q.id, "Oops. Try again.");
          // Optional: console.error("[single-choice error]", e);
        }
        return;
      }

      // --- Multi-choice: tog:<sid>:<qid>:<idx>:<aid>
      const tog = parseTog(data);
      if (tog) {
        const [sid, qid, idx, aid] = tog;
        try {
          await toggleMultiChoice(sid, qid, aid);
          const sess = await getSessionById(sid);
          if (!sess) return;

          await refreshAnswers(bot, msg.chat.id, sid, idx, msg.message_id);

          if (sess.mode === "practice") {
            const ok: boolean = await isQuestionCorrect(sid, qid);
            await safeAnswerCallback(
              bot,
              q.id,
              ok ? "✅ Correct" : "❌ Not yet"
            );
          } else {
            await safeAnswerCallback(bot, q.id, "Saved ✓");
          }
        } catch (e) {
          await safeAnswerCallback(bot, q.id, "Oops. Try again.");
          // Optional: console.error("[multi-toggle error]", e);
        }
        return;
      }

      // --- Reveal answers: reveal:<sid>:<qid>:<idx>
      const rev = parseReveal(data);
      if (rev) {
        const [sid, qid, idx] = rev;
        try {
          const sess = await getSessionById(sid);
          if (!sess) {
            await safeAnswerCallback(bot, q.id);
            return;
          }
          if (sess.mode === "exam" && sess.status === "active") {
            await safeAnswerCallback(
              bot,
              q.id,
              "Not available during the timed exam.",
              true
            );
            return;
          }

          const qrow: QuestionRow = await getQuestionById(qid);
          const answers: AnswerRow[] = await getAnswersForQuestion(qid);
          const selectedIdsArr: number[] = await selectedAnswerIds(sid, qid);
          const selectedSet = new Set<number>(selectedIdsArr);

          const options = answers.map((a) => ({
            text: a.text,
            correct: a.is_correct === 1,
            chosen: selectedSet.has(a.id),
          }));
          const reviewList: string = renderReviewAnswers(options);

          await safeAnswerCallback(bot, q.id, "Shown below.");
          await bot.sendMessage(
            msg.chat.id,
            `*Correct answer(s)*\n${reviewList}`,
            { parse_mode: "Markdown" }
          );

          // Keep focus on current question
          await showQuestion(bot, msg.chat.id, sid, idx, msg.message_id);
        } catch {
          await safeAnswerCallback(bot, q.id, "Oops. Try again.");
        }
        return;
      }

      // --- Learn more: learn:<sid>:<qid>:<idx>
      const learn = parseLearn(data);
      if (learn) {
        const [, qid] = learn;
        try {
          const qrow: QuestionRow = await getQuestionById(qid);
          const link = qrow.reference_url
            ? {
                title: qrow.reference_title ?? "Learn more",
                url: qrow.reference_url,
              }
            : inferReference(qrow);

          if (!link) {
            await safeAnswerCallback(
              bot,
              q.id,
              "No reference available for this question.",
              true
            );
            return;
          }

          await safeAnswerCallback(bot, q.id);
          await bot.sendMessage(
            msg.chat.id,
            `📖 *Learn more:* [${escapeMd(link.title)}](${link.url})`,
            { parse_mode: "Markdown", disable_web_page_preview: false }
          );
        } catch {
          await safeAnswerCallback(bot, q.id, "Oops. Try again.");
        }
      }
    }
  );
}

/**
 * Renders a question by index for a given session.
 * - Active exam/practice: interactive answers + nav + (practice) extras
 * - Submitted (review): read-only answers + explanation + nav + extras
 */
export async function showQuestion(
  bot: TelegramBot,
  chatId: number,
  sessionId: string,
  qIndex: number,
  reuseMessageId?: number
): Promise<void> {
  const sess = await getSessionById(sessionId);
  if (!sess) {
    await bot.sendMessage(chatId, "Session not found.");
    return;
  }

  const row = await getQuestionIdAt(sessionId, qIndex);
  if (!row) {
    await bot.sendMessage(chatId, "Question not found.");
    return;
  }

  const q: QuestionRow = await getQuestionById(row.question_id);
  const answers: AnswerRow[] = await getAnswersForQuestion(q.id);
  const selectedIdsArr: number[] = await selectedAnswerIds(sessionId, q.id);
  const selectedIds: Set<number> = new Set<number>(selectedIdsArr);

  const header: string = renderQuestionHeader(qIndex, 40, q.section, q.type);
  const body: string = renderQuestionBody(q);

  const allowReveal: boolean =
    sess.status === "submitted" || sess.mode === "practice";
  const allowLearn: boolean = allowReveal;

  if (sess.status === "submitted") {
    // Review mode: show correctness & explanation; no answer buttons
    const detailed = answers.map((a) => ({
      text: a.text,
      correct: a.is_correct === 1,
      chosen: selectedIds.has(a.id),
    }));
    const reviewList: string = renderReviewAnswers(detailed);
    const explanation: string = q.explanation
      ? `\n\n*Why:* ${q.explanation}`
      : "";
    const text: string = `${header}\n\n${body}${reviewList}${explanation}`;

    const kb = mergeInline(
      navControls({
        sessionId,
        qIndex,
        total: 40,
        flagged: false,
        showSubmit: false,
        showFlag: false,
      }),
      extrasControls(sessionId, q.id, qIndex, allowReveal, allowLearn)
    );

    if (reuseMessageId) {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: reuseMessageId,
        parse_mode: "Markdown",
        reply_markup: kb,
      });
    } else {
      await bot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
    }
    return;
  }

  // Active session (exam or practice): interactive answers
  const ansKeyboard =
    q.type === "single"
      ? answersKeyboardSingle(
          sessionId,
          q.id,
          qIndex,
          answers,
          selectedIdsArr.length ? selectedIdsArr[0] : null
        )
      : answersKeyboardMulti(sessionId, q.id, qIndex, answers, selectedIds);

  const kb = mergeInline(
    ansKeyboard,
    navControls({
      sessionId,
      qIndex,
      total: 40,
      flagged: row.flagged === 1,
      showSubmit: sess.mode === "exam",
      showFlag: true,
    }),
    extrasControls(sessionId, q.id, qIndex, allowReveal, allowLearn) // only shows in practice (allowed) but harmless to include
  );

  const text: string = `${header}\n\n${body}`;
  if (reuseMessageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: reuseMessageId,
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  }
}

/**
 * Refresh only the answers + nav rows for the current message.
 */
async function refreshAnswers(
  bot: TelegramBot,
  chatId: number,
  sessionId: string,
  qIndex: number,
  messageId: number
): Promise<void> {
  const row = await getQuestionIdAt(sessionId, qIndex);
  if (!row) return;

  const q = await getQuestionById(row.question_id);
  const answers = await getAnswersForQuestion(q.id);
  const selectedIdsArr: number[] = await selectedAnswerIds(sessionId, q.id);
  const selectedIds: Set<number> = new Set<number>(selectedIdsArr);

  const ansKeyboard =
    q.type === "single"
      ? answersKeyboardSingle(
          sessionId,
          q.id,
          qIndex,
          answers,
          selectedIdsArr.length ? selectedIdsArr[0] : null
        )
      : answersKeyboardMulti(sessionId, q.id, qIndex, answers, selectedIds);

  const kb = mergeInline(
    ansKeyboard,
    navControls({
      sessionId,
      qIndex,
      total: 40,
      flagged: row.flagged === 1,
      showSubmit: true,
      showFlag: true,
    })
  );

  await bot.editMessageReplyMarkup(kb, {
    chat_id: chatId,
    message_id: messageId,
  });
}

/* ------------------------- helpers ------------------------- */

function mergeInline(
  ...markups: TelegramBot.InlineKeyboardMarkup[]
): TelegramBot.InlineKeyboardMarkup {
  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  for (const m of markups) {
    if (m.inline_keyboard) rows.push(...m.inline_keyboard);
  }
  return { inline_keyboard: rows };
}

async function safeAnswerCallback(
  bot: TelegramBot,
  id: string | undefined,
  text?: string,
  showAlert: boolean = false
): Promise<void> {
  if (!id) return;
  try {
    await bot.answerCallbackQuery(
      id,
      text ? { text, show_alert: showAlert } : {}
    );
  } catch {
    // ignore callback answer errors (e.g., message edited)
  }
}

/* ----- strict, typed parsers for callback payloads ----- */

function parseAns(
  data: string
): [sid: string, qid: number, idx: number, aid: number] | null {
  const m: RegExpExecArray | null = /^ans:([^:]+):(\d+):(\d+):(\d+)$/.exec(
    data
  );
  if (!m) return null;
  const [, sid, qidS, idxS, aidS] = m;
  const qid = Number(qidS),
    idx = Number(idxS),
    aid = Number(aidS);
  if (!Number.isFinite(qid) || !Number.isFinite(idx) || !Number.isFinite(aid))
    return null;
  return [sid, qid, idx, aid];
}

function parseTog(
  data: string
): [sid: string, qid: number, idx: number, aid: number] | null {
  const m: RegExpExecArray | null = /^tog:([^:]+):(\d+):(\d+):(\d+)$/.exec(
    data
  );
  if (!m) return null;
  const [, sid, qidS, idxS, aidS] = m;
  const qid = Number(qidS),
    idx = Number(idxS),
    aid = Number(aidS);
  if (!Number.isFinite(qid) || !Number.isFinite(idx) || !Number.isFinite(aid))
    return null;
  return [sid, qid, idx, aid];
}

function parseReveal(
  data: string
): [sid: string, qid: number, idx: number] | null {
  const m: RegExpExecArray | null = /^reveal:([^:]+):(\d+):(\d+)$/.exec(data);
  if (!m) return null;
  const [, sid, qidS, idxS] = m;
  const qid = Number(qidS),
    idx = Number(idxS);
  if (!Number.isFinite(qid) || !Number.isFinite(idx)) return null;
  return [sid, qid, idx];
}

function parseLearn(
  data: string
): [sid: string, qid: number, idx: number] | null {
  const m: RegExpExecArray | null = /^learn:([^:]+):(\d+):(\d+)$/.exec(data);
  if (!m) return null;
  const [, sid, qidS, idxS] = m;
  const qid = Number(qidS),
    idx = Number(idxS);
  if (!Number.isFinite(qid) || !Number.isFinite(idx)) return null;
  return [sid, qid, idx];
}

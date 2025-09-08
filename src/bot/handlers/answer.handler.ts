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
} from "../keyboards.js";
import {
  renderQuestionBody,
  renderQuestionHeader,
  renderReviewAnswers,
} from "../views.js";
import { isQuestionCorrect } from "../../services/scoring.service.js";

export function registerAnswerHandlers(bot: TelegramBot): void {
  bot.on(
    "callback_query",
    async (q: TelegramBot.CallbackQuery): Promise<void> => {
      const data: string = q.data ?? "";
      const msg = q.message;
      if (!msg) return;

      // ans:<sid>:<qid>:<idx>:<aid>  (single)
      let m: RegExpMatchArray | null = data.match(
        /^ans:([^:]+):(\d+):(\d+):(\d+)$/
      );
      if (m) {
        const sid: string = m[1];
        const qid: number = Number(m[2]);
        const idx: number = Number(m[3]);
        const aid: number = Number(m[4]);

        try {
          await recordSingleChoice(sid, qid, aid);

          const sess = await getSessionById(sid);
          if (!sess) return;

          // Practice mode: instant feedback toast
          if (sess.mode === "practice") {
            const ok: boolean = await isQuestionCorrect(sid, qid);
            await bot.answerCallbackQuery(q.id, {
              text: ok ? "✅ Correct" : "❌ Incorrect",
              show_alert: false,
            });
            // Stay on question to allow toggling for multi; for single, advance
            const nextIdx: number = Math.min(40, idx + 1);
            await setCurrentIndex(sid, nextIdx);
            await showQuestion(bot, msg.chat.id, sid, nextIdx, msg.message_id);
            return;
          }

          // Exam mode: move forward on single-choice
          const nextIdx: number = Math.min(40, idx + 1);
          await setCurrentIndex(sid, nextIdx);
          await showQuestion(bot, msg.chat.id, sid, nextIdx, msg.message_id);
          await bot.answerCallbackQuery(q.id, { text: "Saved ✓" });
        } catch {
          await bot.answerCallbackQuery(q.id, {
            text: "Oops. Try again.",
            show_alert: false,
          });
        }
        return;
      }

      // tog:<sid>:<qid>:<idx>:<aid>  (multi toggle)
      m = data.match(/^tog:([^:]+):(\d+):(\d+):(\d+)$/);
      if (m) {
        const sid: string = m[1];
        const qid: number = Number(m[2]);
        const idx: number = Number(m[3]);
        const aid: number = Number(m[4]);

        try {
          await toggleMultiChoice(sid, qid, aid);

          const sess = await getSessionById(sid);
          if (!sess) return;

          // Refresh answers on same message
          await refreshAnswers(bot, msg.chat.id, sid, idx, msg.message_id);

          if (sess.mode === "practice") {
            const ok: boolean = await isQuestionCorrect(sid, qid);
            await bot.answerCallbackQuery(q.id, {
              text: ok ? "✅ Correct" : "❌ Not yet",
              show_alert: false,
            });
          } else {
            await bot.answerCallbackQuery(q.id, { text: "Saved ✓" });
          }
        } catch {
          await bot.answerCallbackQuery(q.id, {
            text: "Oops. Try again.",
            show_alert: false,
          });
        }
      }
    }
  );
}

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

  if (sess.status === "submitted") {
    // Review mode: show correctness + explanation (no answer buttons)
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

    const kb = navControls({
      sessionId,
      qIndex,
      total: 40,
      flagged: false,
      showSubmit: false,
      showFlag: false,
    });

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

  // Active session: show interactive answers
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

  const kb = navControls({
    sessionId,
    qIndex,
    total: 40,
    flagged: row.flagged === 1,
    showSubmit: sess.mode === "exam",
    showFlag: true,
  });

  const text: string = `${header}\n\n${body}`;
  if (reuseMessageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: reuseMessageId,
      parse_mode: "Markdown",
      reply_markup: mergeInline(ansKeyboard, kb),
    });
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: mergeInline(ansKeyboard, kb),
    });
  }
}

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

  const kb = navControls({
    sessionId,
    qIndex,
    total: 40,
    flagged: row.flagged === 1,
    showSubmit: true,
    showFlag: true,
  });

  await bot.editMessageReplyMarkup(mergeInline(ansKeyboard, kb), {
    chat_id: chatId,
    message_id: messageId,
  });
}

function mergeInline(
  a: TelegramBot.InlineKeyboardMarkup,
  b: TelegramBot.InlineKeyboardMarkup
): TelegramBot.InlineKeyboardMarkup {
  const rows: TelegramBot.InlineKeyboardButton[][] = [
    ...(a.inline_keyboard ?? []),
    ...(b.inline_keyboard ?? []),
  ];
  return { inline_keyboard: rows };
}

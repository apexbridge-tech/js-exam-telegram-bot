import type TelegramBot from "node-telegram-bot-api";
import {
  getAnswersForQuestion,
  getQuestionById,
} from "../../services/question.service.js";
import {
  getQuestionIdAt,
  recordSingleChoice,
  selectedAnswerIds,
  setCurrentIndex,
  toggleMultiChoice,
} from "../../services/session.service.js";
import {
  answersKeyboardMulti,
  answersKeyboardSingle,
  navControls,
} from "../keyboards.js";
import { renderQuestionBody, renderQuestionHeader } from "../views.js";

export function registerAnswerHandlers(bot: TelegramBot) {
  // Single-choice select
  bot.on("callback_query", async (q) => {
    try {
      const data = q.data ?? "";
      const msg = q.message;
      if (!msg) return;

      // ans:<sid>:<qid>:<aid>
      let m = data.match(/^ans:([^:]+):(\d+):(\d+)$/);
      if (m) {
        const [, sid, qidStr, aidStr] = m;
        const qid = Number(qidStr);
        const aid = Number(aidStr);
        await recordSingleChoice(sid, qid, aid);

        // Move to next question
        const sessQ = await getQuestionIdAt(sid, (msg as any).qIndex ?? 0);
        const nextIndex = ((msg as any).qIndex ?? 1) + 1;
        await setCurrentIndex(sid, nextIndex);
        await showQuestion(bot, msg.chat!.id, sid, nextIndex, msg.message_id);
        await bot.answerCallbackQuery(q.id, { text: "Saved ✓" });
        return;
      }

      // tog:<sid>:<qid>:<aid>
      m = data.match(/^tog:([^:]+):(\d+):(\d+)$/);
      if (m) {
        const [, sid, qidStr, aidStr] = m;
        const qid = Number(qidStr);
        const aid = Number(aidStr);
        await toggleMultiChoice(sid, qid, aid);

        // Refresh options on same message
        await refreshAnswers(
          bot,
          msg.chat!.id,
          sid,
          (msg as any).qIndex ?? 1,
          msg.message_id
        );
        await bot.answerCallbackQuery(q.id, { text: "Toggled ✓" });
      }
    } catch {
      if (q.id)
        await bot.answerCallbackQuery(q.id, {
          text: "Oops. Try again.",
          show_alert: false,
        });
    }
  });
}

export async function showQuestion(
  bot: TelegramBot,
  chatId: number,
  sessionId: string,
  qIndex: number,
  reuseMessageId?: number
) {
  const row = await getQuestionIdAt(sessionId, qIndex);
  if (!row) {
    await bot.sendMessage(chatId, "Question not found.");
    return;
  }
  const q = await getQuestionById(row.question_id);
  const answers = await getAnswersForQuestion(q.id);
  const selectedIds = new Set(await selectedAnswerIds(sessionId, q.id));

  const header = renderQuestionHeader(qIndex, 40, q.section, q.type);
  const body = renderQuestionBody(q);

  const ansKeyboard =
    q.type === "single"
      ? answersKeyboardSingle(
          sessionId,
          q.id,
          answers,
          selectedIds.values().next().value ?? null
        )
      : answersKeyboardMulti(sessionId, q.id, answers, selectedIds);

  const nav = navControls(sessionId, qIndex, 40, row.flagged === 1);

  const opts: TelegramBot.SendMessageOptions = {
    parse_mode: "Markdown",
    reply_markup: mergeInline(ansKeyboard, nav),
  };
  if (reuseMessageId) {
    // annotate so handler can know current index
    (bot as any)._msgIndexes =
      (bot as any)._msgIndexes || new Map<number, number>();
    (bot as any)._msgIndexes.set(reuseMessageId, qIndex);
    await bot.editMessageText(`${header}\n\n${body}`, {
      chat_id: chatId,
      message_id: reuseMessageId,
      parse_mode: "Markdown",
      reply_markup: mergeInline(ansKeyboard, nav),
    });
  } else {
    const sent = await bot.sendMessage(chatId, `${header}\n\n${body}`, opts);
    (sent as any).qIndex = qIndex;
  }
}

async function refreshAnswers(
  bot: TelegramBot,
  chatId: number,
  sessionId: string,
  qIndex: number,
  messageId: number
) {
  const row = await getQuestionIdAt(sessionId, qIndex);
  if (!row) return;
  const q = await getQuestionById(row.question_id);
  const answers = await getAnswersForQuestion(q.id);
  const selectedIds = new Set(await selectedAnswerIds(sessionId, q.id));
  const ansKeyboard =
    q.type === "single"
      ? answersKeyboardSingle(
          sessionId,
          q.id,
          answers,
          selectedIds.values().next().value ?? null
        )
      : answersKeyboardMulti(sessionId, q.id, answers, selectedIds);

  const nav = navControls(sessionId, qIndex, 40, row.flagged === 1);
  await bot.editMessageReplyMarkup(mergeInline(ansKeyboard, nav), {
    chat_id: chatId,
    message_id: messageId,
  });
}

function mergeInline(a: any, b: any) {
  return {
    inline_keyboard: [
      ...(a.inline_keyboard || []),
      ...[...(b.inline_keyboard || [])],
    ],
  };
}

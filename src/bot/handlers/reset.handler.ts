import type TelegramBot from "node-telegram-bot-api";
import {
  getSessionById,
  getQuestionIdAt,
  clearAnswersForQuestion,
  clearAllAnswers,
  clearAllFlags,
  abandonSession,
  restartPracticeSession,
} from "../../services/session.service.js";
import { showQuestion } from "./answer.handler.js";
import { BotService } from "../../services/bot.service.js";

export function registerResetHandlers(botService: BotService): void {
  botService.on(
    "callback_query",
    async (q: TelegramBot.CallbackQuery): Promise<void> => {
      const data: string = q.data ?? "";
      const msg = q.message;
      if (!msg) return;

      // Open the reset menu
      let m: RegExpExecArray | null = /^reset:([^:]+)$/.exec(data);
      if (m) {
        const sid: string = m[1];
        const sess = await getSessionById(sid);
        if (!sess) {
          await safeAck(botService, q.id);
          return;
        }
        // Build menu depending on mode
        await botService.answerCallbackQuery(q.id);
        await botService.editMessageReplyMarkup(
          resetMenuKb(sid, sess.mode === "practice", sess.mode === "exam"),
          {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
          }
        );
        return;
      }

      // Clear current question's answers: resq:<sid>
      m = /^resq:([^:]+)$/.exec(data);
      if (m) {
        const sid: string = m[1];
        const sess = await getSessionById(sid);
        if (!sess) {
          await safeAck(botService, q.id);
          return;
        }
        const row = await getQuestionIdAt(sid, sess.current_index);
        if (!row) {
          await safeAck(botService, q.id, "Question not found.");
          return;
        }
        await clearAnswersForQuestion(sid, row.question_id);
        await safeAck(botService, q.id, "Cleared this question.");
        await showQuestion(
          botService,
          msg.chat.id,
          sid,
          sess.current_index,
          msg.message_id
        );
        return;
      }

      // Ask to clear all answers (confirm)
      m = /^ask:resall:([^:]+)$/.exec(data);
      if (m) {
        const sid: string = m[1];
        await safeAck(botService, q.id);
        await botService.editMessageReplyMarkup(
          confirmKb("Clear ALL answers?", `do:resall:${sid}`, `reset:${sid}`),
          {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
          }
        );
        return;
      }

      // Do clear all answers
      m = /^do:resall:([^:]+)$/.exec(data);
      if (m) {
        const sid: string = m[1];
        await clearAllAnswers(sid);
        const sess = await getSessionById(sid);
        await safeAck(botService, q.id, "All answers cleared.");
        await showQuestion(
          botService,
          msg.chat.id,
          sid,
          sess?.current_index ?? 1,
          msg.message_id
        );
        return;
      }

      // Unflag all
      m = /^unflagall:([^:]+)$/.exec(data);
      if (m) {
        const sid: string = m[1];
        await clearAllFlags(sid);
        const sess = await getSessionById(sid);
        await safeAck(botService, q.id, "All flags removed.");
        await showQuestion(
          botService,
          msg.chat.id,
          sid,
          sess?.current_index ?? 1,
          msg.message_id
        );
        return;
      }

      // Ask to abandon exam (confirm)
      m = /^ask:abandon:([^:]+)$/.exec(data);
      if (m) {
        const sid: string = m[1];
        await safeAck(botService, q.id);
        await botService.editMessageReplyMarkup(
          confirmKb(
            "Abandon this exam? Progress will be lost.",
            `do:abandon:${sid}`,
            `reset:${sid}`
          ),
          {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
          }
        );
        return;
      }

      // Do abandon
      m = /^do:abandon:([^:]+)$/.exec(data);
      if (m) {
        const sid: string = m[1];
        await abandonSession(sid);
        await safeAck(botService, q.id, "Exam abandoned.");
        await botService.editMessageText(
          "🛑 This exam was abandoned. Start again with /begin_exam or /practice.",
          {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
          }
        );
        return;
      }

      // Ask to restart practice
      m = /^ask:restart:([^:]+)$/.exec(data);
      if (m) {
        const sid: string = m[1];
        await safeAck(botService, q.id);
        await botService.editMessageReplyMarkup(
          confirmKb(
            "Restart practice with a new set?",
            `do:restart:${sid}`,
            `reset:${sid}`
          ),
          {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
          }
        );
        return;
      }

      // Do restart practice
      m = /^do:restart:([^:]+)$/.exec(data);
      if (m) {
        const sid: string = m[1];
        const newSess = await restartPracticeSession(sid);
        await safeAck(botService, q.id, "Practice restarted.");
        await botService.editMessageText("Practice restarted 📘", {
          chat_id: msg.chat.id,
          message_id: msg.message_id,
        });
        await showQuestion(botService, msg.chat.id, newSess.id, 1);
        return;
      }
    }
  );
}

/* ---------- local keyboards ---------- */

export function resetMenuKb(
  sessionId: string,
  isPractice: boolean,
  isExam: boolean
): TelegramBot.InlineKeyboardMarkup {
  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  rows.push([
    { text: "♻ Clear this answer", callback_data: `resq:${sessionId}` },
  ]);
  rows.push([
    { text: "🧼 Clear ALL answers", callback_data: `ask:resall:${sessionId}` },
  ]);
  rows.push([
    { text: "🚩 Unflag all", callback_data: `unflagall:${sessionId}` },
  ]);
  if (isPractice)
    rows.push([
      {
        text: "🔁 Restart practice",
        callback_data: `ask:restart:${sessionId}`,
      },
    ]);
  if (isExam)
    rows.push([
      { text: "🛑 Abandon exam", callback_data: `ask:abandon:${sessionId}` },
    ]);
  rows.push([{ text: "⬅ Back", callback_data: `close:${sessionId}` }]);
  return { inline_keyboard: rows };
}

function confirmKb(
  question: string,
  yesCb: string,
  noCb: string
): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Yes", callback_data: yesCb },
        { text: "❌ No", callback_data: noCb },
      ],
    ],
  };
}

/* ---------- utils ---------- */

async function safeAck(
  botService: BotService,
  id: string | undefined,
  text?: string,
  showAlert: boolean = false
): Promise<void> {
  if (!id) return;
  try {
    await botService.answerCallbackQuery(
      id,
      text ? { text, show_alert: showAlert } : {}
    );
  } catch {
    /* ignore */
  }
}

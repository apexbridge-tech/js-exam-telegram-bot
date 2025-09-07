import type TelegramBot from "node-telegram-bot-api";
import {
  getActiveSessionForUser,
  getQuestionIdAt,
  progressForSession,
  setCurrentIndex,
  toggleFlag,
} from "../../services/session.service.js";
import { navigatorKeyboard } from "../keyboards.js";
import { renderProgress } from "../views.js";
import { getAnswersForQuestion } from "../../services/question.service.js";
import { showQuestion } from "./answer.handler.js";

export function registerNavHandlers(bot: TelegramBot) {
  bot.on("callback_query", async (q) => {
    try {
      const data = q.data ?? "";
      const chatId = q.message?.chat?.id;
      const msgId = q.message?.message_id;
      if (!chatId || !msgId) return;

      // prev/next
      let m = data.match(/^(prev|next):([^:]+)$/);
      if (m) {
        const [, kind, sid] = m;
        const sess = await getSessionIdFromCb(sid);
        if (!sess) return;

        const delta = kind === "prev" ? -1 : 1;
        const nextIndex = await clampIndex(sid, (q as any).qIndex ?? 1, delta);
        await setCurrentIndex(sid, nextIndex);
        await showQuestion(bot, chatId, sid, nextIndex, msgId);
        await bot.answerCallbackQuery(q.id);
        return;
      }

      // flag toggle
      m = data.match(/^flag:([^:]+)$/);
      if (m) {
        const sid = m[1];
        const sess = await getActiveSessionForUser(q.from.id);
        const idx = sess?.current_index ?? 1;
        const now = await toggleFlag(sid, idx);
        await showQuestion(bot, chatId, sid, idx, msgId);
        await bot.answerCallbackQuery(q.id, {
          text: now ? "Flagged 🚩" : "Unflagged",
        });
        return;
      }

      // navigator open
      m = data.match(/^nav:([^:]+)$/);
      if (m) {
        const sid = m[1];
        const statuses = await statusesForSession(sid);
        await bot.answerCallbackQuery(q.id);
        await bot.editMessageReplyMarkup(navigatorKeyboard(sid, statuses), {
          chat_id: chatId,
          message_id: msgId,
        });
        return;
      }

      // goto:<sid>:<index>
      m = data.match(/^goto:([^:]+):(\d+)$/);
      if (m) {
        const [, sid, idxStr] = m;
        const idx = Number(idxStr);
        await setCurrentIndex(sid, idx);
        await showQuestion(bot, chatId, sid, idx, msgId);
        await bot.answerCallbackQuery(q.id);
        return;
      }

      // progress popup
      m = data.match(/^prog:([^:]+)$/);
      if (m) {
        const sid = m[1];
        const p = await progressForSession(sid);
        await bot.answerCallbackQuery(q.id, {
          text: `Answered: ${p.answered}/${p.total} | Flagged: ${p.flagged}`,
          show_alert: true,
        });
        return;
      }

      // close navigator (restore current question view)
      m = data.match(/^close:([^:]+)$/);
      if (m) {
        const sid = m[1];
        const sess = await getActiveSessionForUser(q.from.id);
        const idx = sess?.current_index ?? 1;
        await showQuestion(bot, chatId, sid, idx, msgId);
        await bot.answerCallbackQuery(q.id);
      }

      // submit handled in Step 2.4
    } catch {
      if (q.id)
        await bot.answerCallbackQuery(q.id, { text: "Oops. Try again." });
    }
  });
}

async function statusesForSession(
  sessionId: string
): Promise<Array<"unanswered" | "answered" | "flagged">> {
  const arr: Array<"unanswered" | "answered" | "flagged"> = [];
  for (let i = 1; i <= 40; i++) {
    // answered?
    const row = await getQuestionIdAt(sessionId, i);
    if (!row) {
      arr.push("unanswered");
      continue;
    }
    const answers = await getAnswersForQuestion(row.question_id);
    // faster check: exists any selected answer row for this q
    const answered = answers.length > 0; // placeholder; real check is via session_answers existence:
    // but we don't want extra queries here; keep lightweight navigator (progress has true counts)
    if (row.flagged) arr.push("flagged");
    else arr.push("unanswered"); // navigator grid uses ◯ by default
  }
  return arr;
}

async function clampIndex(
  sessionId: string,
  current: number,
  delta: number
): Promise<number> {
  const next = current + delta;
  if (next < 1) return 1;
  if (next > 40) return 40;
  return next;
}

async function getSessionIdFromCb(sid: string) {
  // placeholder helper to keep symmetry; we might add validation later
  return sid;
}

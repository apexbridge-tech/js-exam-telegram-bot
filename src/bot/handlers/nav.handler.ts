import type TelegramBot from "node-telegram-bot-api";
import {
  getActiveSessionForUser,
  getQuestionIdAt,
  progressForSession,
  setCurrentIndex,
  toggleFlag,
  sessionStatuses,
  getSessionById,
  finalizeAndSubmit,
  remainingSeconds,
} from "../../services/session.service.js";
import { navigatorKeyboard } from "../keyboards.js";
import { renderProgress } from "../views.js";
import { showQuestion } from "./answer.handler.js";
import { humanTimeLeft } from "../../services/timer.service.js";
import { renderResultReport } from "../../services/report.service.js";
import { PASS_PERCENT } from "../../domain/policy.js";

export function registerNavHandlers(bot: TelegramBot): void {
  bot.on(
    "callback_query",
    async (q: TelegramBot.CallbackQuery): Promise<void> => {
      const data: string = q.data ?? "";
      const chatId: number | undefined = q.message?.chat?.id;
      const msgId: number | undefined = q.message?.message_id;
      if (!chatId || !msgId) return;

      // prev/next  prev:<sid>:<idx>  | next:<sid>:<idx>
      let m: RegExpMatchArray | null = data.match(
        /^(prev|next):([^:]+):(\d+)$/
      );
      if (m) {
        const kind: "prev" | "next" = m[1] as "prev" | "next";
        const sid: string = m[2];
        const idx: number = Number(m[3]);
        const nextIndex: number =
          kind === "prev" ? Math.max(1, idx - 1) : Math.min(40, idx + 1);
        await setCurrentIndex(sid, nextIndex);
        await showQuestion(bot, chatId, sid, nextIndex, msgId);
        await bot.answerCallbackQuery(q.id);
        return;
      }

      // flag:<sid>:<idx>
      m = data.match(/^flag:([^:]+):(\d+)$/);
      if (m) {
        const sid: string = m[1];
        const idx: number = Number(m[2]);
        const now: 0 | 1 = await toggleFlag(sid, idx);
        await showQuestion(bot, chatId, sid, idx, msgId);
        await bot.answerCallbackQuery(q.id, {
          text: now ? "Flagged 🚩" : "Unflagged",
        });
        return;
      }

      // nav:<sid>
      m = data.match(/^nav:([^:]+)$/);
      if (m) {
        const sid: string = m[1];
        const statuses = await sessionStatuses(sid);
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
        const sid: string = m[1];
        const idx: number = Number(m[2]);
        await setCurrentIndex(sid, idx);
        await showQuestion(bot, chatId, sid, idx, msgId);
        await bot.answerCallbackQuery(q.id);
        return;
      }

      // prog:<sid> — popup with time left
      m = data.match(/^prog:([^:]+)$/);
      if (m) {
        const sid: string = m[1];
        const p = await progressForSession(sid);
        const secs: number | null = await remainingSeconds(sid);
        const t: string = secs === null ? "∞" : humanTimeLeft(secs);
        await bot.answerCallbackQuery(q.id, {
          text: `Answered: ${p.answered}/${p.total} | Flagged: ${p.flagged} | ⏱ ${t}`,
          show_alert: true,
        });
        return;
      }

      // close:<sid> — restore current question
      m = data.match(/^close:([^:]+)$/);
      if (m) {
        const sid: string = m[1];
        const sess = await getSessionById(sid);
        const idx: number = sess?.current_index ?? 1;
        await showQuestion(bot, chatId, sid, idx, msgId);
        await bot.answerCallbackQuery(q.id);
        return;
      }

      // submit:<sid>
      m = data.match(/^submit:([^:]+)$/);
      if (m) {
        const sid: string = m[1];
        const { result, passed } = await finalizeAndSubmit(sid, PASS_PERCENT);

        const failedCooldownDays = 15;
        const nextEligible: string | null = !passed
          ? new Date(Date.now() + failedCooldownDays * 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10)
          : null;

        const report = renderResultReport(
          result,
          PASS_PERCENT,
          failedCooldownDays,
          nextEligible
        );
        const reportText: string = `${report.headline}\n\n${report.sections}\n\n${report.detail}\n\n${report.footer}`;

        await bot.editMessageText(reportText, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "MarkdownV2",
        });
        await bot.answerCallbackQuery(q.id);
        return;
      }
    }
  );
}

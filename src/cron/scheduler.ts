import cron from "node-cron";
import type TelegramBot from "node-telegram-bot-api";
import type sqlite3 from "sqlite3";
import { getDb } from "../db/sqlite.js";
import {
  finalizeAndSubmit,
  remainingSeconds,
  setWarnSent,
  userAndChatForSession,
} from "../services/session.service.js";
import { humanTimeLeft } from "../services/timer.service.js";

interface ScanRow {
  id: string;
  warn10_sent: 0 | 1;
  warn5_sent: 0 | 1;
  warn1_sent: 0 | 1;
}

export function startScheduler(bot: TelegramBot, passPercent: number): void {
  // Every 30s: scan active exam sessions
  cron.schedule("*/30 * * * * *", async () => {
    const toScan: ScanRow[] = await listActiveSessions();
    for (const s of toScan) {
      const rem: number | null = await remainingSeconds(s.id);
      if (rem === null) continue;

      const dest = await userAndChatForSession(s.id);
      if (!dest) continue;
      const chatId: number = dest.tg_user_id;

      if (rem <= 0) {
        // Auto-submit
        const { result } = await finalizeAndSubmit(s.id, passPercent);
        await bot.sendMessage(
          chatId,
          `⏰ Time is up. Your exam was auto-submitted.\nScore: ${result.correct}/${result.total} - ${result.percent}%`,
          { parse_mode: "MarkdownV2" }
        );
        continue;
      }
      if (rem <= 60 && s.warn1_sent === 0) {
        await setWarnSent(s.id, 1);
        await bot.sendMessage(chatId, "⏱ *1 minute* remaining!", {
          parse_mode: "MarkdownV2",
        });
        continue;
      }
      if (rem <= 300 && s.warn5_sent === 0) {
        await setWarnSent(s.id, 5);
        await bot.sendMessage(chatId, "⏱ *5 minutes* remaining.", {
          parse_mode: "MarkdownV2",
        });
        continue;
      }
      if (rem <= 600 && s.warn10_sent === 0) {
        await setWarnSent(s.id, 10);
        await bot.sendMessage(chatId, "⏱ *10 minutes* remaining.", {
          parse_mode: "MarkdownV2",
        });
        continue;
      }
    }
  });
}

function listActiveSessions(): Promise<ScanRow[]> {
  const db: sqlite3.Database = getDb();
  return new Promise<ScanRow[]>((resolve, reject) => {
    db.all(
      `SELECT id, warn10_sent, warn5_sent, warn1_sent
       FROM exam_sessions
       WHERE status='active' AND mode='exam' AND expires_at IS NOT NULL`,
      [],
      (err: Error | null, rows: ScanRow[]) =>
        err ? reject(err) : resolve(rows)
    );
  });
}

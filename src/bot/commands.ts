import type sqlite3 from "sqlite3";
import type TelegramBot from "node-telegram-bot-api";
import { upsertUser } from "../services/user.service.js";
import {
  getActiveSessionForUser,
  createExamSession,
  setCurrentIndex,
  progressForSession,
} from "../services/session.service.js";
import { renderProgress } from "./views.js";
import { showQuestion } from "./handlers/answer.handler.js";
import { getDb } from "../db/sqlite.js";

let cachedExamId: number | null = null;

function fetchExamIdByCode(code: string): Promise<number> {
  const db: sqlite3.Database = getDb();
  return new Promise<number>((resolve, reject) => {
    db.get(
      `SELECT id FROM exams WHERE code=? LIMIT 1`,
      [code],
      (err: Error | null, row: { id: number } | undefined): void => {
        if (err) {
          reject(err);
          return;
        }
        if (!row) {
          reject(new Error(`Exam code not found: ${code}`));
          return;
        }
        resolve(row.id);
      }
    );
  });
}

async function examId(): Promise<number> {
  if (cachedExamId !== null) return cachedExamId;
  const id: number = await fetchExamIdByCode("JSA-41-01");
  cachedExamId = id;
  return id;
}

export function registerCommands(bot: TelegramBot): void {
  bot.onText(/^\/start\b/i, async (msg: TelegramBot.Message): Promise<void> => {
    const tgId: number = msg.from?.id ?? 0;
    const firstName: string | undefined = msg.from?.first_name;
    const lastName: string | undefined = msg.from?.last_name;
    const username: string | undefined = msg.from?.username;

    const userId: number = await upsertUser({
      tg_user_id: tgId,
      first_name: firstName ?? null,
      last_name: lastName ?? null,
      username: username ?? null,
    });

    const sess = await getActiveSessionForUser(userId);
    const hint: string = sess
      ? "\nResume your active exam with /progress or continue below."
      : "\nStart your exam with /begin_exam.";

    const greetingName: string = firstName ?? "there";
    const text: string =
      `Welcome, ${greetingName}! 👋\nThis bot simulates *JSA-41-01*.\n\n` +
      `Commands:\n• /begin_exam — start a new exam 🧪\n• /progress — current status 📊\n` +
      `• /submit — submit (coming in Step 2.4)\n${hint}`;

    await bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
  });

  bot.onText(
    /^\/begin_exam\b/i,
    async (msg: TelegramBot.Message): Promise<void> => {
      const tgId: number = msg.from?.id ?? 0;
      const firstName: string | undefined = msg.from?.first_name;
      const lastName: string | undefined = msg.from?.last_name;
      const username: string | undefined = msg.from?.username;

      const userId: number = await upsertUser({
        tg_user_id: tgId,
        first_name: firstName ?? null,
        last_name: lastName ?? null,
        username: username ?? null,
      });

      const existing = await getActiveSessionForUser(userId);
      if (existing) {
        await bot.sendMessage(
          msg.chat.id,
          "You already have an active exam. Showing your current question…"
        );
        await showQuestion(
          bot,
          msg.chat.id,
          existing.id,
          existing.current_index
        );
        return;
      }

      const eid: number = await examId();
      const sess = await createExamSession(userId, eid, "exam");
      await bot.sendMessage(
        msg.chat.id,
        "Exam started! ⏱ 60 minutes.\nGood luck!"
      );
      await showQuestion(bot, msg.chat.id, sess.id, 1);
    }
  );

  bot.onText(
    /^\/question_(\d+)\b/i,
    async (
      msg: TelegramBot.Message,
      match: RegExpExecArray | null
    ): Promise<void> => {
      const tgId: number = msg.from?.id ?? 0;
      const firstName: string | undefined = msg.from?.first_name;
      const lastName: string | undefined = msg.from?.last_name;
      const username: string | undefined = msg.from?.username;

      const userId: number = await upsertUser({
        tg_user_id: tgId,
        first_name: firstName ?? null,
        last_name: lastName ?? null,
        username: username ?? null,
      });

      const sess = await getActiveSessionForUser(userId);
      if (!sess) {
        await bot.sendMessage(
          msg.chat.id,
          "No active session. Use /begin_exam to start."
        );
        return;
      }

      const rawIndex: number = match ? Number(match[1]) : NaN;
      const idx: number = Math.max(
        1,
        Math.min(40, Number.isFinite(rawIndex) ? rawIndex : 1)
      );
      await setCurrentIndex(sess.id, idx);
      await showQuestion(bot, msg.chat.id, sess.id, idx);
    }
  );

  bot.onText(/^\/flag\b/i, async (msg: TelegramBot.Message): Promise<void> => {
    await bot.sendMessage(
      msg.chat.id,
      "Use the 🚩 Flag button under the question to toggle flags."
    );
  });

  bot.onText(
    /^\/progress\b/i,
    async (msg: TelegramBot.Message): Promise<void> => {
      const tgId: number = msg.from?.id ?? 0;
      const firstName: string | undefined = msg.from?.first_name;
      const lastName: string | undefined = msg.from?.last_name;
      const username: string | undefined = msg.from?.username;

      const userId: number = await upsertUser({
        tg_user_id: tgId,
        first_name: firstName ?? null,
        last_name: lastName ?? null,
        username: username ?? null,
      });

      const sess = await getActiveSessionForUser(userId);
      if (!sess) {
        await bot.sendMessage(
          msg.chat.id,
          "No active session. Use /begin_exam to start."
        );
        return;
      }

      const p = await progressForSession(sess.id);
      const messageText: string = renderProgress(
        p.answered,
        p.flagged,
        p.total
      );
      await bot.sendMessage(msg.chat.id, messageText, {
        parse_mode: "Markdown",
      });
      await showQuestion(bot, msg.chat.id, sess.id, sess.current_index);
    }
  );

  bot.onText(
    /^\/submit\b/i,
    async (msg: TelegramBot.Message): Promise<void> => {
      await bot.sendMessage(
        msg.chat.id,
        "Submit & scoring comes in *Step 2.4*. For now, continue answering or use /progress.",
        { parse_mode: "Markdown" }
      );
    }
  );
}

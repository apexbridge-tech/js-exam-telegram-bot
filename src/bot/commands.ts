import type sqlite3 from "sqlite3";
import type TelegramBot from "node-telegram-bot-api";
import { upsertUser, getUserById } from "../services/user.service.js";
import {
  getActiveSessionForUser,
  createExamSession,
  setCurrentIndex,
  progressForSession,
  finalizeAndSubmit,
  remainingSeconds,
} from "../services/session.service.js";
import { renderProgress } from "./views.js";
import { showQuestion } from "./handlers/answer.handler.js";
import { getDb } from "../db/sqlite.js";
import { PASS_PERCENT, EXAM_DURATION_MIN } from "../domain/policy.js";
import { humanTimeLeft } from "../services/timer.service.js";
import { renderResultReport } from "../services/report.service.js";

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

function canRetake(
  nowMs: number,
  lastFailedAt: string | null,
  cooldownDays: number
): { ok: boolean; nextIso: string | null } {
  if (!lastFailedAt) return { ok: true, nextIso: null };
  const lastMs: number = Date.parse(lastFailedAt + "Z"); // stored in UTC string format
  const waitMs: number = cooldownDays * 24 * 60 * 60 * 1000;
  const nextMs: number = lastMs + waitMs;
  return nowMs >= nextMs
    ? { ok: true, nextIso: null }
    : { ok: false, nextIso: new Date(nextMs).toISOString().slice(0, 10) };
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
      : "\nStart your exam with /begin_exam or try /practice (untimed).";

    const greetingName: string = firstName ?? "there";
    const text: string =
      `Welcome, ${greetingName}! 👋\nThis bot simulates *JSA-41-01*.\n\n` +
      `Commands:\n• /begin_exam — start a new timed exam 🧪\n• /practice — start untimed practice 📘\n` +
      `• /progress — current status 📊\n• /submit — submit your exam ✅\n` +
      `Timer: ${EXAM_DURATION_MIN} minutes (with 10/5/1 min warnings).${hint}`;

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

      // Cooldown check
      const userRow = await getUserById(userId);
      const { ok, nextIso } = canRetake(
        Date.now(),
        userRow?.last_failed_at ?? null,
        15
      );
      if (!ok) {
        await bot.sendMessage(
          msg.chat.id,
          `⛔ You failed the last attempt. You can retake after 15 days: *${nextIso}*`,
          { parse_mode: "Markdown" }
        );
        return;
      }

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
    /^\/practice\b/i,
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
          "You already have an active session. Use /progress."
        );
        return;
      }

      const eid: number = await examId();
      const sess = await createExamSession(userId, eid, "practice");
      await bot.sendMessage(msg.chat.id, "Practice mode started 📘 (untimed).");
      await showQuestion(bot, msg.chat.id, sess.id, 1);
    }
  );

  // /question_X jump
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
          "No active session. Use /begin_exam or /practice."
        );
        return;
      }

      const p = await progressForSession(sess.id);
      const secs: number | null = await remainingSeconds(sess.id);
      const text: string = renderProgress(
        p.answered,
        p.flagged,
        p.total,
        secs === null ? undefined : humanTimeLeft(secs)
      );
      await bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
      await showQuestion(bot, msg.chat.id, sess.id, sess.current_index);
    }
  );

  bot.onText(
    /^\/submit\b/i,
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
        await bot.sendMessage(msg.chat.id, "No active exam to submit.");
        return;
      }
      if (sess.mode !== "exam") {
        await bot.sendMessage(
          msg.chat.id,
          "Practice mode has no submission. Keep practicing or start /begin_exam."
        );
        return;
      }

      const { result, passed } = await finalizeAndSubmit(sess.id, PASS_PERCENT);
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

      await bot.sendMessage(msg.chat.id, reportText, {
        parse_mode: "Markdown",
      });
      // Immediately open review on Q1
      await showQuestion(bot, msg.chat.id, sess.id, 1);
    }
  );

  bot.onText(/^\/reset\b/i, async (msg: TelegramBot.Message): Promise<void> => {
    const tgId: number = msg.from?.id ?? 0;
    const userId: number = await upsertUser({
      tg_user_id: tgId,
      first_name: msg.from?.first_name ?? null,
      last_name: msg.from?.last_name ?? null,
      username: msg.from?.username ?? null,
    });

    const sess = await getActiveSessionForUser(userId);
    if (!sess) {
      await bot.sendMessage(
        msg.chat.id,
        "No active session to reset. Use /begin_exam or /practice."
      );
      return;
    }
    // Reuse the inline button flow (same as tapping 🧹 Reset)
    await bot.sendMessage(msg.chat.id, "Reset options:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Open reset menu 🧹", callback_data: `reset:${sess.id}` }],
        ],
      },
    });
  });
}

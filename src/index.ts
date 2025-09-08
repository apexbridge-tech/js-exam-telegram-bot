import { config } from "./config.js";
import { logger } from "./logger.js";
import { initDb } from "./db/sqlite.js";
import { seedBaseExam } from "./db/seed.js";
import { ensureQuestionsLoaded } from "./db/load-questions.js";
import { createBot } from "./bot/bot.js";
import { startScheduler } from "./cron/scheduler.js";
import { PASS_PERCENT } from "./domain/policy.js";

async function main(): Promise<void> {
  await initDb(config.DB_FILE);
  await seedBaseExam();
  await ensureQuestionsLoaded(50);

  const bot = await createBot(config.BOT_TOKEN);
  startScheduler(bot, PASS_PERCENT);

  bot.on("polling_error", (err) =>
    logger.error("Telegram polling error", { err })
  );
  bot.on("error", (err) => logger.error("Telegram error", { err }));

  logger.info("Bot started. Use /begin_exam or /practice.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

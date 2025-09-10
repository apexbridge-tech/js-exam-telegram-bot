import { config } from "./config.js";
import { logger } from "./logger.js";
import { initDb } from "./db/sqlite.js";
import { seedBaseExam } from "./db/seed.js";
import { createBot } from "./bot/bot.js";
import { startScheduler } from "./cron/scheduler.js";
import { PASS_PERCENT } from "./domain/policy.js";
import { syncQuestionMetaFromJson } from "./db/load-questions.js";
import { installGlobalErrorHandlers } from "./infra/global-errors.js";

async function main(): Promise<void> {
  await initDb(config.DB_FILE);
  await seedBaseExam();

  const { bot, services } = await createBot(config.BOT_TOKEN);

  startScheduler(bot, PASS_PERCENT);
  installGlobalErrorHandlers();

  bot.on("polling_error", (err) =>
    logger.error("Telegram polling error", { err })
  );
  bot.on("error", (err) => logger.error("Telegram error", { err }));

  const stats = await syncQuestionMetaFromJson(config.QUESTIONS_FILE);
  logger.info(
    `Meta sync: scanned=${stats.scanned}, updated=${stats.updated}, missing=${stats.missing}`
  );

  logger.info("Bot started. Use /begin_exam or /practice.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { config } from "./config.js";
import { logger } from "./logger.js";
import { initDb } from "./db/sqlite.js";
import { seedBaseExam } from "./db/seed.js";
import { ensureQuestionsLoaded } from "./db/load-questions.js";
import { createBot } from "./bot/bot.js";

async function main() {
  await initDb(config.DB_FILE);
  await seedBaseExam();
  await ensureQuestionsLoaded(50);

  const bot = createBot(config.BOT_TOKEN);
  bot.on("polling_error", (err) =>
    logger.error("Telegram polling error", { err })
  );
  bot.on("error", (err) => logger.error("Telegram error", { err }));

  logger.info("Bot started. Use /begin_exam to start your test.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

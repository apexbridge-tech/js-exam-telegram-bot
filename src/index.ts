import { config } from "./config.js";
import { logger } from "./logger.js";
import { initDb } from "./db/sqlite.js";
import TelegramBot from "node-telegram-bot-api";

async function main() {
  await initDb(config.DB_FILE);

  const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

  bot.onText(/^\/start\b/i, async (msg: TelegramBot.Message) => {
    try {
      const name = msg.from?.first_name ?? "there";
      const text =
        `Welcome, ${name}! 👋\n` +
        `This bot simulates the *JSA-41-01* JavaScript exam.\n\n` +
        `Commands:\n` +
        `• /begin_exam — start the timed exam 🧪 (will enforce cooldowns later)\n` +
        `• /progress — see your current progress 📊\n` +
        `• /submit — submit your exam ✅\n` +
        `• Practice mode will arrive soon 📘\n\n` +
        `You’re on Step 1 (bootstrap). Core exam engine comes next.`;
      await bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
    } catch (err) {
      logger.error("Failed to handle /start", { err });
    }
  });

  bot.on("polling_error", (err) =>
    logger.error("Telegram polling error", { err })
  );
  bot.on("error", (err) => logger.error("Telegram error", { err }));

  logger.info("Bot started (ESM). Send /start in Telegram to test.");
}

main().catch((e) => {
  logger.error("Fatal startup error", { e });
  process.exit(1);
});

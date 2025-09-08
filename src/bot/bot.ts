import TelegramBot from "node-telegram-bot-api";
import { registerCommands } from "./commands.js";
import { registerAnswerHandlers } from "./handlers/answer.handler.js";
import { registerNavHandlers } from "./handlers/nav.handler.js";
import { logger } from "../logger.js";

export async function createBot(token: string): Promise<TelegramBot> {
  const bot = new TelegramBot(token, {
    polling: {
      autoStart: false,
      params: {
        timeout: 30,
        limit: 100,
        allowed_updates: ["message", "callback_query"],
      },
    },
  });

  // Keep queued updates so /start sent before the process came up still arrives:
  await bot.deleteWebHook(); // ⬅️ no options (equivalent to not dropping pending updates)
  // Alternatively: await bot.deleteWebHook({ drop_pending_updates: false });

  registerCommands(bot);
  registerAnswerHandlers(bot);
  registerNavHandlers(bot);

  await bot.startPolling({ restart: true }); // start long-polling
  logger.info("Polling started.");

  // Optional: quick sanity log
  const me = await bot.getMe();
  logger.info(`Logged in as @${me.username}`);

  return bot;
}

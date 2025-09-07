import TelegramBot from "node-telegram-bot-api";
import { registerCommands } from "./commands.js";
import { registerAnswerHandlers } from "./handlers/answer.handler.js";
import { registerNavHandlers } from "./handlers/nav.handler.js";

export function createBot(token: string) {
  const bot = new TelegramBot(token, { polling: true });
  registerCommands(bot);
  registerAnswerHandlers(bot);
  registerNavHandlers(bot);
  return bot;
}

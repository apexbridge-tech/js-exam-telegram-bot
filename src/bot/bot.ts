import TelegramBot from "node-telegram-bot-api";
import { registerCommands } from "./commands.js";
import { registerAnswerHandlers } from "./handlers/answer.handler.js";
import { registerNavHandlers } from "./handlers/nav.handler.js";
import { registerResetHandlers } from "./handlers/reset.handler.js";
import { logger } from "../logger.js";
import { Services } from "../services/services.js";
import { BaseAnswerProcessor } from "./handlers/processors/baseAnswerProcessor.js";
import { createBotService } from "../services/bot.service.js";
import { questionService } from "../services/question.service.js";
import { reportService } from "../services/report.service.js";
import { sessionService } from "../services/session.service.js";
import { userService } from "../services/user.service.js";

export async function createBot(
  token: string
): Promise<{ bot: TelegramBot; services: Services }> {
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
  const services: Services = {
    userService,
    questionService,
    sessionService,
    reportService,
    botService: createBotService(bot),
  };

  const answerProcessors: Array<BaseAnswerProcessor> = [
    new (
      await import("./handlers/processors/answerProcessor.js")
    ).AnswerProcessor(services.botService),
    new (
      await import("./handlers/processors/toggleProcessor.js")
    ).ToggleProcessor(services.botService),
    new (
      await import("./handlers/processors/revealProcessor.js")
    ).RevealProcessor(services.botService),
    new (
      await import("./handlers/processors/explainProcessor.js")
    ).ExplainProcessor(services.botService),
    new (
      await import("./handlers/processors/learnProcessor.js")
    ).LearnProcessor(services.botService),
  ];

  registerCommands(services);
  registerAnswerHandlers(services.botService, answerProcessors);
  registerNavHandlers(services.botService);
  registerResetHandlers(services.botService);

  await bot.startPolling({ restart: true }); // start long-polling
  logger.info("Polling started.");

  // Optional: quick sanity log
  const me = await bot.getMe();
  logger.info(`Logged in as @${me.username}`);

  return { bot, services };
}

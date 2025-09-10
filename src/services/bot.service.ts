import TelegramBot from "node-telegram-bot-api";
import { logger } from "../logger.js";

export interface BotService {
  on(
    event: string,
    listener: (q: TelegramBot.CallbackQuery) => Promise<void>
  ): void;
  sendMessage(
    chatId: TelegramBot.ChatId,
    text: string,
    options?: TelegramBot.SendMessageOptions
  ): Promise<TelegramBot.Message | undefined>;

  editMessageText(
    text: string,
    options?: TelegramBot.EditMessageTextOptions
  ): Promise<TelegramBot.Message | boolean>;

  answerCallbackQuery(
    callbackQueryId: string,
    options?: Partial<TelegramBot.AnswerCallbackQueryOptions>
  ): Promise<boolean>;

  editMessageReplyMarkup(
    replyMarkup: TelegramBot.InlineKeyboardMarkup,
    options?: TelegramBot.EditMessageReplyMarkupOptions
  ): Promise<TelegramBot.Message | boolean>;

  onText(
    regexp: RegExp,
    callback: (msg: TelegramBot.Message, match: RegExpExecArray | null) => void
  ): void;
}

export function createBotService(bot: TelegramBot): BotService {
  return {
    sendMessage: async (chatId, text, options) => {
      try {
        return await bot.sendMessage(chatId, text, options);
      } catch (error) {
        logger.error("Error sending message:", error);
        return undefined;
      }
    },
    editMessageText: async (text, options) => {
      try {
        return await bot.editMessageText(text, options);
      } catch (error) {
        // If the message is not modified, treat it as a success case
        if (
          error instanceof Error &&
          error.message.includes("message is not modified")
        ) {
          return true;
        }

        logger.error("Error editing message text:", error);
        return false;
      }
    },
    answerCallbackQuery: async (callbackQueryId, options) => {
      return await bot.answerCallbackQuery(callbackQueryId, options);
    },
    editMessageReplyMarkup: async (replyMarkup, options) => {
      return await bot.editMessageReplyMarkup(replyMarkup, options);
    },
    onText: (regexp, callback) => {
      bot.onText(regexp, callback);
    },
    on: (event, listener) => {
      bot.on(event, listener);
    },
  };
}

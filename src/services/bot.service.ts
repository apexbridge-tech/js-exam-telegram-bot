import TelegramBot from "node-telegram-bot-api";

export interface BotService {
  sendMessage(
    chatId: TelegramBot.ChatId,
    text: string,
    options?: TelegramBot.SendMessageOptions
  ): Promise<TelegramBot.Message>;

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

const ensureMarkdownCompatible = (text: string) => {
  // Replace potentially problematic characters
  return text;
  //    .replace(/•/g, "-") // Replace bullets with hyphens
  //    .replace(/—/g, "-") // Replace em dashes with hyphens
  //    .replace(/"/g, '"') // Replace smart quotes with straight quotes
  //    .replace(/"/g, '"') // Replace smart quotes with straight quotes
  //    .replace(/'/g, "'") // Replace smart quotes with straight quotes
  //    .replace(/'/g, "'"); // Replace smart quotes with straight quotes
};

export function createBotService(bot: TelegramBot): BotService {
  return {
    sendMessage: async (chatId, text, options) => {
      try {
        return await bot.sendMessage(chatId, text, options);
      } catch (error) {
        throw error;
      }
    },
    editMessageText: async (text, options) => {
      return await bot.editMessageText(text, options);
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
  };
}

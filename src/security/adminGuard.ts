import type TelegramBot from "node-telegram-bot-api";
import { isAdmin } from "./admin.js";

export async function isAdminGuard(
  tgUserId: number | undefined,
  chatId?: number,
  bot?: TelegramBot,
  dbService?: { isAdminByDb(tgUserId: number): Promise<boolean> }
): Promise<boolean> {
  if (isAdmin(tgUserId)) return true;
  if (dbService && tgUserId && (await dbService.isAdminByDb(tgUserId)))
    return true;
  // if (bot && chatId && await isChatAdmin(bot, chatId, tgUserId)) return true;
  return false;
}

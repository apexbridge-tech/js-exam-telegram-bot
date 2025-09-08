import type { AnswerRow } from "../services/question.service.js";
import type TelegramBot from "node-telegram-bot-api";

export function answersKeyboardSingle(
  sessionId: string,
  questionId: number,
  qIndex: number,
  answers: AnswerRow[],
  selected: number | null
): TelegramBot.InlineKeyboardMarkup {
  const rows: TelegramBot.InlineKeyboardButton[][] = answers.map((a) => [
    {
      text: (selected === a.id ? "✅ " : "▫️ ") + trim(a.text, 40),
      callback_data: `ans:${sessionId}:${questionId}:${qIndex}:${a.id}`,
    },
  ]);
  return { inline_keyboard: rows };
}

export function answersKeyboardMulti(
  sessionId: string,
  questionId: number,
  qIndex: number,
  answers: AnswerRow[],
  selected: Set<number>
): TelegramBot.InlineKeyboardMarkup {
  const rows: TelegramBot.InlineKeyboardButton[][] = answers.map((a) => [
    {
      text: (selected.has(a.id) ? "✅ " : "⬜ ") + trim(a.text, 40),
      callback_data: `tog:${sessionId}:${questionId}:${qIndex}:${a.id}`,
    },
  ]);
  return { inline_keyboard: rows };
}

export function navControls(opts: {
  sessionId: string;
  qIndex: number;
  total: number;
  flagged: boolean;
  showSubmit: boolean;
  showFlag: boolean;
}): TelegramBot.InlineKeyboardMarkup {
  const left: TelegramBot.InlineKeyboardButton = {
    text: "◀ Prev",
    callback_data: `prev:${opts.sessionId}:${opts.qIndex}`,
  };
  const right: TelegramBot.InlineKeyboardButton = {
    text: "Next ▶",
    callback_data: `next:${opts.sessionId}:${opts.qIndex}`,
  };
  const flagBtn: TelegramBot.InlineKeyboardButton = {
    text: opts.flagged ? "🚩 Unflag" : "🚩 Flag",
    callback_data: `flag:${opts.sessionId}:${opts.qIndex}`,
  };
  const navBtn: TelegramBot.InlineKeyboardButton = {
    text: "🧭 Navigator",
    callback_data: `nav:${opts.sessionId}`,
  };
  const progBtn: TelegramBot.InlineKeyboardButton = {
    text: "📊 Progress",
    callback_data: `prog:${opts.sessionId}`,
  };
  const submitBtn: TelegramBot.InlineKeyboardButton = {
    text: "✅ Submit",
    callback_data: `submit:${opts.sessionId}`,
  };

  const row1: TelegramBot.InlineKeyboardButton[] = [left];
  if (opts.showFlag) row1.push(flagBtn);
  row1.push(right);

  const row2: TelegramBot.InlineKeyboardButton[] = [navBtn, progBtn];
  if (opts.showSubmit) row2.push(submitBtn);

  return { inline_keyboard: [row1, row2] };
}

export function navigatorKeyboard(
  sessionId: string,
  statuses: Array<"unanswered" | "answered" | "flagged">
): TelegramBot.InlineKeyboardMarkup {
  const kb: TelegramBot.InlineKeyboardButton[][] = [];
  const legend = (
    st: "unanswered" | "answered" | "flagged",
    i: number
  ): string =>
    (st === "flagged" ? "🚩" : st === "answered" ? "●" : "◯") + String(i + 1);

  for (let r = 0; r < 5; r++) {
    const row: TelegramBot.InlineKeyboardButton[] = [];
    for (let c = 0; c < 8; c++) {
      const i: number = r * 8 + c;
      const st = statuses[i] ?? "unanswered";
      row.push({
        text: legend(st, i),
        callback_data: `goto:${sessionId}:${i + 1}`,
      });
    }
    kb.push(row);
  }
  kb.push([{ text: "Close", callback_data: `close:${sessionId}` }]);
  return { inline_keyboard: kb };
}

function trim(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

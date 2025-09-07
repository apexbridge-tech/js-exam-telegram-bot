import type { AnswerRow } from "../services/question.service.js";

export function answersKeyboardSingle(
  sessionId: string,
  questionId: number,
  answers: AnswerRow[],
  selected: number | null
) {
  const rows = answers.map((a) => [
    {
      text: (selected === a.id ? "✅ " : "▫️ ") + trim(a.text, 40),
      callback_data: `ans:${sessionId}:${questionId}:${a.id}`,
    },
  ]);
  return { inline_keyboard: rows };
}

export function answersKeyboardMulti(
  sessionId: string,
  questionId: number,
  answers: AnswerRow[],
  selected: Set<number>
) {
  const rows = answers.map((a) => [
    {
      text: (selected.has(a.id) ? "✅ " : "⬜ ") + trim(a.text, 40),
      callback_data: `tog:${sessionId}:${questionId}:${a.id}`,
    },
  ]);
  // Multi doesn't need an explicit Save; toggles are persisted immediately.
  return { inline_keyboard: rows };
}

export function navControls(
  sessionId: string,
  qIndex: number,
  total: number,
  flagged: boolean
) {
  return {
    inline_keyboard: [
      [
        { text: "◀ Prev", callback_data: `prev:${sessionId}` },
        {
          text: flagged ? "🚩 Unflag" : "🚩 Flag",
          callback_data: `flag:${sessionId}`,
        },
        { text: "Next ▶", callback_data: `next:${sessionId}` },
      ],
      [
        { text: "🧭 Navigator", callback_data: `nav:${sessionId}` },
        { text: "📊 Progress", callback_data: `prog:${sessionId}` },
        { text: "✅ Submit", callback_data: `submit:${sessionId}` },
      ],
    ],
  };
}

export function navigatorKeyboard(
  sessionId: string,
  statuses: Array<"unanswered" | "answered" | "flagged">
) {
  // grid 8 columns x 5 rows (1..40)
  const kb: any[] = [];
  const legend = (st: string, i: number) =>
    (st === "flagged" ? "🚩" : st === "answered" ? "●" : "◯") + String(i + 1);

  for (let r = 0; r < 5; r++) {
    const row: any[] = [];
    for (let c = 0; c < 8; c++) {
      const i = r * 8 + c; // 0-based
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

function trim(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

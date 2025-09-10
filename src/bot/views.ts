import type { QuestionRow } from "../services/question.service.js";

export function renderQuestionHeader(
  qIndex: number,
  total: number,
  section: string,
  type: "single" | "multi"
): string {
  const kind = type === "single" ? "Single choice" : "Multiple choice";
  return `*Q ${qIndex}/${total}*  ·  _${section}_  ·  ${kind}`;
}

export function renderQuestionBody(q: QuestionRow): string {
  const code = q.code_snippet
    ? `\n\`\`\`js\n${q.code_snippet}\n\`\`\`\n`
    : "\n";
  return `${escapeMd(q.text)}${code}`;
}

export function renderProgress(
  answered: number,
  flagged: number,
  total: number,
  timeLeft?: string
): string {
  const notAnswered = total - answered;
  const time = timeLeft ? `\n⏱ *Time left:* ${timeLeft}` : "";
  return `*Progress*\n● Answered: *${answered}*\n◯ Unanswered: *${notAnswered}*\n🚩 Flagged: *${flagged}*${time}`;
}

function renderReviewAnswers(
  options: Array<{ text: string; correct: boolean; chosen: boolean }>
): string {
  const lines: string[] = ["*Your answers:*"];
  for (const o of options) {
    const mark: string =
      o.correct && o.chosen
        ? "✅"
        : o.correct && !o.chosen
        ? "☑️"
        : !o.correct && o.chosen
        ? "❌"
        : "▫️";
    lines.push(`${mark} ${escapeMd(o.text)}`);
  }
  return lines.join("\n");
}

export function renderReviewAnswersWithLetters(
  items: Array<{ text: string; correct: boolean; chosen: boolean }>
): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return items
    .map((it, i) => {
      // Legend: ✅ chosen & correct, ✔️ correct (not chosen), ❌ chosen (wrong), ▫️ untouched
      const mark =
        it.correct && it.chosen
          ? "✅"
          : it.correct && !it.chosen
          ? "✔️"
          : !it.correct && it.chosen
          ? "❌"
          : "▫️";
      return `${mark} ${letters[i]}. ${escapeMd(it.text)}`;
    })
    .join("\n");
}

export function escapeMd(s: string): string {
  return s.replace(/([_*[\]()~`>#+-=|{}.!])/g, "\\$1");
}

export function renderAnswersList(answers: Array<{ text: string }>): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lines = answers.map((a, i) => `${letters[i]}. ${escapeMd(a.text)}`);
  return lines.join("\n");
}

export function renderAnswersListWithState(
  answers: Array<{ id: number; text: string }>,
  selected: Set<number>
): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return answers
    .map(
      (a, i) =>
        `${selected.has(a.id) ? "✅" : "◻️"} ${letters[i]}. ${escapeMd(a.text)}`
    )
    .join("\n");
}

// Escape for Telegram MarkdownV2 (NOT legacy)
// Special set: _ * [ ] ( ) ~ ` > # + - = | { } . ! and backslash itself.
export function escapeMdV2(s: string): string {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// Escape only parentheses in URLs (Telegram V2 can break on ')' inside link target)
export function escapeUrlV2(url: string): string {
  return url.replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// Lettered answers, shows full text with chosen-state ✓, and escapes everything needed for V2
export function renderAnswersListWithStateV2(
  answers: Array<{ id: number; text: string }>,
  selected: Set<number>
): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return answers
    .map((a, i) => {
      const mark = selected.has(a.id) ? "✅" : "◻️";
      // NOTE: the dot after the letter must be escaped as \.
      return `${mark} ${letters[i]}\\. ${escapeMdV2(a.text)}`;
    })
    .join("\n");
}

// Review list with correctness marks and letters, V2-safe
export function renderReviewAnswersWithLettersV2(
  items: Array<{ text: string; correct: boolean; chosen: boolean }>
): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return items
    .map((it, i) => {
      const mark =
        it.correct && it.chosen
          ? "✅"
          : it.correct && !it.chosen
          ? "✔️"
          : !it.correct && it.chosen
          ? "✖️"
          : "▫️";
      return `${mark} ${letters[i]}\\. ${escapeMdV2(it.text)}`;
    })
    .join("\n");
}

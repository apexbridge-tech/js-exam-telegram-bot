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

export function renderReviewAnswers(
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

export function escapeMd(s: string): string {
  return s.replace(/([_*[\]()~`>#+-=|{}.!])/g, "\\$1");
}

import type { QuestionRow } from "../services/question.service.js";

export function renderQuestionHeader(
  qIndex: number,
  total: number,
  section: string,
  type: "single" | "multi"
) {
  const kind = type === "single" ? "Single choice" : "Multiple choice";
  return `*Q ${qIndex}/${total}*  ·  _${section}_  ·  ${kind}`;
}

export function renderQuestionBody(q: QuestionRow) {
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
) {
  const notAnswered = total - answered;
  const time = timeLeft ? `\n⏱ *Time left:* ${timeLeft}` : "";
  return `*Progress*\n● Answered: *${answered}*\n◯ Unanswered: *${notAnswered}*\n🚩 Flagged: *${flagged}*${time}`;
}

export function escapeMd(s: string) {
  // Minimal escape for Markdown (not V2)
  return s.replace(/([_*[\]()~`>#+-=|{}.!])/g, "\\$1");
}

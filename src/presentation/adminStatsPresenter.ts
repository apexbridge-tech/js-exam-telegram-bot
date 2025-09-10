import type { AdminStats } from "../domain/adminstats/types.js";
import { escapeMdV2 } from "../bot/views.js";

export class AdminStatsPresenter {
  public static toMarkdownV2(s: AdminStats): string {
    const win = `*Window:* ${escapeMdV2(s.window.startIso)} — ${escapeMdV2(
      s.window.endIso
    )}`;

    const users =
      `*Users*\n` +
      `Total: *${s.users.usersTotal}*\n` +
      `Active in window: *${s.users.usersActiveWindow}*`;

    const mu = s.usageByMode;
    const exam = mu.find((m) => m.mode === "exam")!;
    const practice = mu.find((m) => m.mode === "practice")!;
    const usage =
      `*Usage by mode*\n` +
      `• Exam — sessions: *${exam.sessions}*, users: *${exam.users}*\n` +
      `• Practice — sessions: *${practice.sessions}*, users: *${practice.users}*`;

    const ex =
      `*Exam results*\n` +
      `Submitted: *${s.exam.submitted}*\n` +
      `Passes: *${s.exam.passes}*, Fails: *${s.exam.fails}*\n` +
      `Pass rate: *${s.exam.passRatePct}\\%*\n` +
      `Avg score: *${s.exam.avgScorePct ?? "n\\/a"}\\%*\n` +
      `Avg duration: *${s.exam.avgMinutes ?? "n\\/a"} min*`;

    return `${win}\n\n${users}\n\n${usage}\n\n${ex}`;
  }
}

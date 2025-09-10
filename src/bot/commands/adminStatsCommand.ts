import { BaseCommand, BotMessage } from "./baseCommand.js";
import { Services } from "../../services/services.js";
import { escapeMarkdownV2KeepFormat } from "../views.js";
import { isAdmin } from "../../security/admin.js";
import { AdminStatsService } from "../../domain/adminstats/adminStatsService.js";
import { isAdminGuard } from "../../security/adminGuard.js";

export class AdminStatsCommand extends BaseCommand {
  adminStatsService: AdminStatsService;

  public constructor(
    examId: number,
    msg: BotMessage,
    match: RegExpExecArray | null,
    services: Services
  ) {
    super(examId, msg, match, services);
    this.adminStatsService = services.adminStatsService;
  }

  public getCommandId(): string {
    return "admin_stats";
  }

  // Supports: /admin_stats         -> default 30d
  //           /admin_stats 7d      -> last 7 days
  public getRegex(): RegExp | undefined {
    return /^\/admin_stats(?:\s+(\d{1,3})d)?$/i;
  }

  protected async validate(): Promise<boolean> {
    const ok = await isAdminGuard(
      this.tgId,
      this.msg.chatId /*, this.botService.bot, this.services.adminRoleService*/
    );
    if (!ok) {
      await this.sendMessage("Admins only.", { parse_mode: "MarkdownV2" });
      return false;
    }
    return true;
  }

  protected async process(): Promise<void> {
    // parse window
    const days: number =
      this.match && this.match[1]
        ? Math.max(1, Math.min(365, Number(this.match[1])))
        : 30;

    const end = new Date();
    const start = new Date(end.getTime() - days * 86400_000);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    // fetch stats (service should follow clean interface)
    const stats = await this.adminStatsService.getAdminStats(
      { startIso, endIso },
      70 // pass threshold
    );

    // format MarkdownV2 safely
    const winLabel = `${days}d`;
    const heading =
      `*Admin stats* \\(${escapeMarkdownV2KeepFormat(winLabel)}\\)\n\n` +
      `*Window:* ${escapeMarkdownV2KeepFormat(
        startIso
      )} — ${escapeMarkdownV2KeepFormat(endIso)}\n\n`;

    const usersBlock =
      `*Users*\n` +
      `Total: *${stats.users.usersTotal}*\n` +
      `Active in window: *${stats.users.usersActiveWindow}*\n\n`;

    const examUsage = stats.usageByMode.find((u) => u.mode === "exam");
    const practiceUsage = stats.usageByMode.find((u) => u.mode === "practice");
    const usageBlock =
      `*Usage by mode*\n` +
      `• Exam — sessions: *${examUsage?.sessions ?? 0}*, users: *${
        examUsage?.users ?? 0
      }*\n` +
      `• Practice — sessions: *${practiceUsage?.sessions ?? 0}*, users: *${
        practiceUsage?.users ?? 0
      }*\n\n`;

    const exam = stats.exam;
    const examBlock =
      `*Exam results*\n` +
      `Submitted: *${exam.submitted}*\n` +
      `Passes: *${exam.passes}*, Fails: *${exam.fails}*\n` +
      `Pass rate: *${exam.passRatePct.toFixed(1).replace(".", "\\.")}\\%*\n` +
      `Avg score: *${
        exam.avgScorePct !== null
          ? String(exam.avgScorePct).replace(".", "\\.")
          : "n\\/a"
      }\\%*\n` +
      `Avg duration: *${
        exam.avgMinutes !== null
          ? String(exam.avgMinutes).replace(".", "\\.")
          : "n\\/a"
      } min*`;

    await this.sendMessage(heading + usersBlock + usageBlock + examBlock, {
      parse_mode: "MarkdownV2",
    });
  }
}

import { BaseCommand, BotMessage } from "./baseCommand.js";
import { Services } from "../../services/services.js";
import { getDb } from "../../db/sqlite.js";
import { escapeMarkdownV2KeepFormat as E } from "../views.js";
import { isAdminGuard } from "../../security/adminGuard.js";

export class HealthCommand extends BaseCommand {
  constructor(
    examId: number,
    msg: BotMessage,
    match: RegExpExecArray | null,
    services: Services
  ) {
    super(examId, msg, match, services);
  }
  public getCommandId(): string {
    return "health";
  }
  public getRegex(): RegExp | undefined {
    return /^\/health$/;
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
    const db = getDb();
    const examId = this.examId;
    const counts: Record<string, number> = {};

    await new Promise<void>((resolve, reject) => {
      db.all(
        `SELECT section, COUNT(*) AS c FROM questions WHERE exam_id=? GROUP BY section`,
        [examId],
        (err, rows: { section: string; c: number }[]) =>
          err
            ? reject(err)
            : (rows.forEach((r) => (counts[r.section] = r.c)), resolve())
      );
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const text =
      `*Health*\n` +
      `examId: *${examId}*\n` +
      `sections: ${
        Object.entries(counts)
          .map(([s, c]) => `${E(s)}=*${c}*`)
          .join(", ") || "none"
      }\n` +
      `total questions: *${total}*\n` +
      `DB: ${E(process.env.DB_FILE ?? "")}\n` +
      `JSON: ${E(process.env.QUESTIONS_FILE ?? "")}`;
    await this.sendMessage(text, { parse_mode: "MarkdownV2" });
  }
}

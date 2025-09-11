import { EXAM_DURATION_MIN } from "../../domain/policy.js";
import { escapeMarkdownV2KeepFormat, escapeMdV2 } from "../views.js";
import { BaseCommand } from "./baseCommand.js";

export class StartCommand extends BaseCommand {
  protected async validate(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public getRegex(): RegExp | undefined {
    return /^\/start\b/i;
  }

  public getCommandId(): string {
    return "start";
  }

  private mdv2Cmd(cmd: string): string {
    return `/${cmd.replace(/_/g, "\\_")}`; // keeps it clickable in V2
  }

  public async process(): Promise<void> {
    const sess = await this.getActiveSession();
    const hint: string = !!sess
      ? "\nResume your active exam with /progress or continue below."
      : "\nStart your exam with /begin_exam or try /practice (untimed).";

    const greetingName: string = this.firstName ?? "there";

    const text: string =
      `Welcome, ${escapeMarkdownV2KeepFormat(greetingName)}\\! 👋\n` + // note \\! in the literal
      `This bot simulates *JSA\\-41\\-01*.\n\n` +
      `Commands:\n` +
      `• ${this.mdv2Cmd("begin_exam")} — start a new timed exam 🧪\n` +
      `• ${this.mdv2Cmd("practice")} — start untimed practice 📘\n` +
      `• ${this.mdv2Cmd("progress")} — current status 📊\n` +
      `• ${this.mdv2Cmd("submit")} — submit your exam ✅\n` +
      `Timer: ${EXAM_DURATION_MIN} minutes (with 10/5/1 min warnings).${
        hint ? ` ${escapeMdV2(hint)}` : ""
      }`;

    await this.sendMessage(text, { parse_mode: "MarkdownV2" });
  }
}

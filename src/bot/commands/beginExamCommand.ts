import { BaseCommand } from "./baseCommand.js";

export class BeginExamCommand extends BaseCommand {
  protected async validate(): Promise<boolean> {
    const { ok, nextIso } = await this.canRetake(this.userId);

    if (!ok) {
      await this.sendMessage(
        `⛔ You failed the last attempt. You can retake after 15 days: *${nextIso}*`,
        { parse_mode: "MarkdownV2" }
      );
      return false;
    }

    return true;
  }

  public getCommandId(): string {
    return "begin_exam";
  }

  public getRegex(): RegExp | undefined {
    return /^\/begin_exam\b/i;
  }

  public async process(): Promise<void> {
    await this.showQuestionForSession(this.userId, "exam");
  }
}

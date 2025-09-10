import { resetMenuKb } from "../handlers/reset.handler.js";
import { SessionRelatedCommand } from "./sessionRelatedCommand.js";

export class ResetCommand extends SessionRelatedCommand {
  protected additionalValidation(): Promise<boolean> {
    return Promise.resolve(true);
  }

  protected async process(): Promise<void> {
    const isPractice: boolean = this.session!.mode === "practice";
    const isExam: boolean = this.session!.mode === "exam";
    await this.sendMessage("Reset options:", {
      reply_markup: resetMenuKb(this.session!.id, isPractice, isExam),
    });
  }

  public getRegex(): RegExp | undefined {
    return /^\/reset\b/i;
  }

  public getCommandId(): string {
    return "reset";
  }
}

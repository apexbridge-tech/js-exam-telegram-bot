import {
  progressForSession,
  remainingSeconds,
} from "../../services/session.service.js";
import { renderProgress } from "../views.js";
import { humanTimeLeft } from "../../services/timer.service.js";
import { SessionRelatedCommand } from "./sessionRelatedCommand.js";

export class ProgressCommand extends SessionRelatedCommand {
  protected additionalValidation(): Promise<boolean> {
    return Promise.resolve(true);
  }

  protected async process(): Promise<void> {
    const p = await progressForSession(this.session!.id);
    const secs: number | null = await remainingSeconds(this.session!.id);
    const text: string = renderProgress(
      p.answered,
      p.flagged,
      p.total,
      secs === null ? undefined : humanTimeLeft(secs)
    );
    await this.sendMessage(text, { parse_mode: "MarkdownV2" });
    await this.showQuestion(this.session!);
  }

  public getRegex(): RegExp | undefined {
    return /^\/progress\b/i;
  }

  public getCommandId(): string {
    return "progress";
  }
}

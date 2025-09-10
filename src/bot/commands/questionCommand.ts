import { setCurrentIndex } from "../../services/session.service.js";
import { SessionRelatedCommand } from "./sessionRelatedCommand.js";

export class QuestionCommand extends SessionRelatedCommand {
  protected additionalValidation(): Promise<boolean> {
    return Promise.resolve(true);
  }

  protected async process(): Promise<void> {
    const rawIndex: number = this.match ? Number(this.match[1]) : NaN;
    const idx: number = Math.max(
      1,
      Math.min(40, Number.isFinite(rawIndex) ? rawIndex : 1)
    );
    await setCurrentIndex(this.session!.id, idx);
    await this.showQuestion(this.session!, idx);
  }

  public getCommandId(): string {
    return "question";
  }

  public getRegex(): RegExp | undefined {
    return /^\/question_(\d+)\b/i;
  }
}

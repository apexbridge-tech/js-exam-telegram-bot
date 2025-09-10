import { PASS_PERCENT } from "../../domain/policy.js";
import { renderResultReport } from "../../services/report.service.js";
import { finalizeAndSubmit } from "../../services/session.service.js";
import { SessionRelatedCommand } from "./sessionRelatedCommand.js";

export class SubmitCommand extends SessionRelatedCommand {
  protected async additionalValidation(): Promise<boolean> {
    if (this.session!.mode === "exam") {
      return true;
    }

    await this.sendMessage(
      "Practice mode has no submission. Keep practicing or start /begin_exam."
    );
    return false;
  }

  public getRegex(): RegExp | undefined {
    return /^\/submit\b/i;
  }

  public getCommandId(): string {
    return "submit";
  }

  public async process(): Promise<void> {
    const { result, passed } = await finalizeAndSubmit(
      this.session!.id,
      PASS_PERCENT
    );
    const failedCooldownDays = 15;
    const nextEligible: string | null = !passed
      ? new Date(Date.now() + failedCooldownDays * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10)
      : null;
    const report = renderResultReport(
      result,
      PASS_PERCENT,
      failedCooldownDays,
      nextEligible
    );
    const reportText: string = `${report.headline}\n\n${report.sections}\n\n${report.detail}\n\n${report.footer}`;

    await this.sendMessage(reportText);
    // Immediately open review on Q1
    await this.showQuestion(this.session!, 1);
  }
}

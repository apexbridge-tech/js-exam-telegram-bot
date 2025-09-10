import { ActiveSession } from "../../services/session.service.js";
import { BaseCommand } from "./baseCommand.js";

export abstract class SessionRelatedCommand extends BaseCommand {
  session!: ActiveSession | undefined;

  protected async validate(): Promise<boolean> {
    this.session = await this.getActiveSession();
    if (!this.session) {
      await this.sendMessage(
        "No active session. Use /begin_exam or /practice."
      );
      return false;
    }

    return await this.additionalValidation();
  }

  protected abstract additionalValidation(): Promise<boolean>;
}

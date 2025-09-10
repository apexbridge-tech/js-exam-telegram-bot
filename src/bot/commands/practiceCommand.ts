import { BaseCommand } from "./baseCommand.js";

export class PracticeCommand extends BaseCommand {
  protected validate(): Promise<boolean> {
    return Promise.resolve(true);
  }

  protected async process(): Promise<void> {
    const userId = await this.upsertUser();

    await this.showQuestionForSession(userId, "practice");
  }

  public getRegex(): RegExp | undefined {
    return /^\/practice\b/i;
  }

  public getCommandId(): string {
    return "practice";
  }
}

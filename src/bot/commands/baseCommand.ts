import TelegramBot from "node-telegram-bot-api";
import {
  ActiveSession,
  SessionService,
} from "../../services/session.service.js";
import { getUserById, UserService } from "../../services/user.service.js";
import { showQuestion } from "../handlers/answer.handler.js";
import { Services } from "../../services/services.js";
import { BotService } from "../../services/bot.service.js";
import { EXAM_DURATION_MIN } from "../../domain/policy.js";

export interface BotMessageFrom {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface BotMessage {
  chatId: number;
  from: BotMessageFrom;
}

export type Mode = "exam" | "practice";

export abstract class BaseCommand {
  protected cooldownDays: number = 15;
  protected examModes: Map<Mode, string> = new Map<Mode, string>([
    ["exam", `Exam started! ⏱ ${EXAM_DURATION_MIN} minutes$.\nGood luck!`],
    ["practice", "Practice mode started 📘 (untimed)."],
  ]);

  protected tgId: number;
  protected firstName: string | undefined;
  protected lastName: string | undefined;
  protected username: string | undefined;
  protected msg: BotMessage;
  protected examId: number;
  protected userId!: number;
  protected match: RegExpExecArray | null;
  protected userService: UserService;
  protected sessionService: SessionService;
  protected botService: BotService;

  constructor(
    examId: number,
    msg: BotMessage,
    match: RegExpExecArray | null,
    services: Services
  ) {
    this.examId = examId;
    this.msg = msg;
    this.tgId = msg.from?.id ?? 0;
    this.firstName = msg.from?.first_name;
    this.lastName = msg.from?.last_name;
    this.username = msg.from?.username;
    this.match = match;
    this.sessionService = services.sessionService;
    this.userService = services.userService;
    this.botService = services.botService;
  }

  protected async upsertUser(): Promise<number> {
    return await this.userService.upsertUser({
      tg_user_id: this.tgId,
      first_name: this.firstName,
      last_name: this.lastName,
      username: this.username,
    });
  }

  protected async getActiveSession(): Promise<ActiveSession | undefined> {
    return await this.sessionService.getActiveSessionForUser(this.userId);
  }

  protected async canRetake(
    userId: number
  ): Promise<{ ok: boolean; nextIso?: string | null }> {
    // Cooldown check
    const userRow = await getUserById(userId);
    if (!userRow?.last_failed_at) {
      return { ok: true, nextIso: null };
    }
    const lastMs: number = Date.parse(userRow?.last_failed_at + "Z"); // stored in UTC string format
    const waitMs: number = this.cooldownDays * 24 * 60 * 60 * 1000;
    const nextMs: number = lastMs + waitMs;
    return Date.now() >= nextMs
      ? { ok: true, nextIso: null }
      : { ok: false, nextIso: new Date(nextMs).toISOString().slice(0, 10) };
  }

  protected async sendMessage(
    text: string,
    options?: TelegramBot.SendMessageOptions
  ): Promise<void> {
    try {
      await this.botService.sendMessage(this.msg.chatId, text, options);
    } catch (error) {
      console.error(`Error sending message: ${text}`, error);
      throw error;
    }
  }

  protected async showQuestionForSession(
    userId: number,
    mode: "exam" | "practice"
  ): Promise<void> {
    let sess = await this.sessionService.getActiveSessionForUser(userId);
    if (!sess) {
      sess = await this.sessionService.createExamSession(
        userId,
        this.examId,
        mode
      );
      await this.sendMessage(this.examModes.get(mode) ?? "", {
        parse_mode: "MarkdownV2",
      });
    } else {
      await this.sendMessage(
        "You already have an active exam. Showing your current question…"
      );
    }
    await showQuestion(
      this.botService,
      this.msg.chatId,
      sess.id,
      sess.current_index
    );
  }

  protected async showQuestion(
    sess: ActiveSession,
    current_index: number = sess.current_index
  ): Promise<void> {
    await showQuestion(
      this.botService,
      this.msg.chatId,
      sess.id,
      current_index
    );
  }

  public async execute(): Promise<void> {
    try {
      this.userId = await this.upsertUser();

      if (!(await this.validate())) {
        return;
      }

      await this.process();
    } catch (error) {
      console.error(
        `Error in command ${this.getCommandId()} execution:`,
        error
      );
      await this.sendMessage(
        "Sorry, an error occurred while processing your command."
      );
    }
  }

  protected abstract validate(): Promise<boolean>;

  protected abstract process(): Promise<void>;

  public abstract getCommandId(): string;

  public abstract getRegex(): RegExp | undefined;
}

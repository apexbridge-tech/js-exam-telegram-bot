import TelegramBot from "node-telegram-bot-api";
import { BaseCommand, BotMessage } from "./commands/baseCommand.js";
import { Services } from "../services/services.js";

export class CommandFactory {
  #commands: Map<
    string,
    new (
      examId: number,
      msg: BotMessage,
      match: RegExpExecArray | null,
      services: Services
    ) => BaseCommand
  > = new Map();
  #services: Services;
  #examId: number;

  constructor(services: Services, examId: number) {
    this.#services = services;
    this.#examId = examId;
  }

  registerCommand(CommandClass: new (...args: any[]) => BaseCommand): void {
    const prototype = CommandClass.prototype;
    this.#commands.set(prototype.getCommandId(), CommandClass);
  }

  submit() {
    for (const CommandClass of this.#commands.values()) {
      const prototype = CommandClass.prototype;
      const regex = prototype.getRegex();
      if (!regex) continue;

      this.#services.botService.onText(
        regex,
        async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
          const commandInstance = new CommandClass(
            this.#examId,
            {
              chatId: msg.chat.id,
              from: msg.from
                ? {
                    id: msg.from.id,
                    first_name: msg.from.first_name,
                    last_name: msg.from.last_name,
                    username: msg.from.username,
                  }
                : { id: 0 },
            },
            match,
            this.#services
          );
          await commandInstance.execute();
        }
      );
    }
  }

  createCommand(
    commandId: string,
    examId: number,
    msg: BotMessage,
    match: RegExpExecArray | null,
    services: Services
  ): BaseCommand | null {
    const CommandClass = this.#commands.get(commandId);
    if (!CommandClass) return null;
    return new CommandClass(examId, msg, match, services);
  }
}

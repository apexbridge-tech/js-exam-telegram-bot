import TelegramBot from "node-telegram-bot-api";
import {
  BaseAnswerProcessor,
  CallbackParserResult,
} from "./baseAnswerProcessor.js";
import {
  getSessionById,
  toggleMultiChoice,
} from "../../../services/session.service.js";
import { isQuestionCorrect } from "../../../services/scoring.service.js";
import { BotService } from "../../../services/bot.service.js";

export class ToggleProcessor extends BaseAnswerProcessor {
  processName: string = "toggle";
  regex: RegExp = /^tog:([^:]+):(\d+):(\d+):(\d+)$/;

  constructor(botService: BotService) {
    super(botService);
    this.validations.push((match) => Number.isFinite(match.get("aid")));
  }

  async process(
    msg: TelegramBot.Message,
    query: TelegramBot.CallbackQuery,
    parsed: CallbackParserResult
  ): Promise<void> {
    const { sessionId, questionId, questionIndex, answerId } = parsed;

    try {
      await toggleMultiChoice(sessionId!, questionId!, answerId!);
      const sess = await getSessionById(sessionId!);
      if (!sess) return;

      await this.refreshAnswers(
        msg.chat.id,
        sessionId!,
        questionIndex!,
        msg.message_id
      );

      if (sess.mode === "practice") {
        const ok: boolean = await isQuestionCorrect(sessionId!, questionId!);
        await this.safeAnswerCallback(
          query.id,
          ok ? "✅ Correct" : "❌ Not yet"
        );
      } else {
        await this.safeAnswerCallback(query.id, "Saved ✓");
      }
    } catch (e) {
      await this.safeAnswerCallback(query.id, "Oops. Try again.");
      // Optional: console.error("[multi-toggle error]", e);
    }
  }
}

import TelegramBot from "node-telegram-bot-api";
import { isQuestionCorrect } from "../../../services/scoring.service.js";
import {
  getSessionById,
  recordSingleChoice,
  setCurrentIndex,
} from "../../../services/session.service.js";
import { showQuestion } from "../answer.handler.js";
import {
  BaseAnswerProcessor,
  CallbackParserResult,
} from "./baseAnswerProcessor.js";
import { BotService } from "../../../services/bot.service.js";

export class AnswerProcessor extends BaseAnswerProcessor {
  processName: string = "answer";
  regex: RegExp = /^ans:([^:]+):(\d+):(\d+):(\d+)$/;

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
      await recordSingleChoice(sessionId!, questionId!, answerId!);
      const sess = await getSessionById(sessionId!);
      if (!sess) return;

      if (sess.mode === "practice") {
        const ok: boolean = await isQuestionCorrect(sessionId!, questionId!);
        await this.safeAnswerCallback(
          query.id,
          ok ? "✅ Correct" : "❌ Incorrect"
        );

        // Show the checkmark briefly on current question, then advance
        await this.refreshAnswers(
          msg.chat.id,
          sessionId!,
          questionIndex!,
          msg.message_id
        );
        setTimeout(async () => {
          const nextIdx: number = Math.min(40, questionIndex! + 1);
          await setCurrentIndex(sessionId!, nextIdx);
          await showQuestion(
            this.botService,
            msg.chat.id,
            sessionId!,
            nextIdx,
            msg.message_id
          );
        }, 300);
        return;
      }

      // Exam mode: save → quick visual update → advance
      await this.refreshAnswers(
        msg.chat.id,
        sessionId!,
        questionIndex!,
        msg.message_id
      );
      const nextIdx: number = Math.min(40, questionIndex! + 1);
      await setCurrentIndex(sessionId!, nextIdx);
      await showQuestion(
        this.botService,
        msg.chat.id,
        sessionId!,
        nextIdx,
        msg.message_id
      );
      await this.safeAnswerCallback(query.id, "Saved ✓");
    } catch (e) {
      await this.safeAnswerCallback(query.id, "Oops. Try again.");
      // Optional: console.error("[single-choice error]", e);
    }
  }
}

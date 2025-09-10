import { Message, CallbackQuery } from "node-telegram-bot-api";
import {
  BaseAnswerProcessor,
  CallbackParserResult,
} from "./baseAnswerProcessor.js";
import { getSessionById } from "../../../services/session.service.js";
import {
  getQuestionById,
  QuestionRow,
} from "../../../services/question.service.js";
import { escapeMd } from "../../views.js";
import { showQuestion } from "../answer.handler.js";

export class ExplainProcessor extends BaseAnswerProcessor {
  processName: string = "explain";
  regex: RegExp = /^explain:([^:]+):(\d+):(\d+)$/;

  async process(
    msg: Message,
    query: CallbackQuery,
    parsed: CallbackParserResult
  ): Promise<void> {
    const { sessionId, questionId, questionIndex } = parsed;

    try {
      const sess = await getSessionById(sessionId!);
      if (!sess) {
        await this.safeAnswerCallback(query.id);
        return;
      }

      // Not allowed during the timed exam
      if (sess.mode === "exam" && sess.status === "active") {
        await this.safeAnswerCallback(
          query.id,
          "Not available during the timed exam.",
          true
        );
        return;
      }

      const qrow: QuestionRow = await getQuestionById(questionId!);
      const expl: string = (qrow.explanation ?? "").trim();
      if (!expl) {
        await this.safeAnswerCallback(
          query.id,
          "No explanation provided for this question.",
          true
        );
        return;
      }

      await this.safeAnswerCallback(query.id); // toast ack (no text)
      await this.botService.sendMessage(
        msg.chat.id,
        `🧠 *Explanation*\n${escapeMd(expl)}`,
        { parse_mode: "MarkdownV2" }
      );

      // Keep focus on the same message/question
      await showQuestion(
        this.botService,
        msg.chat.id,
        sessionId!,
        questionIndex!,
        msg.message_id
      );
    } catch {
      await this.safeAnswerCallback(query.id, "Oops. Try again.");
    }
  }
}

import { Message, CallbackQuery } from "node-telegram-bot-api";
import {
  BaseAnswerProcessor,
  CallbackParserResult,
} from "./baseAnswerProcessor.js";
import {
  getSessionById,
  selectedAnswerIds,
} from "../../../services/session.service.js";
import {
  AnswerRow,
  getAnswersForQuestion,
  getQuestionById,
  QuestionRow,
} from "../../../services/question.service.js";
import { renderReviewAnswersWithLettersV2 } from "../../views.js";
import { showQuestion } from "../answer.handler.js";
import { logger } from "../../../logger.js";

export class RevealProcessor extends BaseAnswerProcessor {
  processName: string = "reveal";
  regex: RegExp = /^reveal:([^:]+):(\d+):(\d+)$/;

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
      if (sess.mode === "exam" && sess.status === "active") {
        await this.safeAnswerCallback(
          query.id,
          "Not available during the timed exam.",
          true
        );
        return;
      }

      const qrow: QuestionRow = await getQuestionById(questionId!);
      const answers: AnswerRow[] = await getAnswersForQuestion(questionId!);
      const selectedIdsArr: number[] = await selectedAnswerIds(
        sessionId!,
        questionId!
      );
      const selectedSet = new Set<number>(selectedIdsArr);

      const options = answers.map((a) => ({
        text: a.text,
        correct: a.is_correct === 1,
        chosen: selectedSet.has(a.id),
      }));
      const reviewList: string = renderReviewAnswersWithLettersV2(options);

      await this.safeAnswerCallback(query.id, "Shown below.");
      await this.botService.sendMessage(
        msg.chat.id,
        `*Correct answer\\(s\\)*\n${reviewList}`,
        {
          parse_mode: "MarkdownV2",
        }
      );

      // Keep focus on current question
      await showQuestion(
        this.botService,
        msg.chat.id,
        sessionId!,
        questionIndex!,
        msg.message_id
      );
    } catch (error) {
      logger.error("Error in RevealProcessor:", error);
      await this.safeAnswerCallback(query.id, "Oops. Try again.");
    }
  }
}

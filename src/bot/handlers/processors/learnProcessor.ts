import { Message, CallbackQuery } from "node-telegram-bot-api";
import {
  BaseAnswerProcessor,
  CallbackParserResult,
} from "./baseAnswerProcessor.js";
import {
  getQuestionById,
  QuestionRow,
} from "../../../services/question.service.js";
import { inferReference } from "../../../services/ref.service.js";
import { escapeMd } from "../../views.js";

export class LearnProcessor extends BaseAnswerProcessor {
  processName: string = "learn";
  regex: RegExp = /^learn:([^:]+):(\d+):(\d+)$/;

  async process(
    msg: Message,
    query: CallbackQuery,
    parsed: CallbackParserResult
  ): Promise<void> {
    const { sessionId, questionId, questionIndex } = parsed;

    try {
      const qrow: QuestionRow = await getQuestionById(questionId!);
      const link = qrow.reference_url
        ? {
            title: qrow.reference_title ?? "Learn more",
            url: qrow.reference_url,
          }
        : inferReference(qrow);

      if (!link) {
        await this.safeAnswerCallback(
          query.id,
          "No reference available for this question.",
          true
        );
        return;
      }

      await this.safeAnswerCallback(query.id);
      await this.botService.sendMessage(
        msg.chat.id,
        `📖 *Learn more:* [${escapeMd(link.title)}](${link.url})`,
        { parse_mode: "MarkdownV2", disable_web_page_preview: false }
      );
    } catch {
      await this.safeAnswerCallback(query.id, "Oops. Try again.");
    }
  }
}

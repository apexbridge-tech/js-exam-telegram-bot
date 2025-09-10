import type TelegramBot from "node-telegram-bot-api";
import {
  getAnswersForQuestion,
  getQuestionById,
  type AnswerRow,
  type QuestionRow,
} from "../../services/question.service.js";
import {
  getQuestionIdAt,
  selectedAnswerIds,
  getSessionById,
} from "../../services/session.service.js";
import {
  answersKeyboardMulti,
  answersKeyboardSingle,
  navControls,
  extrasControls,
} from "../keyboards.js";
import {
  renderQuestionBody,
  renderQuestionHeader,
  escapeMdV2,
  renderAnswersListWithStateV2,
  renderReviewAnswersWithLettersV2,
} from "../views.js";
import { BaseAnswerProcessor } from "./processors/baseAnswerProcessor.js";
import { BotService } from "../../services/bot.service.js";

/**
 * Register handlers for answer selection, toggling, and extras (reveal/learn).
 */
export function registerAnswerHandlers(
  bot: TelegramBot,
  processors: Array<BaseAnswerProcessor>
): void {
  bot.on(
    "callback_query",
    async (q: TelegramBot.CallbackQuery): Promise<void> => {
      const data: string = q.data ?? "";
      const msg = q.message;
      if (!msg) {
        return;
      }

      for (const processor of processors) {
        const res = await processor.parse(data);
        if (res !== null) {
          await processor.process(msg, q, res);
          break;
        }
      }
    }
  );
}

/**
 * Renders a question by index for a given session.
 * - Active exam/practice: interactive answers + nav + (practice) extras
 * - Submitted (review): read-only answers + explanation + nav + extras
 */
export async function showQuestion(
  botService: BotService,
  chatId: number,
  sessionId: string,
  qIndex: number,
  reuseMessageId?: number
): Promise<void> {
  const sess = await getSessionById(sessionId);
  if (!sess) {
    await botService.sendMessage(chatId, "Session not found.");
    return;
  }

  const row = await getQuestionIdAt(sessionId, qIndex);
  if (!row) {
    await botService.sendMessage(chatId, "Question not found.");
    return;
  }

  const q: QuestionRow = await getQuestionById(row.question_id);
  const answers: AnswerRow[] = await getAnswersForQuestion(q.id);
  const selectedIdsArr: number[] = await selectedAnswerIds(sessionId, q.id);
  const selectedIds: Set<number> = new Set<number>(selectedIdsArr);
  const answersList: string = renderAnswersListWithStateV2(
    answers.map((a) => ({ id: a.id, text: a.text })),
    selectedIds
  );

  const header: string = renderQuestionHeader(qIndex, 40, q.section, q.type);
  const body: string = renderQuestionBody(q);

  const allowReveal: boolean =
    sess.status === "submitted" || sess.mode === "practice";
  const allowLearn: boolean = allowReveal;
  const allowExplain: boolean =
    sess.status === "submitted" || sess.mode === "practice";

  if (sess.status === "submitted") {
    // Review mode: show correctness & explanation; no answer buttons
    const detailed = answers.map((a) => ({
      text: a.text,
      correct: a.is_correct === 1,
      chosen: selectedIds.has(a.id),
    }));

    // Use the new letters renderer (or keep your existing renderReviewAnswers if you prefer).
    const reviewList: string = renderReviewAnswersWithLettersV2(detailed);

    const explanation: string = q.explanation
      ? `\n\n*Why:* ${escapeMdV2(q.explanation)}`
      : "";

    const text: string = `${header}\n\n${body}\n\n${reviewList}${explanation}`;

    const kb = mergeInline(
      navControls({
        sessionId,
        qIndex,
        total: 40, // or sess.total_count if you’ve generalized it
        flagged: row.flagged === 1, // reflect actual flag state
        showSubmit: false,
        showFlag: false,
      }),
      extrasControls(
        sessionId,
        q.id,
        qIndex,
        allowReveal,
        allowLearn,
        allowExplain
      )
    );

    if (reuseMessageId) {
      await botService.editMessageText(text, {
        chat_id: chatId,
        message_id: reuseMessageId,
        parse_mode: "MarkdownV2",
        reply_markup: kb,
      });
    } else {
      await botService.sendMessage(chatId, text, {
        parse_mode: "MarkdownV2",
        reply_markup: kb,
      });
    }
    return;
  }

  // Active session (exam or practice): interactive answers
  const ansKeyboard =
    q.type === "single"
      ? answersKeyboardSingle(
          sessionId,
          q.id,
          qIndex,
          answers,
          selectedIdsArr.length ? selectedIdsArr[0] : null
        )
      : answersKeyboardMulti(sessionId, q.id, qIndex, answers, selectedIds);

  const kb = mergeInline(
    ansKeyboard,
    navControls({
      sessionId,
      qIndex,
      total: 40,
      flagged: row.flagged === 1,
      showSubmit: sess.mode === "exam",
      showFlag: true,
    }),
    extrasControls(
      sessionId,
      q.id,
      qIndex,
      allowReveal,
      allowLearn,
      allowExplain
    ) // only shows in practice (allowed) but harmless to include
  );

  const text: string = `${header}\n\n${body}\n\n${answersList}`;
  if (reuseMessageId) {
    await botService.editMessageText(text, {
      chat_id: chatId,
      message_id: reuseMessageId,
      parse_mode: "MarkdownV2",
      reply_markup: kb,
    });
  } else {
    await botService.sendMessage(chatId, text, {
      parse_mode: "MarkdownV2",
      reply_markup: kb,
    });
  }
}

/* ------------------------- helpers ------------------------- */

function mergeInline(
  ...markups: TelegramBot.InlineKeyboardMarkup[]
): TelegramBot.InlineKeyboardMarkup {
  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  for (const m of markups) {
    if (m.inline_keyboard) rows.push(...m.inline_keyboard);
  }
  return { inline_keyboard: rows };
}

/* ----- strict, typed parsers for callback payloads ----- */

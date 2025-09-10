import TelegramBot from "node-telegram-bot-api";
import {
  getAnswersForQuestion,
  getQuestionById,
} from "../../../services/question.service.js";
import {
  getQuestionIdAt,
  selectedAnswerIds,
} from "../../../services/session.service.js";
import {
  answersKeyboardMulti,
  answersKeyboardSingle,
  navControls,
} from "../../keyboards.js";
import { BotService } from "../../../services/bot.service.js";

export class CallbackParserResult {
  private readonly sid: string | null;
  private readonly qid: number | null;
  private readonly idx: number | null;
  private readonly aid: number | null;
  private readonly processName: string;

  constructor(
    sid: string | null,
    qid: number | null,
    idx: number | null,
    aid: number | null,
    processName: string
  ) {
    this.sid = sid;
    this.qid = qid;
    this.idx = idx;
    this.aid = aid;
    this.processName = processName;
  }

  get sessionId(): string | null {
    return this.sid;
  }

  get questionId(): number | null {
    return this.qid;
  }

  get questionIndex(): number | null {
    return this.idx;
  }

  get answerId(): number | null {
    return this.aid;
  }
}

export abstract class BaseAnswerProcessor {
  constructor(protected botService: BotService) {}

  abstract regex: RegExp;
  abstract processName: string;
  protected validations: Array<
    (match: Map<"sid" | "qid" | "idx" | "aid", string | number>) => boolean
  > = [
    (match) =>
      Number.isFinite(match.get("qid")) && Number.isFinite(match.get("idx")),
  ];

  async parse(data: string): Promise<CallbackParserResult | null> {
    const match = this.regex.exec(data);
    if (!match) {
      return null;
    }
    const [, sid, qidS, idxS, aidS] = match;
    const map = new Map<"sid" | "qid" | "idx" | "aid", string | number>([
      ["sid", sid],
      ["qid", parseInt(qidS)],
      ["idx", parseInt(idxS)],
      ["aid", parseInt(aidS)],
    ]);

    for (const validate of this.validations) {
      if (!validate(map)) {
        return null;
      }
    }

    return new CallbackParserResult(
      sid || null,
      qidS ? parseInt(qidS, 10) : null,
      idxS ? parseInt(idxS, 10) : null,
      aidS ? parseInt(aidS, 10) : null,
      this.processName
    );
  }

  abstract process(
    msg: TelegramBot.Message,
    query: TelegramBot.CallbackQuery,
    parsed: CallbackParserResult
  ): Promise<void>;

  async refreshAnswers(
    chatId: number,
    sessionId: string,
    qIndex: number,
    messageId: number
  ): Promise<void> {
    const row = await getQuestionIdAt(sessionId, qIndex);
    if (!row) return;

    const q = await getQuestionById(row.question_id);
    const answers = await getAnswersForQuestion(q.id);
    const selectedIdsArr: number[] = await selectedAnswerIds(sessionId, q.id);
    const selectedIds: Set<number> = new Set<number>(selectedIdsArr);

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

    const kb = this.mergeInline(
      ansKeyboard,
      navControls({
        sessionId,
        qIndex,
        total: 40,
        flagged: row.flagged === 1,
        showSubmit: true,
        showFlag: true,
      })
    );

    await this.botService.editMessageReplyMarkup(kb, {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  mergeInline(
    ...markups: TelegramBot.InlineKeyboardMarkup[]
  ): TelegramBot.InlineKeyboardMarkup {
    const rows: TelegramBot.InlineKeyboardButton[][] = [];
    for (const m of markups) {
      if (m.inline_keyboard) rows.push(...m.inline_keyboard);
    }
    return { inline_keyboard: rows };
  }

  async safeAnswerCallback(
    id: string | undefined,
    text?: string,
    showAlert: boolean = false
  ): Promise<void> {
    if (!id) return;
    try {
      await this.botService.answerCallbackQuery(
        id,
        text ? { text, show_alert: showAlert } : {}
      );
    } catch {
      // ignore callback answer errors (e.g., message edited)
    }
  }
}

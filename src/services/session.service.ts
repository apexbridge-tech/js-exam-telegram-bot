import type sqlite3 from "sqlite3";
import { nanoid } from "nanoid";
import { getDb } from "../db/sqlite.js";
import { selectFortyQuestionIds } from "../domain/selection.js";
import { EXAM_DURATION_MIN } from "../domain/policy.js";
import { gradeSession, type GradeResult } from "./scoring.service.js";

export type SessionStatus = "active" | "submitted" | "expired";
export type SessionMode = "exam" | "practice";

export interface ActiveSession {
  id: string;
  user_id: number;
  exam_id: number;
  mode: SessionMode;
  status: SessionStatus;
  started_at: string;
  expires_at: string | null;
  finished_at?: string | null;
  current_index: number;
  total_count: number;
  warn10_sent: 0 | 1;
  warn5_sent: 0 | 1;
  warn1_sent: 0 | 1;
}

export async function getActiveSessionForUser(
  userId: number
): Promise<ActiveSession | undefined> {
  const db: sqlite3.Database = getDb();
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM exam_sessions WHERE user_id=? AND status='active' ORDER BY started_at DESC LIMIT 1`,
      [userId],
      (err: Error | null, row: ActiveSession | undefined) =>
        err ? reject(err) : resolve(row)
    );
  });
}

export async function getSessionById(
  sessionId: string
): Promise<ActiveSession | undefined> {
  const db: sqlite3.Database = getDb();
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM exam_sessions WHERE id=? LIMIT 1`,
      [sessionId],
      (err: Error | null, row: ActiveSession | undefined) =>
        err ? reject(err) : resolve(row)
    );
  });
}

export async function createExamSession(
  userId: number,
  examId: number,
  mode: SessionMode
): Promise<ActiveSession> {
  const db: sqlite3.Database = getDb();
  const id: string = nanoid();
  const started_at: Date = new Date();
  const expires_at: Date | null =
    mode === "exam"
      ? new Date(started_at.getTime() + EXAM_DURATION_MIN * 60_000)
      : null;

  const ids: number[] = await selectFortyQuestionIds();

  await run("BEGIN");
  try {
    await run(
      `INSERT INTO exam_sessions (id, user_id, exam_id, mode, status, started_at, expires_at, total_count, current_index)
       VALUES (?, ?, ?, ?, 'active', datetime('now'), ?, 40, 1)`,
      [id, userId, examId, mode, expires_at ? toSql(expires_at) : null]
    );

    let qIndex: number = 1;
    for (const qid of ids) {
      await run(
        `INSERT INTO session_questions (session_id, question_id, q_index, flagged) VALUES (?,?,?,0)`,
        [id, qid, qIndex++]
      );
    }

    await run("COMMIT");
  } catch (e) {
    await run("ROLLBACK");
    throw e;
  }

  const sess: ActiveSession | undefined = await getSessionById(id);
  if (!sess) throw new Error("Failed to create session");
  return sess;
}

export function getQuestionIdAt(
  sessionId: string,
  index: number
): Promise<{ question_id: number; flagged: 0 | 1 } | undefined> {
  const db: sqlite3.Database = getDb();
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT question_id, flagged FROM session_questions WHERE session_id=? AND q_index=?`,
      [sessionId, index],
      (
        err: Error | null,
        row: { question_id: number; flagged: 0 | 1 } | undefined
      ) => (err ? reject(err) : resolve(row))
    );
  });
}

export async function setCurrentIndex(
  sessionId: string,
  index: number
): Promise<void> {
  await run(`UPDATE exam_sessions SET current_index=? WHERE id=?`, [
    index,
    sessionId,
  ]);
}

export async function toggleFlag(
  sessionId: string,
  index: number
): Promise<0 | 1> {
  const row = await getQuestionIdAt(sessionId, index);
  if (!row) throw new Error("Question not in session");
  const next: 0 | 1 = row.flagged ? 0 : 1;
  await run(
    `UPDATE session_questions SET flagged=? WHERE session_id=? AND q_index=?`,
    [next, sessionId, index]
  );
  return next;
}

export async function recordSingleChoice(
  sessionId: string,
  questionId: number,
  answerId: number
): Promise<void> {
  await run("BEGIN");
  try {
    await run(
      `DELETE FROM session_answers WHERE session_id=? AND question_id=?`,
      [sessionId, questionId]
    );
    await run(
      `INSERT INTO session_answers (session_id, question_id, answer_id) VALUES (?,?,?)`,
      [sessionId, questionId, answerId]
    );
    await run("COMMIT");
  } catch (e) {
    await run("ROLLBACK");
    throw e;
  }
}

export async function toggleMultiChoice(
  sessionId: string,
  questionId: number,
  answerId: number
): Promise<void> {
  const existing = await get<{ id: number }>(
    `SELECT id FROM session_answers WHERE session_id=? AND question_id=? AND answer_id=? LIMIT 1`,
    [sessionId, questionId, answerId]
  );
  if (existing?.id) {
    await run(`DELETE FROM session_answers WHERE id=?`, [existing.id]);
  } else {
    await run(
      `INSERT INTO session_answers (session_id, question_id, answer_id) VALUES (?,?,?)`,
      [sessionId, questionId, answerId]
    );
  }
}

export async function selectedAnswerIds(
  sessionId: string,
  questionId: number
): Promise<number[]> {
  const db: sqlite3.Database = getDb();
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT answer_id FROM session_answers WHERE session_id=? AND question_id=? ORDER BY answer_id`,
      [sessionId, questionId],
      (err: Error | null, rows: Array<{ answer_id: number }>) =>
        err ? reject(err) : resolve(rows.map((r) => r.answer_id))
    );
  });
}

export async function progressForSession(
  sessionId: string
): Promise<{ answered: number; flagged: number; total: number }> {
  const db: sqlite3.Database = getDb();
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT
        (SELECT COUNT(*) FROM session_questions sq
           WHERE sq.session_id = s.id
             AND EXISTS (SELECT 1 FROM session_answers sa WHERE sa.session_id=sq.session_id AND sa.question_id=sq.question_id)
        ) AS answered,
        (SELECT COUNT(*) FROM session_questions sq WHERE sq.session_id = s.id AND sq.flagged=1) AS flagged,
        s.total_count as total
      FROM exam_sessions s
      WHERE s.id=? LIMIT 1`,
      [sessionId],
      (
        err: Error | null,
        row: { answered: number; flagged: number; total: number } | undefined
      ) =>
        err
          ? reject(err)
          : resolve(row ?? { answered: 0, flagged: 0, total: 40 })
    );
  });
}

export async function finalizeAndSubmit(
  sessionId: string,
  passPercent: number
): Promise<{ result: GradeResult; passed: boolean }> {
  const result: GradeResult = await gradeSession(sessionId);
  const passed: boolean = result.percent >= passPercent;

  await run("BEGIN");
  try {
    await run(
      `UPDATE exam_sessions
       SET status='submitted',
           finished_at=datetime('now'),
           correct_count=?,
           score_percent=?
       WHERE id=?`,
      [result.correct, result.percent, sessionId]
    );

    if (!passed) {
      // set cooldown anchor on users.last_failed_at
      await run(
        `UPDATE users
         SET last_failed_at=datetime('now')
         WHERE id = (SELECT user_id FROM exam_sessions WHERE id=?)`,
        [sessionId]
      );
    }

    await run("COMMIT");
  } catch (e) {
    await run("ROLLBACK");
    throw e;
  }

  return { result, passed };
}

export async function sessionStatuses(
  sessionId: string
): Promise<Array<"unanswered" | "answered" | "flagged">> {
  const db: sqlite3.Database = getDb();
  const rows: Array<{ q_index: number; flagged: 0 | 1; answered: number }> =
    await new Promise((resolve, reject) => {
      db.all(
        `
      SELECT sq.q_index,
             sq.flagged,
             EXISTS(
               SELECT 1 FROM session_answers sa
               WHERE sa.session_id=sq.session_id AND sa.question_id=sq.question_id
             ) as answered
      FROM session_questions sq
      WHERE sq.session_id=?
      ORDER BY sq.q_index ASC
      `,
        [sessionId],
        (
          err: Error | null,
          r: Array<{ q_index: number; flagged: 0 | 1; answered: number }>
        ) => (err ? reject(err) : resolve(r))
      );
    });

  const out: Array<"unanswered" | "answered" | "flagged"> = new Array(40).fill(
    "unanswered"
  );
  for (const r of rows) {
    if (r.flagged === 1) out[r.q_index - 1] = "flagged";
    else if (r.answered === 1) out[r.q_index - 1] = "answered";
  }
  return out;
}

export async function userAndChatForSession(
  sessionId: string
): Promise<{ user_id: number; tg_user_id: number } | undefined> {
  const db: sqlite3.Database = getDb();
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT u.id as user_id, u.tg_user_id as tg_user_id
       FROM exam_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id=? LIMIT 1`,
      [sessionId],
      (
        err: Error | null,
        row: { user_id: number; tg_user_id: number } | undefined
      ) => (err ? reject(err) : resolve(row))
    );
  });
}

export async function remainingSeconds(
  sessionId: string
): Promise<number | null> {
  const sess: ActiveSession | undefined = await getSessionById(sessionId);
  if (!sess || !sess.expires_at || sess.status !== "active") return null;
  const expiry: number = Date.parse(sess.expires_at + "Z");
  const now: number = Date.now();
  const diffMs: number = expiry - now;
  return Math.max(0, Math.floor(diffMs / 1000));
}

export async function setWarnSent(
  sessionId: string,
  kind: 10 | 5 | 1
): Promise<void> {
  const col: string =
    kind === 10 ? "warn10_sent" : kind === 5 ? "warn5_sent" : "warn1_sent";
  await run(`UPDATE exam_sessions SET ${col}=1 WHERE id=?`, [sessionId]);
}

function run(sql: string, params: unknown[] = []): Promise<void> {
  const db: sqlite3.Database = getDb();
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params as never[], (err: Error | null) =>
      err ? reject(err) : resolve()
    );
  });
}

function get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const db: sqlite3.Database = getDb();
  return new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params as never[], (err: Error | null, row: T | undefined) =>
      err ? reject(err) : resolve(row)
    );
  });
}

function toSql(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export async function clearAnswersForQuestion(
  sessionId: string,
  questionId: number
): Promise<void> {
  await run(
    `DELETE FROM session_answers WHERE session_id=? AND question_id=?`,
    [sessionId, questionId]
  );
}

export async function clearAllAnswers(sessionId: string): Promise<void> {
  await run(`DELETE FROM session_answers WHERE session_id=?`, [sessionId]);
}

export async function clearAllFlags(sessionId: string): Promise<void> {
  await run(`UPDATE session_questions SET flagged=0 WHERE session_id=?`, [
    sessionId,
  ]);
}

export async function abandonSession(sessionId: string): Promise<void> {
  await run(
    `UPDATE exam_sessions
     SET status='expired', finished_at=datetime('now')
     WHERE id=? AND status='active'`,
    [sessionId]
  );
}

/**
 * Restart a practice session:
 * - Only allowed if the session is practice.
 * - Marks current as 'expired', creates a new practice session for the same user/exam.
 * - Returns the new session row.
 */
export async function restartPracticeSession(
  sessionId: string
): Promise<ActiveSession> {
  const s = await getSessionById(sessionId);
  if (!s) throw new Error("Session not found");
  if (s.mode !== "practice")
    throw new Error("Restart allowed only in practice mode");

  await run(
    `UPDATE exam_sessions
     SET status='expired', finished_at=datetime('now')
     WHERE id=? AND status='active'`,
    [sessionId]
  );

  // Reuse same user & exam
  const next = await createExamSession(s.user_id, s.exam_id, "practice");
  return next;
}

export interface SessionService {
  getActiveSessionForUser(userId: number): Promise<ActiveSession | undefined>;
  getSessionById(sessionId: string): Promise<ActiveSession | undefined>;
  progressForSession(
    sessionId: string
  ): Promise<{ answered: number; flagged: number; total: number }>;
  selectedAnswerIds(sessionId: string, questionId: number): Promise<number[]>;
  sessionStatuses(
    sessionId: string
  ): Promise<Array<"unanswered" | "answered" | "flagged">>;
  remainingSeconds(sessionId: string): Promise<number | null>;
  finalizeAndSubmit(
    sessionId: string,
    passPercent: number
  ): Promise<{ result: GradeResult; passed: boolean }>;
  createExamSession(
    userId: number,
    examId: number,
    mode: SessionMode
  ): Promise<ActiveSession>;
}

export const sessionService: SessionService = {
  getActiveSessionForUser,
  getSessionById,
  progressForSession,
  selectedAnswerIds,
  sessionStatuses,
  remainingSeconds,
  finalizeAndSubmit,
  createExamSession,
};

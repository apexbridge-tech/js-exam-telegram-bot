import { nanoid } from "nanoid";
import { getDb } from "../db/sqlite.js";
import { selectFortyQuestionIds } from "../domain/selection.js";
import { EXAM_DURATION_MIN } from "../domain/policy.js";

export type SessionStatus = "active" | "submitted" | "expired";

export interface ActiveSession {
  id: string;
  user_id: number;
  exam_id: number;
  mode: "exam" | "practice";
  status: SessionStatus;
  started_at: string;
  expires_at: string | null;
  current_index: number;
  total_count: number;
}

export async function getActiveSessionForUser(
  userId: number
): Promise<ActiveSession | undefined> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM exam_sessions WHERE user_id=? AND status='active' ORDER BY started_at DESC LIMIT 1`,
      [userId],
      (err, row) =>
        err ? reject(err) : resolve(row as ActiveSession | undefined)
    );
  });
}

export async function createExamSession(
  userId: number,
  examId: number,
  mode: "exam" | "practice"
): Promise<ActiveSession> {
  const db = getDb();
  const id = nanoid();
  const started_at = new Date();
  const expires_at =
    mode === "exam"
      ? new Date(started_at.getTime() + EXAM_DURATION_MIN * 60_000)
      : null;

  const ids = await selectFortyQuestionIds();

  await run("BEGIN");
  try {
    await run(
      `INSERT INTO exam_sessions (id, user_id, exam_id, mode, status, started_at, expires_at, total_count, current_index)
       VALUES (?, ?, ?, ?, 'active', datetime('now'), ?, 40, 1)`,
      [id, userId, examId, mode, expires_at ? toSql(expires_at) : null]
    );

    let qIndex = 1;
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

  const sess = await getSessionById(id);
  if (!sess) throw new Error("Failed to create session");
  return sess;
}

export function getSessionById(id: string): Promise<ActiveSession | undefined> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM exam_sessions WHERE id=?`, [id], (err, row) =>
      err ? reject(err) : resolve(row as ActiveSession | undefined)
    );
  });
}

export function getQuestionIdAt(
  sessionId: string,
  index: number
): Promise<{ question_id: number; flagged: 0 | 1 } | undefined> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT question_id, flagged FROM session_questions WHERE session_id=? AND q_index=?`,
      [sessionId, index],
      (err, row) => (err ? reject(err) : resolve(row as any))
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
  const next = row.flagged ? 0 : 1;
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
  const exists = await get<{ id: number }>(
    `SELECT id FROM session_answers WHERE session_id=? AND question_id=? AND answer_id=? LIMIT 1`,
    [sessionId, questionId, answerId]
  );
  if (exists?.id) {
    await run(`DELETE FROM session_answers WHERE id=?`, [exists.id]);
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
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT answer_id FROM session_answers WHERE session_id=? AND question_id=? ORDER BY answer_id`,
      [sessionId, questionId],
      (err, rows) =>
        err ? reject(err) : resolve(rows.map((r: any) => r.answer_id as number))
    );
  });
}

export async function progressForSession(
  sessionId: string
): Promise<{ answered: number; flagged: number; total: number }> {
  const db = getDb();
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
      (err, row) => (err ? reject(err) : resolve(row as any))
    );
  });
}

function run(sql: string, params: any[] = []) {
  const db = getDb();
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const db = getDb();
  return new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params, (err, row) =>
      err ? reject(err) : resolve(row as T | undefined)
    );
  });
}

function toSql(d: Date) {
  // SQLite expects 'YYYY-MM-DD HH:MM:SS'
  return d.toISOString().replace("T", " ").slice(0, 19);
}

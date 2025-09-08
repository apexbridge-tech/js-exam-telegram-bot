import type sqlite3 from "sqlite3";
import { getDb } from "../db/sqlite.js";
import type { Section } from "../domain/policy.js";

export interface SectionStats {
  section: Section;
  total: number;
  correct: number;
}

export interface GradeResult {
  total: number;
  correct: number;
  percent: number; // 0..100
  bySection: SectionStats[];
}

export async function gradeSession(sessionId: string): Promise<GradeResult> {
  const db: sqlite3.Database = getDb();

  // Pull session questions with section + question_id
  const sqRows: Array<{
    q_index: number;
    question_id: number;
    section: Section;
  }> = await new Promise((resolve, reject) => {
    db.all(
      `SELECT sq.q_index, sq.question_id, q.section
       FROM session_questions sq
       JOIN questions q ON q.id = sq.question_id
       WHERE sq.session_id = ?
       ORDER BY sq.q_index ASC`,
      [sessionId],
      (
        err: Error | null,
        rows: Array<{ q_index: number; question_id: number; section: Section }>
      ) => (err ? reject(err) : resolve(rows))
    );
  });

  const bySectionMap: Record<Section, { total: number; correct: number }> = {
    objects: { total: 0, correct: 0 },
    classes: { total: 0, correct: 0 },
    builtins: { total: 0, correct: 0 },
    advfunc: { total: 0, correct: 0 },
  };

  let correctCount = 0;

  for (const row of sqRows) {
    bySectionMap[row.section].total += 1;
    const isCorrect: boolean = await isQuestionCorrect(
      sessionId,
      row.question_id
    );
    if (isCorrect) {
      correctCount += 1;
      bySectionMap[row.section].correct += 1;
    }
  }

  const total: number = sqRows.length;
  const percent: number =
    total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const bySection: SectionStats[] = (
    Object.keys(bySectionMap) as Section[]
  ).map((s: Section) => ({
    section: s,
    total: bySectionMap[s].total,
    correct: bySectionMap[s].correct,
  }));

  return { total, correct: correctCount, percent, bySection };
}

export async function isQuestionCorrect(
  sessionId: string,
  questionId: number
): Promise<boolean> {
  const db: sqlite3.Database = getDb();

  const correctIds: number[] = await new Promise((resolve, reject) => {
    db.all(
      `SELECT id FROM answers WHERE question_id=? AND is_correct=1 ORDER BY id ASC`,
      [questionId],
      (err: Error | null, rows: Array<{ id: number }>) =>
        err ? reject(err) : resolve(rows.map((r) => r.id))
    );
  });

  const chosenIds: number[] = await new Promise((resolve, reject) => {
    db.all(
      `SELECT answer_id FROM session_answers WHERE session_id=? AND question_id=? ORDER BY answer_id ASC`,
      [sessionId, questionId],
      (err: Error | null, rows: Array<{ answer_id: number }>) =>
        err ? reject(err) : resolve(rows.map((r) => r.answer_id))
    );
  });

  if (correctIds.length === 0) return false;
  if (correctIds.length !== chosenIds.length) return false;

  for (let i = 0; i < correctIds.length; i++) {
    if (correctIds[i] !== chosenIds[i]) return false;
  }
  return true;
}

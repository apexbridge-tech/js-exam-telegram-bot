import { getDb } from "../db/sqlite.js";

export interface QuestionRow {
  id: number;
  section: string;
  type: "single" | "multi";
  text: string;
  code_snippet?: string | null;
  explanation?: string | null;
  reference_url?: string | null;
  reference_title?: string | null;
}

export interface AnswerRow {
  id: number;
  question_id: number;
  text: string;
  is_correct: 0 | 1;
  order_index: number;
}

export function getQuestionById(id: number): Promise<QuestionRow> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM questions WHERE id=?`, [id], (err, row) =>
      err ? reject(err) : resolve(row as QuestionRow)
    );
  });
}

export function getAnswersForQuestion(qid: number): Promise<AnswerRow[]> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM answers WHERE question_id=? ORDER BY order_index ASC`,
      [qid],
      (err, rows) => (err ? reject(err) : resolve(rows as AnswerRow[]))
    );
  });
}

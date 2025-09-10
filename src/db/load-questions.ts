import fs from "fs";
import path from "path";
import type sqlite3 from "sqlite3";
import { getDb } from "./sqlite.js";
import { z } from "zod";

/* -------------------- schema (only what we need here) -------------------- */

const Section = z.enum(["objects", "classes", "builtins", "advfunc"]);
const QType = z.enum(["single", "multi"]);

const QuestionSchema = z.object({
  // identifiers
  source_id: z.string().min(1).optional(),
  section: Section,
  type: QType,
  text: z.string().min(1),

  // meta we want to sync
  explanation: z.string().optional(),
  reference_url: z.string().url().optional(),
  reference_title: z.string().min(1).optional(),
});

type QInput = z.infer<typeof QuestionSchema>;

interface DbMetaRow {
  id: number;
  explanation: string | null;
  reference_url: string | null;
  reference_title: string | null;
}

/* --------------------------- tiny util helpers --------------------------- */

function readQuestionsFile(filePath: string): QInput[] {
  const raw = fs.readFileSync(path.resolve(filePath), "utf8");
  const parsed = JSON.parse(raw) as unknown;

  // Accept both: array of questions OR { questions: [...] }
  const arr: unknown = Array.isArray(parsed)
    ? parsed
    : (parsed as { questions?: unknown }).questions;
  if (!Array.isArray(arr)) {
    throw new Error(
      "questions.json must be an array or an object with a 'questions' array."
    );
  }
  return arr.map((q) => QuestionSchema.parse(q));
}

function norm(s: string | null | undefined): string {
  return (s ?? "").replace(/\r\n/g, "\n").trim();
}

function differs(db: DbMetaRow, q: QInput): boolean {
  const e1 = norm(db.explanation);
  const e2 = norm(q.explanation);
  if (e1 !== e2) return true;

  const u1 = norm(db.reference_url);
  const u2 = norm(q.reference_url);
  if (u1 !== u2) return true;

  const t1 = norm(db.reference_title);
  const t2 = norm(q.reference_title);
  if (t1 !== t2) return true;

  return false;
}

function get<T>(
  sql: string,
  params: readonly unknown[] = []
): Promise<T | undefined> {
  const db: sqlite3.Database = getDb();
  return new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params as never, (err, row: T) =>
      err ? reject(err) : resolve(row)
    );
  });
}

function run(sql: string, params: readonly unknown[] = []): Promise<void> {
  const db: sqlite3.Database = getDb();
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params as never, function (err) {
      err ? reject(err) : resolve();
    });
  });
}

async function findExisting(dbKey: {
  source_id?: string;
  section: string;
  text: string;
}): Promise<DbMetaRow | undefined> {
  if (dbKey.source_id) {
    const r = await get<DbMetaRow>(
      `SELECT id, explanation, reference_url, reference_title
         FROM questions
        WHERE source_id=? LIMIT 1`,
      [dbKey.source_id]
    );
    if (r) return r;
  }
  return get<DbMetaRow>(
    `SELECT id, explanation, reference_url, reference_title
       FROM questions
      WHERE section=? AND text=? LIMIT 1`,
    [dbKey.section, dbKey.text]
  );
}

/* ------------------------------ main entry ------------------------------ */

/**
 * Compare (explanation, reference_url, reference_title) per question and update DB when different.
 * @returns stats { scanned, updated, missing }
 */
export async function syncQuestionMetaFromJson(
  filePath: string
): Promise<{ scanned: number; updated: number; missing: number }> {
  const items: QInput[] = readQuestionsFile(filePath);

  let scanned = 0;
  let updated = 0;
  let missing = 0;

  await run("BEGIN");
  try {
    for (const q of items) {
      scanned++;
      const existing = await findExisting({
        source_id: q.source_id,
        section: q.section,
        text: q.text,
      });
      if (!existing) {
        missing++;
        continue;
      }

      if (!differs(existing, q)) {
        continue; // in sync
      }

      await run(
        `UPDATE questions
            SET explanation     = ?,
                reference_url   = ?,
                reference_title = ?
          WHERE id = ?`,
        [
          q.explanation ?? null,
          q.reference_url ?? null,
          q.reference_title ?? null,
          existing.id,
        ]
      );
      updated++;
    }
    await run("COMMIT");
  } catch (e) {
    await run("ROLLBACK");
    throw e;
  }

  return { scanned, updated, missing };
}

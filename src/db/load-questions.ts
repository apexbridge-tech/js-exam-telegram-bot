import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { logger } from "../logger.js";
import { getDb } from "./sqlite.js";

const Section = z.enum(["objects", "classes", "builtins", "advfunc"]);
const QType = z.enum(["single", "multi"]);

const QuestionSchema = z.object({
  section: Section,
  type: QType,
  text: z.string().min(5),
  code_snippet: z.string().optional(),
  options: z
    .array(z.object({ text: z.string().min(1), correct: z.boolean() }))
    .min(2),
  explanation: z.string().optional(),
  reference_url: z.string().url().optional(),
  reference_title: z.string().min(3).optional(),
});

const QuestionsFileSchema = z.array(QuestionSchema).superRefine((arr, ctx) => {
  arr.forEach((q, idx) => {
    const correctCount = q.options.filter((o) => o.correct).length;
    if (q.type === "single" && correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Question #${idx + 1} must have exactly one correct option`,
        path: [idx, "options"],
      });
    }
    if (q.type === "multi" && correctCount < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Question #${
          idx + 1
        } (multi) must have at least two correct options`,
        path: [idx, "options"],
      });
    }
  });
});

function locateQuestionsPath(): string {
  // Prefer compiled asset
  const here = path.dirname(fileURLToPath(import.meta.url)); // dist/db or src/db
  const distCandidate = path.resolve(here, "..", "data", "questions.json");
  if (fs.existsSync(distCandidate)) return distCandidate;

  // Dev path from project root
  const devCandidate = path.resolve(process.cwd(), "data", "questions.json");
  if (fs.existsSync(devCandidate)) return devCandidate;

  throw new Error("data/questions.json not found (dist/data or data/)");
}

export async function ensureQuestionsLoaded(minCount = 50): Promise<void> {
  const db = getDb();
  const count = await get<number>(`SELECT COUNT(*) as c FROM questions`);
  if ((count ?? 0) >= minCount) {
    logger.info(`Question bank present (${count}); skip loading`);
    return;
  }

  const file = locateQuestionsPath();
  const raw = fs.readFileSync(file, "utf8");
  const parsed = QuestionsFileSchema.parse(JSON.parse(raw));

  logger.info(`Loading ${parsed.length} questions from ${file}...`);
  await run("BEGIN");

  try {
    for (const q of parsed) {
      // Idempotent: check if same section+text already exists
      const existing = await get<{ id: number }>(
        `SELECT id FROM questions WHERE section = ? AND text = ? LIMIT 1`,
        [q.section, q.text]
      );

      let qid: number;
      if (existing?.id) {
        qid = existing.id;
        // Clean answers to allow updates
        await run(`DELETE FROM answers WHERE question_id = ?`, [qid]);
        await run(
          `UPDATE questions SET type=?, code_snippet=?, explanation=?, is_active=1, reference_url=?, reference_title=? WHERE id=?`,
          [
            q.type,
            q.code_snippet ?? null,
            q.explanation ?? null,
            q.reference_url ?? null,
            q.reference_title ?? null,
            qid,
          ]
        );
      } else {
        qid = await insertQuestion(
          q.section,
          q.type,
          q.text,
          q.code_snippet ?? null,
          q.explanation ?? null,
          q.reference_url ?? null,
          q.reference_title ?? null
        );
      }

      // Insert answers in declared order
      for (let i = 0; i < q.options.length; i++) {
        const opt = q.options[i];
        await run(
          `INSERT INTO answers (question_id, text, is_correct, order_index) VALUES (?,?,?,?)`,
          [qid, opt.text, opt.correct ? 1 : 0, i]
        );
      }
    }

    await run("COMMIT");
    const after = await get<number>(`SELECT COUNT(*) as c FROM questions`);
    logger.info(`Loaded questions complete. Total now: ${after}`);
  } catch (e) {
    await run("ROLLBACK");
    throw e;
  }
}

function insertQuestion(
  section: string,
  type: string,
  text: string,
  code: string | null,
  explanation: string | null,
  referenceUrl: string | null,
  referenceTitle: string | null
): Promise<number> {
  const db = getDb();
  return new Promise<number>((resolve, reject) => {
    db.run(
      `INSERT INTO questions (section, type, text, code_snippet, explanation, reference_url, reference_title)
       VALUES (?,?,?,?,?,?,?)`,
      [section, type, text, code, explanation, referenceUrl, referenceTitle],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID as number);
      }
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
      err ? reject(err) : resolve((row as any)?.c ?? (row as T))
    );
  });
}

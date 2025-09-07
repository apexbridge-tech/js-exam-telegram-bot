import type sqlite3 from "sqlite3";
import { getDb } from "../db/sqlite.js";
import { DISTRIBUTION, type Section } from "./policy.js";

/**
 * Pick N random question IDs from a given section.
 */
async function pickSection(section: Section, n: number): Promise<number[]> {
  const db: sqlite3.Database = getDb();

  return new Promise<number[]>((resolve, reject): void => {
    db.all(
      `SELECT id FROM questions
       WHERE section = ? AND is_active = 1
       ORDER BY RANDOM() LIMIT ?`,
      [section, n],
      (err: Error | null, rows: Array<{ id: number }>): void => {
        if (err) {
          reject(err);
          return;
        }
        const ids: number[] = rows.map((r: { id: number }): number => r.id);
        resolve(ids);
      }
    );
  });
}

/**
 * Select exactly 40 question IDs following the required distribution.
 * Final order is globally shuffled (Fisher–Yates).
 */
export async function selectFortyQuestionIds(): Promise<number[]> {
  const ids: number[] = [];

  const entries: Array<[Section, number]> = Object.entries(
    DISTRIBUTION
  ) as Array<[Section, number]>;

  for (const [section, count] of entries) {
    const part: number[] = await pickSection(section, count);
    if (part.length < count) {
      throw new Error(
        `Not enough questions in section '${section}'. Need ${count}, got ${part.length}`
      );
    }
    ids.push(...part);
  }

  // Fisher–Yates shuffle
  for (let i: number = ids.length - 1; i > 0; i--) {
    const j: number = Math.floor(Math.random() * (i + 1));
    const tmp: number = ids[i];
    ids[i] = ids[j];
    ids[j] = tmp;
  }

  return ids;
}

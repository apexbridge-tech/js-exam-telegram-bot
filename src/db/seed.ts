import { getDb } from "./sqlite.js";
import { logger } from "../logger.js";

export async function seedBaseExam() {
  const db = getDb();

  await run(
    `INSERT OR IGNORE INTO exams (code, title, duration_minutes, pass_percent)
     VALUES (?, ?, ?, ?)`,
    ["JSA-41-01", "JavaScript Certification JSA-41-01", 60, 70]
  );

  // Optional: ensure meta schema_version exists (already inserted by schema.sql)
  logger.info("Seeded base exam: JSA-41-01 (60 min, 70%)");
}

function run(sql: string, params: any[] = []) {
  const db = getDb();
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

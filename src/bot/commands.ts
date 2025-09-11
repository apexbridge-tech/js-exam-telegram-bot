import type sqlite3 from "sqlite3";
import { getDb } from "../db/sqlite.js";
import { Services } from "../services/services.js";

let cachedExamId: number | null = null;

function fetchExamIdByCode(code: string): Promise<number> {
  const db: sqlite3.Database = getDb();
  return new Promise<number>((resolve, reject) => {
    db.get(
      `SELECT id FROM exams WHERE code=? LIMIT 1`,
      [code],
      (err: Error | null, row: { id: number } | undefined): void => {
        if (err) {
          reject(err);
          return;
        }
        if (!row) {
          reject(new Error(`Exam code not found: ${code}`));
          return;
        }
        resolve(row.id);
      }
    );
  });
}

async function examId(): Promise<number> {
  if (cachedExamId !== null) return cachedExamId;
  const id: number = await fetchExamIdByCode("JSA-41-01");
  cachedExamId = id;
  return id;
}

function canRetake(
  nowMs: number,
  lastFailedAt: string | null,
  cooldownDays: number
): { ok: boolean; nextIso: string | null } {
  if (!lastFailedAt) return { ok: true, nextIso: null };
  const lastMs: number = Date.parse(lastFailedAt + "Z"); // stored in UTC string format
  const waitMs: number = cooldownDays * 24 * 60 * 60 * 1000;
  const nextMs: number = lastMs + waitMs;
  return nowMs >= nextMs
    ? { ok: true, nextIso: null }
    : { ok: false, nextIso: new Date(nextMs).toISOString().slice(0, 10) };
}

export async function registerCommands(
  services: Services,
  exam: "JSA-41-01" = "JSA-41-01"
): Promise<void> {
  const { CommandFactory } = await import("./commandFactory.js");
  const examId: number = await fetchExamIdByCode(exam);

  const commandFactory = new CommandFactory(services, examId);
  commandFactory.registerCommand(
    await import("./commands/startCommand.js").then((m) => m.StartCommand)
  );
  commandFactory.registerCommand(
    await import("./commands/beginExamCommand.js").then(
      (m) => m.BeginExamCommand
    )
  );
  commandFactory.registerCommand(
    await import("./commands/practiceCommand.js").then((m) => m.PracticeCommand)
  );
  commandFactory.registerCommand(
    await import("./commands/progressCommand.js").then((m) => m.ProgressCommand)
  );
  commandFactory.registerCommand(
    await import("./commands/questionCommand.js").then((m) => m.QuestionCommand)
  );
  commandFactory.registerCommand(
    await import("./commands/submitCommand.js").then((m) => m.SubmitCommand)
  );
  commandFactory.registerCommand(
    await import("./commands/resetCommand.js").then((m) => m.ResetCommand)
  );
  commandFactory.registerCommand(
    await import("./commands/adminStatsCommand.js").then(
      (m) => m.AdminStatsCommand
    )
  );
  commandFactory.registerCommand(
    await import("./commands/healthCommand.js").then((m) => m.HealthCommand)
  );

  commandFactory.submit();
}

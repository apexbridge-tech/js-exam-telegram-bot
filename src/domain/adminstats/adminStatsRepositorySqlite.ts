import type sqlite3 from "sqlite3";
import { getDb } from "../../db/sqlite.js";
import type { AdminStatsRepository } from "./adminStatsRepository.js";
import type {
  UsageWindow,
  UserCounts,
  ModeUsage,
  ExamSummary,
} from "./types.js";

export class AdminStatsRepositorySqlite implements AdminStatsRepository {
  private readonly db: sqlite3.Database;

  public constructor() {
    this.db = getDb();
  }

  public async getUserCounts(win: UsageWindow): Promise<UserCounts> {
    const usersTotal = await this.one<number>(
      `SELECT COUNT(*) AS c FROM users`
    );
    const usersActiveWindow = await this.one<number>(
      `SELECT COUNT(DISTINCT user_id) AS c
         FROM exam_sessions
        WHERE started_at >= ? AND started_at < ?`,
      [win.startIso, win.endIso]
    );
    return { usersTotal, usersActiveWindow };
  }

  public async getModeUsage(win: UsageWindow): Promise<ModeUsage[]> {
    const rows = await this.all<{
      mode: "exam" | "practice";
      sessions: number;
      users: number;
    }>(
      `SELECT mode,
              COUNT(*)            AS sessions,
              COUNT(DISTINCT user_id) AS users
         FROM exam_sessions
        WHERE started_at >= ? AND started_at < ?
        GROUP BY mode
        ORDER BY mode`,
      [win.startIso, win.endIso]
    );
    const modes: Array<"exam" | "practice"> = ["exam", "practice"];
    // Ensure both modes present even if zero:
    const byMode: Record<string, ModeUsage> = {};
    for (const m of modes) byMode[m] = { mode: m, sessions: 0, users: 0 };
    for (const r of rows) byMode[r.mode] = r;
    return [byMode.exam, byMode.practice];
  }

  public async getExamSummary(
    win: UsageWindow,
    passPercent: number
  ): Promise<ExamSummary> {
    const sub = await this.all<{
      score_percent: number | null;
      started_at: string;
      finished_at: string | null;
    }>(
      `SELECT score_percent, started_at, finished_at
         FROM exam_sessions
        WHERE mode='exam' AND status='submitted'
          AND finished_at >= ? AND finished_at < ?`,
      [win.startIso, win.endIso]
    );

    let submitted = 0,
      passes = 0,
      sumScore = 0,
      scoreCount = 0;
    let sumMinutes = 0,
      timeCount = 0;

    for (const r of sub) {
      submitted++;
      if (typeof r.score_percent === "number") {
        sumScore += r.score_percent;
        scoreCount++;
        if (r.score_percent >= passPercent) passes++;
      }
      if (r.finished_at) {
        const s = Date.parse(r.started_at);
        const f = Date.parse(r.finished_at);
        if (!Number.isNaN(s) && !Number.isNaN(f) && f > s) {
          sumMinutes += (f - s) / 60000;
          timeCount++;
        }
      }
    }
    const fails = submitted - passes;
    const passRatePct = submitted
      ? +((100 * passes) / submitted).toFixed(1)
      : 0;
    const avgScorePct = scoreCount ? +(sumScore / scoreCount).toFixed(1) : null;
    const avgMinutes = timeCount ? +(sumMinutes / timeCount).toFixed(1) : null;

    return { submitted, passes, fails, passRatePct, avgScorePct, avgMinutes };
  }

  /* ------------ small typed helpers ------------ */
  private one<T extends number>(
    sql: string,
    params: readonly unknown[] = []
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.db.get(sql, params as never, (err, row?: { c: T }) =>
        err ? reject(err) : resolve(row?.c ?? (0 as T))
      );
    });
  }

  private all<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
      this.db.all(sql, params as never, (err, rows: T[]) =>
        err ? reject(err) : resolve(rows)
      );
    });
  }
}

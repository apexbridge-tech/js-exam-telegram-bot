import type {
  UsageWindow,
  UserCounts,
  ModeUsage,
  ExamSummary,
} from "./types.js";

export interface AdminStatsRepository {
  getUserCounts(win: UsageWindow): Promise<UserCounts>;
  getModeUsage(win: UsageWindow): Promise<ModeUsage[]>;
  getExamSummary(win: UsageWindow, passPercent: number): Promise<ExamSummary>;
}

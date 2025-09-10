import type { AdminStats, UsageWindow } from "./types.js";

export interface AdminStatsService {
  getAdminStats(win: UsageWindow, passPercent: number): Promise<AdminStats>;
}

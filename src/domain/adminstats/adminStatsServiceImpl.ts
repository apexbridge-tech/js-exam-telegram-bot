import type { AdminStatsRepository } from "./adminStatsRepository.js";
import { AdminStatsRepositorySqlite } from "./adminStatsRepositorySqlite.js";
import type { AdminStatsService } from "./adminStatsService.js";
import type { AdminStats, UsageWindow } from "./types.js";

export class AdminStatsServiceImpl implements AdminStatsService {
  private readonly repo: AdminStatsRepository;

  public constructor(repo: AdminStatsRepository) {
    this.repo = repo;
  }

  public async getAdminStats(
    win: UsageWindow,
    passPercent: number
  ): Promise<AdminStats> {
    const [users, usageByMode, exam] = await Promise.all([
      this.repo.getUserCounts(win),
      this.repo.getModeUsage(win),
      this.repo.getExamSummary(win, passPercent),
    ]);
    return { window: win, users, usageByMode, exam };
  }
}

export const createAdminStatsService: () => AdminStatsService = () =>
  new AdminStatsServiceImpl(new AdminStatsRepositorySqlite());

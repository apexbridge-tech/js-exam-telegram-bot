export interface UsageWindow {
  startIso: string; // inclusive
  endIso: string; // exclusive
}

export interface UserCounts {
  usersTotal: number; // from users table
  usersActiveWindow: number; // touched the bot (sessions) in window
}

export interface ModeUsage {
  mode: "exam" | "practice";
  sessions: number; // sessions started in window
  users: number; // distinct users with at least one session in window
}

export interface ExamSummary {
  submitted: number; // submitted in window
  passes: number;
  fails: number;
  passRatePct: number; // 0..100 (1 decimal)
  avgScorePct: number | null; // 1 decimal
  avgMinutes: number | null; // 1 decimal
}

export interface AdminStats {
  window: UsageWindow;
  users: UserCounts;
  usageByMode: ModeUsage[];
  exam: ExamSummary;
}

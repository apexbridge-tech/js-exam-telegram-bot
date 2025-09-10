import type { GradeResult, SectionStats } from "./scoring.service.js";
import type { Section } from "../domain/policy.js";

export interface ReportStrings {
  headline: string;
  detail: string;
  sections: string;
  footer: string;
}

export function renderResultReport(
  result: GradeResult,
  passPercent: number,
  failedCooldownDays: number,
  nextEligibleDateIso: string | null
): ReportStrings {
  const passed: boolean = result.percent >= passPercent;
  const headlineIcon: string = passed ? "✅" : "❌";
  const headline: string = `${headlineIcon} *Score:* ${result.correct}/${result.total} - *${result.percent}%* (pass ≥ ${passPercent}%)`;

  const detail: string = passed
    ? "Great job! You met the passing threshold."
    : "You didn't reach the threshold this time.";

  const sections: string = renderSectionTable(result.bySection);

  const footer: string = passed
    ? "You can start a new *practice* session any time: /practice"
    : nextEligibleDateIso
    ? `You may retake the exam after *${failedCooldownDays} days*: available on *${nextEligibleDateIso}*`
    : `You may retake after *${failedCooldownDays} days*.`;

  return { headline, detail, sections, footer };
}

function renderSectionTable(rows: SectionStats[]): string {
  const order: Section[] = ["objects", "classes", "builtins", "advfunc"];
  const lines: string[] = ["*By section:*"];
  for (const s of order) {
    const row: SectionStats | undefined = rows.find((r) => r.section === s);
    if (!row) continue;
    lines.push(`• _${s}_ - ${row.correct}/${row.total}`);
  }
  return lines.join("\n");
}

export interface ReportService {
  renderResultReport(
    result: GradeResult,
    passPercent: number,
    failedCooldownDays: number,
    nextEligibleDateIso: string | null
  ): ReportStrings;
}

export const reportService: ReportService = {
  renderResultReport,
};

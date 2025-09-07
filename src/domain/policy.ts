export const EXAM_CODE = "JSA-41-01";

export const DISTRIBUTION = {
  objects: 11,
  classes: 7,
  builtins: 12,
  advfunc: 10,
} as const;

export const TOTAL_QUESTIONS = 40 as const;
export const EXAM_DURATION_MIN = 60 as const; // enforced in Step 2.4 timers
export const PASS_PERCENT = 70 as const;

export type Section = keyof typeof DISTRIBUTION;
export type Mode = "exam" | "practice";
export type QType = "single" | "multi";

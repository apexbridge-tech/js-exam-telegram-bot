export type Section = "objects" | "classes" | "builtins" | "advfunc";
export type QType = "single" | "multi";

export interface QuestionJson {
  section: Section;
  type: QType;
  text: string;
  code_snippet?: string;
  options: Array<{ text: string; correct: boolean }>;
  explanation?: string;
}

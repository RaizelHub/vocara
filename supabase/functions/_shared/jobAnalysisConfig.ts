import { ALLOWED_EVALUATION_MODELS } from "./evaluationConfig.ts";
import { EvaluationFunctionError } from "./groq.ts";

export const MIN_JOB_CHARS = 100;
export const MAX_JOB_CHARS = 12_000;
export const MIN_QUESTION_COUNT = 5;
export const MAX_QUESTION_COUNT = 12;

export const MAX_JOB_GENERATIONS_PER_DAY = 40;
export const MAX_JOB_ANALYSES_PER_DAY = 8;
export const MAX_JOB_INTERVIEWS_PER_DAY = 12;

export const DEFAULT_JOB_ANALYSIS_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_JOB_ANALYSIS_VERSION = "v1";

export const IMPORTANCE_LEVELS = ["high", "medium", "low"] as const;
export type JobImportance = (typeof IMPORTANCE_LEVELS)[number];

export const SENIORITY_LEVELS = [
  "intern",
  "entry",
  "junior",
  "mid",
  "senior",
  "lead",
  "manager",
  "unknown",
] as const;
export type JobSeniority = (typeof SENIORITY_LEVELS)[number];

export const JOB_QUESTION_TYPES = [
  "introduction",
  "behavioral",
  "technical",
  "situational",
  "motivation",
  "general",
] as const;
export type JobQuestionType = (typeof JOB_QUESTION_TYPES)[number];

export const QUESTION_DIFFICULTIES = [
  "beginner",
  "intermediate",
  "advanced",
] as const;
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

export const DIFFICULTY_MODES = ["match", "easier", "harder"] as const;
export type DifficultyMode = (typeof DIFFICULTY_MODES)[number];

export const INTERVIEWER_STYLES = [
  "supportive",
  "balanced",
  "challenging",
] as const;

export const SENIORITY_DIFFICULTY: Record<JobSeniority, QuestionDifficulty> = {
  intern: "beginner",
  entry: "beginner",
  junior: "beginner",
  mid: "intermediate",
  senior: "advanced",
  lead: "advanced",
  manager: "advanced",
  unknown: "intermediate",
};

export function seniorityToDifficulty(seniority: string): QuestionDifficulty {
  return SENIORITY_DIFFICULTY[seniority as JobSeniority] ?? "intermediate";
}

export function adjustDifficulty(
  base: QuestionDifficulty,
  mode: DifficultyMode,
): QuestionDifficulty {
  const order: QuestionDifficulty[] = ["beginner", "intermediate", "advanced"];
  const index = order.indexOf(base);
  if (mode === "easier") return order[Math.max(0, index - 1)];
  if (mode === "harder") return order[Math.min(order.length - 1, index + 1)];
  return base;
}

export type JobTextValidation =
  | { ok: true; normalized: string }
  | { ok: false; code: "empty" | "too_short" | "too_long" };

export function validateJobText(raw: string): JobTextValidation {
  const value = String(raw ?? "");
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) return { ok: false, code: "empty" };
  if (normalized.length < MIN_JOB_CHARS) {
    return { ok: false, code: "too_short" };
  }
  if (normalized.length > MAX_JOB_CHARS) return { ok: false, code: "too_long" };
  return { ok: true, normalized };
}

export function validateAnalysisVersion(version: string) {
  return /^[a-zA-Z0-9._-]{1,40}$/.test(version);
}

export type JobAnalysisConfig = {
  apiKey: string;
  model: string;
  version: string;
};

export function getJobAnalysisConfig(): JobAnalysisConfig {
  const apiKey = Deno.env.get("GROQ_API_KEY")?.trim();
  const model = Deno.env.get("GROQ_JOB_ANALYSIS_MODEL")?.trim() ||
    DEFAULT_JOB_ANALYSIS_MODEL;
  const version = Deno.env.get("VOCARA_JOB_ANALYSIS_VERSION")?.trim() ||
    DEFAULT_JOB_ANALYSIS_VERSION;
  if (!apiKey || !ALLOWED_EVALUATION_MODELS.has(model)) {
    throw new EvaluationFunctionError(
      500,
      "JOB_ANALYSIS_NOT_CONFIGURED",
      "Job analysis is not configured yet.",
      false,
    );
  }
  if (!validateAnalysisVersion(version)) {
    throw new EvaluationFunctionError(
      500,
      "JOB_ANALYSIS_NOT_CONFIGURED",
      "Job analysis configuration is invalid.",
      false,
    );
  }
  return { apiKey, model, version };
}

export function uncertainJobOutcome(code: string) {
  return code === "GROQ_TIMEOUT" || code === "GROQ_UNAVAILABLE";
}

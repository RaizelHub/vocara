import { ALLOWED_EVALUATION_MODELS } from "./evaluationConfig.ts";
import { EvaluationFunctionError } from "./groq.ts";

export const MAX_RESUME_FILE_BYTES = 5_242_880; // 5 MB
export const MAX_RESUME_TEXT_CHARS = 18_000;
export const MIN_RESUME_TEXT_CHARS = 20;

export const DEFAULT_RESUME_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_RESUME_VERSION = "v1";

export const RESUME_DAILY_LIMIT = 40;
export const RESUME_JOB_MATCH_DAILY_LIMIT = 40;

export type ResumeSeniority =
  | "intern"
  | "entry"
  | "junior"
  | "mid"
  | "senior"
  | "lead"
  | "manager"
  | "unknown";

export const RESUME_SENIORITY_LEVELS = [
  "intern",
  "entry",
  "junior",
  "mid",
  "senior",
  "lead",
  "manager",
  "unknown",
] as const;

export const RESUME_PROCESSING_STATUSES = [
  "pending",
  "uploaded",
  "extracting",
  "extract_failed",
  "analyzing",
  "completed",
  "failed",
] as const;
export type ResumeProcessingStatus = (typeof RESUME_PROCESSING_STATUSES)[number];

export const MATCH_STATUSES = [
  "strong_match",
  "partial_match",
  "not_found",
  "transferable",
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export type ResumeConfig = {
  apiKey: string;
  model: string;
  version: string;
};

export function getResumeConfig(): ResumeConfig {
  const apiKey = Deno.env.get("GROQ_API_KEY")?.trim();
  const model = Deno.env.get("GROQ_RESUME_MODEL")?.trim() ||
    DEFAULT_RESUME_MODEL;
  const version = Deno.env.get("VOCARA_RESUME_ANALYSIS_VERSION")?.trim() ||
    DEFAULT_RESUME_VERSION;
  if (!apiKey || !ALLOWED_EVALUATION_MODELS.has(model)) {
    throw new EvaluationFunctionError(
      500,
      "RESUME_NOT_CONFIGURED",
      "Resume analysis is not configured yet.",
      false,
    );
  }
  if (!/^[a-zA-Z0-9._-]{1,40}$/.test(version)) {
    throw new EvaluationFunctionError(
      500,
      "RESUME_NOT_CONFIGURED",
      "Resume analysis configuration is invalid.",
      false,
    );
  }
  return { apiKey, model, version };
}

export const MAX_COMPLETION_TOKENS_RESUME = 2800;
export const MAX_COMPLETION_TOKENS_MATCH = 1400;
export const MAX_COMPLETION_TOKENS_QUESTION = 1200;

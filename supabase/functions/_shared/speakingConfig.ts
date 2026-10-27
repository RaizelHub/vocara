export const SPEAKING_SCORE_WEIGHTS = {
  clarity: 0.25,
  fluency: 0.2,
  grammar: 0.15,
  vocabulary: 0.15,
  structure: 0.15,
  conciseness: 0.1,
} as const;

export const SPEAKING_SCORE_KEYS = [
  "clarity",
  "fluency",
  "grammar",
  "vocabulary",
  "structure",
  "conciseness",
] as const;

export type SpeakingScoreKey = (typeof SPEAKING_SCORE_KEYS)[number];
export type SpeakingCategoryScores = Record<SpeakingScoreKey, number>;

export const SPEAKING_CATEGORIES = [
  "everyday",
  "workplace",
  "introduction",
  "storytelling",
  "opinion",
  "explanation",
  "quick_response",
] as const;
export type SpeakingCategory = (typeof SPEAKING_CATEGORIES)[number];

export const SPEAKING_DIFFICULTIES = [
  "warm_up",
  "moderate",
  "challenging",
] as const;
export type SpeakingDifficulty = (typeof SPEAKING_DIFFICULTIES)[number];

export const DEFAULT_SPEAKING_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_SPEAKING_EVALUATION_VERSION = "v1";
export const ALLOWED_SPEAKING_MODELS = new Set([
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b",
]);
const ALLOWED_SPEAKING_REASONING_EFFORTS = new Set(["low", "medium", "high"]);
const DEFAULT_SPEAKING_REASONING_EFFORT = "low";

export function calculateSpeakingOverallScore(scores: SpeakingCategoryScores) {
  return Math.round(
    SPEAKING_SCORE_KEYS.reduce(
      (total, key) => total + scores[key] * SPEAKING_SCORE_WEIGHTS[key],
      0,
    ),
  );
}

const SPEAKING_FILLER_PHRASES = [
  "um",
  "uh",
  "erm",
  "hmm",
  "like",
  "you know",
  "i mean",
  "kind of",
  "sort of",
  "basically",
  "actually",
] as const;

export function countSpeakingFillerWords(transcript: string) {
  const normalized = transcript.normalize("NFKC").toLowerCase();
  return SPEAKING_FILLER_PHRASES.flatMap((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const count = normalized.match(
      new RegExp(`(^|[^\\p{L}])${escaped}(?=$|[^\\p{L}])`, "gu"),
    )?.length ?? 0;
    return count > 0 ? [{ word, count }] : [];
  });
}

export function isSpeakingTranscriptInsufficient(transcript: string) {
  const normalized = transcript
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\[(music|noise|silence|inaudible|unintelligible)\]/g, " ")
    .replace(/[^\p{L}\p{N}'’]+/gu, " ")
    .trim();
  if (!normalized) return true;
  const fillers = new Set(["um", "uh", "erm", "hmm", "like"]);
  const meaningful = normalized.split(/\s+/).filter((word) => !fillers.has(word));
  return meaningful.length < 2;
}

export function getSpeakingEvaluationConfig() {
  const apiKey = Deno.env.get("GROQ_API_KEY")?.trim();
  const model = Deno.env.get("GROQ_SPEAKING_MODEL")?.trim() || DEFAULT_SPEAKING_MODEL;
  const version =
    Deno.env.get("VOCARA_SPEAKING_EVALUATION_VERSION")?.trim() ||
    DEFAULT_SPEAKING_EVALUATION_VERSION;
  const reasoningEffort =
    Deno.env.get("GROQ_EVALUATION_REASONING")?.trim() ||
    DEFAULT_SPEAKING_REASONING_EFFORT;
  if (!apiKey || !ALLOWED_SPEAKING_MODELS.has(model)) {
    throw new EvaluationConfigError(
      "SPEAKING_EVALUATION_NOT_CONFIGURED",
      "Speaking feedback is not configured yet.",
    );
  }
  if (
    !/^[a-zA-Z0-9._-]{1,40}$/.test(version) ||
    !ALLOWED_SPEAKING_REASONING_EFFORTS.has(reasoningEffort)
  ) {
    throw new EvaluationConfigError(
      "SPEAKING_EVALUATION_NOT_CONFIGURED",
      "Speaking feedback configuration is invalid.",
    );
  }
  return { apiKey, model, version, reasoningEffort };
}

export class EvaluationConfigError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EvaluationConfigError";
    this.code = code;
  }
}
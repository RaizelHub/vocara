export const SCORE_WEIGHTS = {
  relevance: 0.25,
  structure: 0.2,
  clarity: 0.2,
  grammar: 0.1,
  vocabulary: 0.1,
  confidence: 0.15,
} as const;

export const SCORE_KEYS = [
  "relevance",
  "structure",
  "clarity",
  "grammar",
  "vocabulary",
  "confidence",
] as const;

export type ScoreKey = (typeof SCORE_KEYS)[number];
export type CategoryScores = Record<ScoreKey, number>;

export const DEFAULT_EVALUATION_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_EVALUATION_VERSION = "v1";
export const DEFAULT_REASONING_EFFORT = "low";
export const ALLOWED_EVALUATION_MODELS = new Set([
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b",
]);
export const ALLOWED_REASONING_EFFORTS = new Set(["low", "medium", "high"]);

export const PRACTICE_TYPES = [
  "behavioral",
  "technical",
  "quick",
  "speaking",
  "job_specific",
] as const;
export type PracticeType = (typeof PRACTICE_TYPES)[number];

export type ScoredAnswer = {
  answerId: string;
  questionNumber: number;
  overallScore: number;
  scores: CategoryScores;
};

export function calculateOverallScore(scores: CategoryScores) {
  return Math.round(
    SCORE_KEYS.reduce((total, key) => total + scores[key] * SCORE_WEIGHTS[key], 0),
  );
}

export function averageScore(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

export function aggregateCategoryScores(answers: ScoredAnswer[]): CategoryScores | null {
  if (answers.length === 0) return null;
  return Object.fromEntries(
    SCORE_KEYS.map((key) => [key, averageScore(answers.map((answer) => answer.scores[key]))!]),
  ) as CategoryScores;
}

export function selectAnswerExtremes(answers: ScoredAnswer[]) {
  if (answers.length === 0) {
    return { strongestAnswerId: null, focusAnswerId: null };
  }
  const deterministic = [...answers].sort(
    (left, right) => left.questionNumber - right.questionNumber,
  );
  const strongest = deterministic.reduce((best, answer) =>
    answer.overallScore > best.overallScore ? answer : best,
  );
  const focus = deterministic.reduce((lowest, answer) =>
    answer.overallScore < lowest.overallScore ? answer : lowest,
  );
  return { strongestAnswerId: strongest.answerId, focusAnswerId: focus.answerId };
}

export function performanceLabel(score: number) {
  if (score >= 90) return "Excellent interview";
  if (score >= 80) return "Strong interview";
  if (score >= 70) return "Good interview";
  if (score >= 60) return "Developing";
  return "Needs more practice";
}

const FILLER_PHRASES = [
  "you know",
  "i mean",
  "kind of",
  "sort of",
  "basically",
  "erm",
  "uh",
  "um",
] as const;

export function countFillerWords(transcript: string) {
  const normalized = transcript.normalize("NFKC").toLowerCase();
  return FILLER_PHRASES.flatMap((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const count = normalized.match(new RegExp(`(^|[^\\p{L}])${escaped}(?=$|[^\\p{L}])`, "gu"))
      ?.length ?? 0;
    return count > 0 ? [{ word, count }] : [];
  });
}

export function isTranscriptInsufficient(transcript: string) {
  const normalized = transcript
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\[(music|noise|silence|inaudible|unintelligible)\]/g, " ")
    .replace(/[^\p{L}\p{N}'’]+/gu, " ")
    .trim();
  if (!normalized) return true;
  const fillers = new Set(["um", "uh", "erm", "hmm"]);
  const meaningful = normalized.split(/\s+/).filter((word) => !fillers.has(word));
  return meaningful.length < 2;
}

export function inferQuestionType(questionType: string | null, question: string) {
  const normalizedType = questionType?.trim().toLowerCase();
  if (
    normalizedType &&
    ["introduction", "behavioral", "technical", "situational", "motivation", "general"].includes(
      normalizedType,
    )
  ) {
    return normalizedType;
  }
  const text = question.toLowerCase();
  if (/tell me about yourself|introduce yourself/.test(text)) return "introduction";
  if (/why (are you|do you|should we)|what interests you|motivat/.test(text)) return "motivation";
  if (/what would you do|how would you|imagine|suppose/.test(text)) return "situational";
  if (/describe a time|tell me about a time|give me an example|worked under|handled feedback/.test(text)) {
    return "behavioral";
  }
  if (normalizedType === "technical" || /explain|implement|algorithm|api|database|react|code/.test(text)) {
    return "technical";
  }
  if (normalizedType === "behavioral") return "behavioral";
  return "general";
}

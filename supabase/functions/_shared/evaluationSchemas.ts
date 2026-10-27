import {
  PRACTICE_TYPES,
  SCORE_KEYS,
  type CategoryScores,
  type PracticeType,
} from "./evaluationConfig.ts";

export type Strength = { title: string; detail: string };
export type Improvement = { title: string; detail: string; action: string };

export type AnswerEvaluationOutput = {
  scores: CategoryScores;
  summary: string;
  strengths: Strength[];
  improvements: Improvement[];
  betterApproach: string;
  improvedAnswer: string;
};

export type SessionEvaluationOutput = {
  summary: string;
  strengths: Strength[];
  focusAreas: Improvement[];
  recommendedPractice: { type: PracticeType; reason: string };
};

const scoreProperties = Object.fromEntries(
  SCORE_KEYS.map((key) => [key, { type: "integer", minimum: 0, maximum: 100 }]),
);

const strengthSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    detail: { type: "string" },
  },
  required: ["title", "detail"],
  additionalProperties: false,
};

const improvementSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    detail: { type: "string" },
    action: { type: "string" },
  },
  required: ["title", "detail", "action"],
  additionalProperties: false,
};

export const ANSWER_EVALUATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: scoreProperties,
      required: [...SCORE_KEYS],
      additionalProperties: false,
    },
    summary: { type: "string" },
    strengths: { type: "array", items: strengthSchema },
    improvements: { type: "array", items: improvementSchema },
    betterApproach: { type: "string" },
    improvedAnswer: { type: "string" },
  },
  required: [
    "scores",
    "summary",
    "strengths",
    "improvements",
    "betterApproach",
    "improvedAnswer",
  ],
  additionalProperties: false,
} as const;

export const SESSION_EVALUATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    strengths: { type: "array", items: strengthSchema },
    focusAreas: { type: "array", items: improvementSchema },
    recommendedPractice: {
      type: "object",
      properties: {
        type: { type: "string", enum: [...PRACTICE_TYPES] },
        reason: { type: "string" },
      },
      required: ["type", "reason"],
      additionalProperties: false,
    },
  },
  required: ["summary", "strengths", "focusAreas", "recommendedPractice"],
  additionalProperties: false,
} as const;

export class EvaluationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationValidationError";
  }
}

export function validateAnswerEvaluation(value: unknown): AnswerEvaluationOutput {
  const object = requireObject(value, "answer evaluation");
  const scoreObject = requireObject(object.scores, "scores");
  const scores = Object.fromEntries(
    SCORE_KEYS.map((key) => [key, requireScore(scoreObject[key], key)]),
  ) as CategoryScores;
  return {
    scores,
    summary: requireText(object.summary, "summary", 80),
    strengths: requireStrengths(object.strengths, "strengths"),
    improvements: requireImprovements(object.improvements, "improvements"),
    betterApproach: requireText(object.betterApproach, "betterApproach", 100),
    improvedAnswer: requireText(object.improvedAnswer, "improvedAnswer", 220),
  };
}

export function validateSessionEvaluation(value: unknown): SessionEvaluationOutput {
  const object = requireObject(value, "session evaluation");
  const recommendation = requireObject(object.recommendedPractice, "recommendedPractice");
  const type = requireText(recommendation.type, "recommendedPractice.type", 3) as PracticeType;
  if (!PRACTICE_TYPES.includes(type)) {
    throw new EvaluationValidationError("recommendedPractice.type is invalid");
  }
  return {
    summary: requireText(object.summary, "summary", 120),
    strengths: requireStrengths(object.strengths, "strengths"),
    focusAreas: requireImprovements(object.focusAreas, "focusAreas"),
    recommendedPractice: {
      type,
      reason: requireText(recommendation.reason, "recommendedPractice.reason", 70),
    },
  };
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EvaluationValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireScore(value: unknown, label: string) {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 100) {
    throw new EvaluationValidationError(`${label} must be an integer from 0 to 100`);
  }
  return value as number;
}

function requireText(value: unknown, label: string, maximumWords: number) {
  if (typeof value !== "string") throw new EvaluationValidationError(`${label} must be text`);
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) throw new EvaluationValidationError(`${label} cannot be empty`);
  const words = normalized.split(/\s+/).length;
  if (words > maximumWords || normalized.length > maximumWords * 12) {
    throw new EvaluationValidationError(`${label} exceeds its maximum length`);
  }
  return normalized;
}

function requireArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new EvaluationValidationError(`${label} must contain 1 to 3 items`);
  }
  return value;
}

function requireStrengths(value: unknown, label: string) {
  return requireArray(value, label).map((item, index) => {
    const object = requireObject(item, `${label}[${index}]`);
    return {
      title: requireText(object.title, `${label}[${index}].title`, 12),
      detail: requireText(object.detail, `${label}[${index}].detail`, 50),
    };
  });
}

function requireImprovements(value: unknown, label: string) {
  return requireArray(value, label).map((item, index) => {
    const object = requireObject(item, `${label}[${index}]`);
    return {
      title: requireText(object.title, `${label}[${index}].title`, 12),
      detail: requireText(object.detail, `${label}[${index}].detail`, 50),
      action: requireText(object.action, `${label}[${index}].action`, 50),
    };
  });
}

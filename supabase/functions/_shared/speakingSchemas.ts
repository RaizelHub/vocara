import {
  SPEAKING_SCORE_KEYS,
  type SpeakingCategoryScores,
} from "./speakingConfig.ts";

export type SpeakingStrength = { title: string; detail: string };
export type SpeakingImprovement = {
  title: string;
  detail: string;
  action: string;
};
export type SpeakingCorrection = {
  original: string;
  corrected: string;
  explanation: string;
};
export type SpeakingPhrasing = { original: string; improved: string };

export type SpeakingEvaluationOutput = {
  scores: SpeakingCategoryScores;
  summary: string;
  strengths: SpeakingStrength[];
  improvements: SpeakingImprovement[];
  grammarCorrections: SpeakingCorrection[];
  naturalPhrasing: SpeakingPhrasing[];
  betterVersion: string;
};

const scoreProperties = Object.fromEntries(
  SPEAKING_SCORE_KEYS.map((key) => [key, { type: "integer", minimum: 0, maximum: 100 }]),
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

const correctionSchema = {
  type: "object",
  properties: {
    original: { type: "string" },
    corrected: { type: "string" },
    explanation: { type: "string" },
  },
  required: ["original", "corrected", "explanation"],
  additionalProperties: false,
};

const phrasingSchema = {
  type: "object",
  properties: {
    original: { type: "string" },
    improved: { type: "string" },
  },
  required: ["original", "improved"],
  additionalProperties: false,
};

export const SPEAKING_EVALUATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: scoreProperties,
      required: [...SPEAKING_SCORE_KEYS],
      additionalProperties: false,
    },
    summary: { type: "string" },
    strengths: { type: "array", items: strengthSchema },
    improvements: { type: "array", items: improvementSchema },
    grammarCorrections: { type: "array", items: correctionSchema },
    naturalPhrasing: { type: "array", items: phrasingSchema },
    betterVersion: { type: "string" },
  },
  required: [
    "scores",
    "summary",
    "strengths",
    "improvements",
    "grammarCorrections",
    "naturalPhrasing",
    "betterVersion",
  ],
  additionalProperties: false,
} as const;

export class SpeakingEvaluationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeakingEvaluationValidationError";
  }
}

export function validateSpeakingEvaluation(
  value: unknown,
): SpeakingEvaluationOutput {
  const object = requireObject(value, "speaking evaluation");
  const scoreObject = requireObject(object.scores, "scores");
  const scores = Object.fromEntries(
    SPEAKING_SCORE_KEYS.map((key) => [
      key,
      requireScore(scoreObject[key], key),
    ]),
  ) as SpeakingCategoryScores;
  return {
    scores,
    summary: requireText(object.summary, "summary", 100),
    strengths: requireStrengths(object.strengths, "strengths"),
    improvements: requireImprovements(object.improvements, "improvements"),
    grammarCorrections: requireCorrections(
      object.grammarCorrections,
      "grammarCorrections",
    ),
    naturalPhrasing: requirePhrasings(object.naturalPhrasing, "naturalPhrasing"),
    betterVersion: requireText(object.betterVersion, "betterVersion", 200),
  };
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SpeakingEvaluationValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireScore(value: unknown, label: string) {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 100) {
    throw new SpeakingEvaluationValidationError(
      `${label} must be an integer from 0 to 100`,
    );
  }
  return value as number;
}

function requireText(value: unknown, label: string, maximumWords: number) {
  if (typeof value !== "string") {
    throw new SpeakingEvaluationValidationError(`${label} must be text`);
  }
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new SpeakingEvaluationValidationError(`${label} cannot be empty`);
  }
  const words = normalized.split(/\s+/).length;
  if (words > maximumWords || normalized.length > maximumWords * 12) {
    throw new SpeakingEvaluationValidationError(
      `${label} exceeds its maximum length`,
    );
  }
  return normalized;
}

function requireBoundedArray(value: unknown, label: string, maximum: number) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) {
    throw new SpeakingEvaluationValidationError(
      `${label} must contain 1 to ${maximum} items`,
    );
  }
  return value;
}

function requireStrengths(value: unknown, label: string) {
  return requireBoundedArray(value, label, 3).map((item, index) => {
    const object = requireObject(item, `${label}[${index}]`);
    return {
      title: requireText(object.title, `${label}[${index}].title`, 12),
      detail: requireText(object.detail, `${label}[${index}].detail`, 50),
    };
  });
}

function requireImprovements(value: unknown, label: string) {
  return requireBoundedArray(value, label, 3).map((item, index) => {
    const object = requireObject(item, `${label}[${index}]`);
    return {
      title: requireText(object.title, `${label}[${index}].title`, 12),
      detail: requireText(object.detail, `${label}[${index}].detail`, 50),
      action: requireText(object.action, `${label}[${index}].action`, 50),
    };
  });
}

function requireCorrections(value: unknown, label: string) {
  return requireBoundedArray(value, label, 5).map((item, index) => {
    const object = requireObject(item, `${label}[${index}]`);
    return {
      original: requireText(object.original, `${label}[${index}].original`, 60),
      corrected: requireText(
        object.corrected,
        `${label}[${index}].corrected`,
        60,
      ),
      explanation: requireText(
        object.explanation,
        `${label}[${index}].explanation`,
        40,
      ),
    };
  });
}

function requirePhrasings(value: unknown, label: string) {
  return requireBoundedArray(value, label, 5).map((item, index) => {
    const object = requireObject(item, `${label}[${index}]`);
    return {
      original: requireText(object.original, `${label}[${index}].original`, 60),
      improved: requireText(object.improved, `${label}[${index}].improved`, 60),
    };
  });
}
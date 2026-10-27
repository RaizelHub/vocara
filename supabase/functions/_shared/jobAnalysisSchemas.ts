import {
  IMPORTANCE_LEVELS,
  JOB_QUESTION_TYPES,
  type JobImportance,
  type JobQuestionType,
  type JobSeniority,
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  QUESTION_DIFFICULTIES,
  type QuestionDifficulty,
  SENIORITY_LEVELS,
} from "./jobAnalysisConfig.ts";

export type JobSkill = { name: string; importance: JobImportance };

export type JobAnalysisOutput = {
  detectedRole: string | null;
  companyName: string | null;
  seniorityLevel: JobSeniority;
  summary: string;
  technicalSkills: JobSkill[];
  softSkills: JobSkill[];
  responsibilities: string[];
  requiredExperience: string[];
  preferredExperience: string[];
  interviewFocusAreas: string[];
  keywords: string[];
};

export type GeneratedInterviewQuestion = {
  questionNumber: number;
  questionText: string;
  questionType: JobQuestionType;
  focusArea: string;
  difficulty: QuestionDifficulty;
  reason: string;
  expectedTopics: string[];
};

export type JobInterviewOutput = {
  questions: GeneratedInterviewQuestion[];
};

export class JobAnalysisValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobAnalysisValidationError";
  }
}

const skillSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, maxLength: 120 },
    importance: { type: "string", enum: [...IMPORTANCE_LEVELS] },
  },
  required: ["name", "importance"],
  additionalProperties: false,
};

export const JOB_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    detectedRole: { type: ["string", "null"], maxLength: 160 },
    companyName: { type: ["string", "null"], maxLength: 160 },
    seniorityLevel: { type: "string", enum: [...SENIORITY_LEVELS] },
    summary: { type: "string", minLength: 1, maxLength: 3000 },
    technicalSkills: { type: "array", items: skillSchema, maxItems: 10 },
    softSkills: { type: "array", items: skillSchema, maxItems: 10 },
    responsibilities: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 160 },
      minItems: 1,
      maxItems: 12,
    },
    requiredExperience: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 160 },
      maxItems: 12,
    },
    preferredExperience: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 160 },
      maxItems: 12,
    },
    interviewFocusAreas: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 80 },
      minItems: 3,
      maxItems: 8,
    },
    keywords: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 40 },
      maxItems: 15,
    },
  },
  required: [
    "detectedRole",
    "companyName",
    "seniorityLevel",
    "summary",
    "technicalSkills",
    "softSkills",
    "responsibilities",
    "requiredExperience",
    "preferredExperience",
    "interviewFocusAreas",
    "keywords",
  ],
  additionalProperties: false,
} as const;

const questionSchema = {
  type: "object",
  properties: {
    questionNumber: { type: "integer", minimum: 1 },
    questionText: { type: "string", minLength: 8, maxLength: 600 },
    questionType: { type: "string", enum: [...JOB_QUESTION_TYPES] },
    focusArea: { type: "string", minLength: 1, maxLength: 120 },
    difficulty: { type: "string", enum: [...QUESTION_DIFFICULTIES] },
    reason: { type: "string", minLength: 1, maxLength: 400 },
    expectedTopics: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 40 },
      minItems: 1,
      maxItems: 5,
    },
  },
  required: [
    "questionNumber",
    "questionText",
    "questionType",
    "focusArea",
    "difficulty",
    "reason",
    "expectedTopics",
  ],
  additionalProperties: false,
};

export const JOB_INTERVIEW_JSON_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: questionSchema,
      minItems: 5,
      maxItems: 12,
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

export function jobInterviewJsonSchema(questionCount: number) {
  return {
    ...JOB_INTERVIEW_JSON_SCHEMA,
    properties: {
      questions: {
        ...JOB_INTERVIEW_JSON_SCHEMA.properties.questions,
        minItems: questionCount,
        maxItems: questionCount,
      },
    },
  };
}

export function validateJobAnalysisValue(value: unknown): JobAnalysisOutput {
  const object = requireObject(value, "job analysis");
  requireExactKeys(
    object,
    [
      "detectedRole",
      "companyName",
      "seniorityLevel",
      "summary",
      "technicalSkills",
      "softSkills",
      "responsibilities",
      "requiredExperience",
      "preferredExperience",
      "interviewFocusAreas",
      "keywords",
    ],
    "job analysis",
  );
  const technicalSkills = requireSkills(
    object.technicalSkills,
    "technicalSkills",
  );
  const softSkills = requireSkills(object.softSkills, "softSkills");
  if (technicalSkills.length > 10 || softSkills.length > 10) {
    throw new JobAnalysisValidationError(
      "Skill lists exceed the maximum length",
    );
  }
  return {
    detectedRole: requireOptionalText(
      object.detectedRole,
      "detectedRole",
      80,
      160,
    ),
    companyName: requireOptionalText(
      object.companyName,
      "companyName",
      80,
      160,
    ),
    seniorityLevel: requireEnum(
      object.seniorityLevel,
      "seniorityLevel",
      SENIORITY_LEVELS,
    ),
    summary: requireText(object.summary, "summary", 120, 3000),
    technicalSkills,
    softSkills,
    responsibilities: requireStrings(
      object.responsibilities,
      "responsibilities",
      1,
      12,
      160,
    ),
    requiredExperience: requireStrings(
      object.requiredExperience,
      "requiredExperience",
      0,
      12,
      160,
    ),
    preferredExperience: requireStrings(
      object.preferredExperience,
      "preferredExperience",
      0,
      12,
      160,
    ),
    interviewFocusAreas: requireStrings(
      object.interviewFocusAreas,
      "interviewFocusAreas",
      3,
      8,
      80,
    ),
    keywords: requireStrings(object.keywords, "keywords", 0, 15, 40),
  };
}

export function validateJobInterviewValue(
  value: unknown,
  expectedCount: number,
): JobInterviewOutput {
  if (
    expectedCount < MIN_QUESTION_COUNT || expectedCount > MAX_QUESTION_COUNT
  ) {
    throw new JobAnalysisValidationError(
      "Question count is outside the allowed range",
    );
  }
  const object = requireObject(value, "interview");
  requireExactKeys(object, ["questions"], "interview");
  const rawQuestions = requireArray(object.questions, "questions");
  if (rawQuestions.length !== expectedCount) {
    throw new JobAnalysisValidationError(
      `Expected ${expectedCount} questions but received ${rawQuestions.length}`,
    );
  }
  const seenNumbers = new Set<number>();
  const seenText = new Set<string>();
  const questions = rawQuestions.map((item, index) => {
    const entry = requireObject(item, `questions[${index}]`);
    requireExactKeys(
      entry,
      [
        "questionNumber",
        "questionText",
        "questionType",
        "focusArea",
        "difficulty",
        "reason",
        "expectedTopics",
      ],
      `questions[${index}]`,
    );
    const number = requireScore(
      entry.questionNumber,
      `questions[${index}].questionNumber`,
    );
    if (number < 1 || number > expectedCount || seenNumbers.has(number)) {
      throw new JobAnalysisValidationError(
        "Question numbers must be unique and sequential",
      );
    }
    seenNumbers.add(number);
    const text = requireText(
      entry.questionText,
      `questions[${index}].questionText`,
      100,
      600,
    );
    const normalizedText = text.normalize("NFKC").replace(/\s+/g, " ")
      .toLowerCase().trim();
    if (normalizedText.length < 8) {
      throw new JobAnalysisValidationError("Question text is too short");
    }
    if (seenText.has(normalizedText)) {
      throw new JobAnalysisValidationError(
        "Duplicate question text is not allowed",
      );
    }
    seenText.add(normalizedText);
    return {
      questionNumber: number,
      questionText: text,
      questionType: requireEnum(
        entry.questionType,
        `questions[${index}].questionType`,
        JOB_QUESTION_TYPES,
      ),
      focusArea: requireText(
        entry.focusArea,
        `questions[${index}].focusArea`,
        20,
        120,
      ),
      difficulty: requireEnum(
        entry.difficulty,
        `questions[${index}].difficulty`,
        QUESTION_DIFFICULTIES,
      ),
      reason: requireText(entry.reason, `questions[${index}].reason`, 60, 400),
      expectedTopics: requireStrings(
        entry.expectedTopics,
        `questions[${index}].expectedTopics`,
        1,
        5,
        40,
      ),
    };
  });
  return { questions };
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JobAnalysisValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new JobAnalysisValidationError(
      `${label} contains unsupported fields`,
    );
  }
}

function requireArray(
  value: unknown,
  label: string,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new JobAnalysisValidationError(`${label} must be an array`);
  }
  return value as Record<string, unknown>[];
}

function requireEnum<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new JobAnalysisValidationError(`${label} is invalid`);
  }
  return value as T;
}

function requireText(
  value: unknown,
  label: string,
  maximumWords: number,
  maximumCharacters = maximumWords * 12,
) {
  if (typeof value !== "string") {
    throw new JobAnalysisValidationError(`${label} must be text`);
  }
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new JobAnalysisValidationError(`${label} cannot be empty`);
  }
  const words = normalized.split(/\s+/).length;
  if (words > maximumWords || normalized.length > maximumCharacters) {
    throw new JobAnalysisValidationError(`${label} exceeds its maximum length`);
  }
  return normalized;
}

function requireOptionalText(
  value: unknown,
  label: string,
  maximumWords: number,
  maximumCharacters: number,
) {
  if (value === null || value === undefined || value === "") return null;
  return requireText(value, label, maximumWords, maximumCharacters);
}

function requireScore(value: unknown, label: string) {
  if (!Number.isInteger(value)) {
    throw new JobAnalysisValidationError(`${label} must be an integer`);
  }
  return value as number;
}

function requireStrings(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  maximumCharacters: number,
) {
  if (!Array.isArray(value)) {
    throw new JobAnalysisValidationError(`${label} must be an array`);
  }
  if (value.length < minimum || value.length > maximum) {
    throw new JobAnalysisValidationError(
      `${label} must contain ${
        minimum === 0 ? "up to" : "at least"
      } ${maximum} items`,
    );
  }
  return value.map((item, index) =>
    requireText(item, `${label}[${index}]`, Infinity, maximumCharacters)
  );
}

function requireSkills(value: unknown, label: string) {
  const raw = requireArray(value, label);
  if (raw.length > 10) {
    throw new JobAnalysisValidationError(`${label} exceeds 10 items`);
  }
  return raw.map((item, index) => {
    requireExactKeys(item, ["name", "importance"], `${label}[${index}]`);
    const name = requireText(item.name, `${label}[${index}].name`, 12, 120);
    const importance = requireEnum(
      item.importance,
      `${label}[${index}].importance`,
      IMPORTANCE_LEVELS,
    );
    return { name, importance };
  });
}

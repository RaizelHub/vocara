export type InterviewType =
  | "standard"
  | "behavioral"
  | "technical"
  | "mixed"
  | "job_specific";

export type PracticeSkillKey =
  | "relevance"
  | "structure"
  | "clarity"
  | "grammar"
  | "vocabulary"
  | "confidence";

export const PRACTICE_SKILL_KEYS: PracticeSkillKey[] = [
  "relevance",
  "structure",
  "clarity",
  "grammar",
  "vocabulary",
  "confidence",
];

export const PRACTICE_SKILL_LABELS: Record<PracticeSkillKey, string> = {
  relevance: "Relevance",
  structure: "Structure",
  clarity: "Clarity",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  confidence: "Confidence",
};

export type PracticeSkill = {
  key: PracticeSkillKey;
  label: string;
  value: number;
};

export type Difficulty = "beginner" | "intermediate" | "advanced";

export type InterviewerStyle = "supportive" | "balanced" | "challenging";

export type InterviewLength = "quick" | "standard" | "deep";

export const LENGTH_QUESTION_COUNTS: Record<InterviewLength, number> = {
  quick: 5,
  standard: 8,
  deep: 12,
};

export type InterviewSession = {
  id: string;
  role: string;
  type: InterviewType;
  difficulty: Difficulty;
  interviewerStyle: InterviewerStyle;
  length: InterviewLength;
  totalQuestions: number;
  questions: string[];
  questionIds: string[];
};

export type SessionState =
  | "question"
  | "thinking"
  | "requesting_permission"
  | "recording"
  | "recorded"
  | "uploading"
  | "transcribing"
  | "transcribed"
  | "evaluating"
  | "error"
  | "summary"
  | "finalizing";

export const THINK_SECONDS = 15;

export const MAX_RECORDING_SECONDS = 120;

export const WRAP_UP_AFTER_SECONDS = 90;

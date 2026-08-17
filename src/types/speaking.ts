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

export type SpeakingPrompt = {
  id: string;
  category: SpeakingCategory;
  text: string;
  tip: string | null;
  difficulty: SpeakingDifficulty;
  timeLimitSeconds: 60 | 90 | 120;
};

export type SpeakingSessionStatus = "in_progress" | "completed" | "abandoned";

export type SpeakingSessionRecord = {
  id: string;
  user_id: string;
  category: string;
  prompt_id: string;
  prompt_text: string;
  prompt_tip: string | null;
  difficulty: string;
  time_limit_seconds: number;
  evaluation_version: string;
  status: SpeakingSessionStatus;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
};

export type SpeakingAttemptRecord = {
  id: string;
  session_id: string;
  user_id: string;
  attempt_number: number;
  audio_path: string | null;
  audio_mime_type: string | null;
  audio_size_bytes: number | null;
  audio_sha256: string | null;
  audio_generation: number;
  audio_attached_at: string | null;
  duration_seconds: number | null;
  transcription_status: "pending" | "processing" | "completed" | "failed";
  transcript: string | null;
  word_count: number | null;
  speaking_pace: number | null;
  transcription_error: string | null;
  transcription_retryable: boolean;
  transcription_attempt_count: number;
  transcription_attempt_id: string | null;
  transcription_started_at: string | null;
  transcription_completed_at: string | null;
  transcription_model: string | null;
  transcription_provider_request_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SpeakingCategoryScores = {
  clarity: number;
  fluency: number;
  grammar: number;
  vocabulary: number;
  structure: number;
  conciseness: number;
};

export type SpeakingAttemptResult = {
  attemptNumber: number;
  attemptId: string;
  transcript: string | null;
  durationSeconds: number | null;
  wordCount: number | null;
  speakingPace: number | null;
  transcriptionStatus: string;
  evaluationStatus: string;
  score: number | null;
  scores: SpeakingCategoryScores | null;
  summary: string | null;
  strengths: { title: string; detail: string }[];
  improvements: { title: string; detail: string; action: string }[];
  grammarCorrections: { original: string; corrected: string; explanation: string }[];
  naturalPhrasing: { original: string; improved: string }[];
  betterVersion: string | null;
  fillerWords: { word: string; count: number }[];
};

export type SpeakingSessionPayload = {
  session: {
    id: string;
    category: string;
    promptId: string;
    promptText: string;
    promptTip: string | null;
    difficulty: string;
    timeLimitSeconds: number;
    status: SpeakingSessionStatus;
    createdAt: string;
    completedAt: string | null;
  };
  attempts: SpeakingAttemptResult[];
};

export type SpeakingHistoryItem = {
  id: string;
  category: string;
  prompt_text: string;
  prompt_tip: string | null;
  difficulty: string;
  time_limit_seconds: number;
  created_at: string;
  completed_at: string | null;
  summary: {
    attemptCount: number;
    bestScore: number | null;
    lastScore: number | null;
  };
};

export type SpeakingEvaluationResult = {
  attemptId: string;
  overallScore: number;
  scores: SpeakingCategoryScores;
  summary: string;
  strengths: { title: string; detail: string }[];
  improvements: { title: string; detail: string; action: string }[];
  grammarCorrections: { original: string; corrected: string; explanation: string }[];
  naturalPhrasing: { original: string; improved: string }[];
  betterVersion: string;
  fillerWords: { word: string; count: number }[];
  feedbackStatus: string;
};

export type SpeakingTranscriptionResult = {
  attemptId: string;
  transcript: string;
  durationSeconds: number;
  wordCount: number;
  speakingPace: number;
};

export type PracticeSummary = {
  currentStreak: number;
  longestStreak: number;
  todaySeconds: number;
  practiceDays: string[];
};

export const SPEAKING_CATEGORY_LABELS: Record<SpeakingCategory, string> = {
  everyday: "Everyday",
  workplace: "Workplace",
  introduction: "Introductions",
  storytelling: "Storytelling",
  opinion: "Opinions",
  explanation: "Explanations",
  quick_response: "Quick replies",
};

export const SPEAKING_DIFFICULTY_LABELS: Record<SpeakingDifficulty, string> = {
  warm_up: "Warm-up",
  moderate: "Moderate",
  challenging: "Challenging",
};
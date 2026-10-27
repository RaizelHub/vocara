import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import type {
  InterviewAnswerFeedback,
  InterviewResult,
  SkillScore,
} from "@/data/mockInterviewResult";
import type { MockSession } from "@/data/mock";
import {
  PRACTICE_SKILL_KEYS,
  PRACTICE_SKILL_LABELS,
  type InterviewType,
  type PracticeSkill,
  type PracticeSkillKey,
} from "@/types/interview";

export type InterviewEvaluationAnswer = {
  id: string;
  questionNumber: number;
  question: string;
  questionType: string | null;
  transcript: string | null;
  durationSeconds: number | null;
  wordCount: number | null;
  speakingPace: number | null;
  score: number | null;
  scores: Record<PracticeSkillKey, number | null> | null;
  summary: string | null;
  strengths: { title: string; detail: string }[];
  improvements: { title: string; detail: string; action: string }[];
  betterApproach: string | null;
  improvedAnswer: string | null;
  fillerWords: { word: string; count: number }[];
  feedbackStatus: string | null;
};

export type InterviewEvaluationPayload = {
  session: {
    id: string;
    role: string;
    interviewType: string;
    difficulty: string;
    interviewerStyle: string;
    score: number | null;
    durationSeconds: number | null;
    completedAt: string | null;
  };
  feedback: {
    performanceLabel: string | null;
    summary: string | null;
    scores: Record<PracticeSkillKey, number | null> | null;
    strengths: { title: string; detail: string }[];
    focusAreas: { title: string; detail: string; action: string }[];
    recommendedPractice: { type: string | null; reason: string | null } | null;
    strongestAnswerId: string | null;
    focusAnswerId: string | null;
    evaluationVersion: string | null;
  };
  answers: InterviewEvaluationAnswer[];
  previousScore: number | null;
  readinessBefore: number | null;
  readinessAfter: number | null;
  previousConfidence: number | null;
  previousStructure: number | null;
};

export type UserPracticeMetrics = {
  readinessScore: number | null;
  previousReadinessScore: number | null;
  sessionsCompleted: number;
  practiceSeconds: number;
  skills: Record<PracticeSkillKey, number | null> | null;
  recentSessions: {
    id: string;
    role: string;
    interviewType: string;
    score: number | null;
    durationSeconds: number | null;
    completedAt: string | null;
  }[];
  practiceCompletedAt: string[];
};

const EMPTY_METRICS: UserPracticeMetrics = {
  readinessScore: null,
  previousReadinessScore: null,
  sessionsCompleted: 0,
  practiceSeconds: 0,
  skills: null,
  recentSessions: [],
  practiceCompletedAt: [],
};

const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  standard: "Standard",
  behavioral: "Behavioral",
  situational: "Situational",
  technical: "Technical",
  mixed: "Mixed",
  job_specific: "Job-specific",
};

const INTERVIEW_TYPE_KEYS: InterviewType[] = [
  "standard",
  "behavioral",
  "situational",
  "technical",
  "mixed",
  "job_specific",
];

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const SKILL_INSIGHTS: Record<PracticeSkillKey, string> = {
  relevance: "How closely your answers matched the question",
  structure: "How clearly your answers were organized",
  clarity: "How easy your answers were to follow",
  grammar: "Accuracy of your sentence choices",
  vocabulary: "Range and precision of your word choices",
  confidence: "How assured your delivery sounded",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export async function fetchInterviewResult(
  sessionId: string,
): Promise<InterviewEvaluationPayload> {
  assertSupabaseConfigured();

  const { data, error } = await supabase.rpc("get_interview_result", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  if (!data) throw new Error("We couldn't load this interview result.");
  return data as unknown as InterviewEvaluationPayload;
}

export async function fetchUserPracticeMetrics(): Promise<UserPracticeMetrics> {
  assertSupabaseConfigured();

  const { data, error } = await supabase.rpc("get_user_practice_metrics");
  if (error) throw error;
  if (!data) return EMPTY_METRICS;
  return data as unknown as UserPracticeMetrics;
}

export function isResultNotReadyError(error: unknown) {
  return errorCode(error) === "P0001" || errorMessage(error).includes("INTERVIEW_RESULT_NOT_READY");
}

export function isResultNotFoundError(error: unknown) {
  return errorCode(error) === "P0002" || errorMessage(error).includes("INTERVIEW_RESULT_NOT_FOUND");
}

export function toInterviewResult(payload: InterviewEvaluationPayload): InterviewResult {
  const session = payload.session;
  const feedback = payload.feedback;
  const scores: Partial<Record<PracticeSkillKey, number | null>> = feedback.scores ?? {};
  const confidence = scores.confidence ?? session.score ?? 0;
  const structure = scores.structure ?? session.score ?? 0;
  const readinessAfter = payload.readinessAfter ?? session.score ?? 0;
  const readinessBefore = payload.readinessBefore ?? readinessAfter;

  const skills: SkillScore[] = PRACTICE_SKILL_KEYS.map((key) => ({
    key,
    label: PRACTICE_SKILL_LABELS[key],
    score: scores[key] ?? session.score ?? 0,
    insight: SKILL_INSIGHTS[key],
  }));

  const answers: InterviewAnswerFeedback[] = payload.answers.map((answer) => ({
    id: answer.id,
    questionNumber: answer.questionNumber,
    question: answer.question,
    transcript: answer.transcript ?? "",
    score: answer.score ?? 0,
    durationSeconds: answer.durationSeconds ?? 0,
    wordCount: answer.wordCount ?? 0,
    speakingPace: answer.speakingPace ?? 0,
    fillerWords: answer.fillerWords ?? [],
    strengths: answer.strengths.map((point) => point.detail || point.title),
    improvements: answer.improvements.map((point) => point.detail || point.action || point.title),
    betterApproach: answer.betterApproach ?? "",
    improvedAnswer: answer.improvedAnswer ?? "",
  }));

  return {
    id: session.id,
    role: session.role,
    interviewType: INTERVIEW_TYPE_LABELS[session.interviewType] ?? session.interviewType,
    interviewTypeKey: INTERVIEW_TYPE_KEYS.includes(session.interviewType as InterviewType)
      ? (session.interviewType as InterviewType)
      : "standard",
    difficulty: DIFFICULTY_LABELS[session.difficulty] ?? session.difficulty,
    score: session.score ?? 0,
    previousScore: payload.previousScore ?? session.score ?? 0,
    durationMinutes: Math.max(1, Math.round((session.durationSeconds ?? 0) / 60)),
    completedAt: formatResultDate(session.completedAt),
    performanceLabel: feedback.performanceLabel ?? "Interview complete",
    summary: feedback.summary ?? "Your evaluation is ready.",
    skills,
    strengths: feedback.strengths.map((point) => ({
      title: point.title,
      description: point.detail || point.title,
    })),
    focusAreas: feedback.focusAreas.map((point) => ({
      title: point.title,
      description: point.detail || point.title,
      suggestion: point.action,
    })),
    answers,
    strongestAnswerId: feedback.strongestAnswerId ?? "",
    retryAnswerId: feedback.focusAnswerId ?? "",
    progress: {
      readinessBefore,
      readinessAfter,
      confidenceBefore: payload.previousConfidence ?? confidence,
      confidenceAfter: confidence,
      structureBefore: payload.previousStructure ?? structure,
      structureAfter: structure,
    },
  };
}

export function toPracticeSkills(
  skills: UserPracticeMetrics["skills"] | null | undefined,
): PracticeSkill[] {
  return PRACTICE_SKILL_KEYS.map((key) => ({
    key,
    label: PRACTICE_SKILL_LABELS[key],
    value: skills?.[key] ?? 0,
  }));
}

export function toRecentSessions(
  sessions: UserPracticeMetrics["recentSessions"] | undefined,
): MockSession[] {
  return (sessions ?? []).map((session) => ({
    id: session.id,
    title: session.role || "Interview practice",
    type: session.interviewType === "job_specific" ? "Job-specific" : "Mock interview",
    minutes: Math.max(1, Math.round((session.durationSeconds ?? 0) / 60)),
    score: session.score ?? 0,
    date: formatSessionDate(session.completedAt),
  }));
}

export function practiceStreakDays(completedAt: string[]) {
  const days = new Set<string>();
  for (const iso of completedAt) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    days.add(dayKey(date));
  }

  let streak = 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function currentWeekPractice(completedAt: string[]) {
  const practiced = new Set<string>();
  for (const iso of completedAt) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    practiced.add(dayKey(date));
  }

  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return practiced.has(dayKey(day));
  });
}

function formatResultDate(iso: string | null) {
  const date = parseIso(iso);
  if (!date) return "";
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatSessionDate(iso: string | null) {
  const date = parseIso(iso);
  if (!date) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((startOfToday - startOfDay) / 86_400_000);
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function parseIso(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function errorCode(error: unknown) {
  return (error as { code?: unknown })?.code ?? "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

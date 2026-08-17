import type { InterviewType } from "@/types/interview";

export type SkillScore = {
  key: string;
  label: string;
  score: number;
  insight: string;
};

export type FillerWord = {
  word: string;
  count: number;
};

export type InterviewAnswerFeedback = {
  id: string;
  questionNumber: number;
  question: string;
  transcript: string;
  score: number;
  durationSeconds: number;
  wordCount: number;
  speakingPace: number;
  fillerWords: FillerWord[];
  strengths: string[];
  improvements: string[];
  betterApproach: string;
  improvedAnswer: string;
};

export type FeedbackPoint = {
  title: string;
  description: string;
  suggestion?: string;
};

export type InterviewResult = {
  id: string;
  role: string;
  interviewType: string;
  interviewTypeKey: InterviewType;
  difficulty: string;
  score: number;
  previousScore: number;
  durationMinutes: number;
  completedAt: string;
  performanceLabel: string;
  summary: string;
  skills: SkillScore[];
  strengths: FeedbackPoint[];
  focusAreas: FeedbackPoint[];
  answers: InterviewAnswerFeedback[];
  strongestAnswerId: string;
  retryAnswerId: string;
  progress: {
    readinessBefore: number;
    readinessAfter: number;
    confidenceBefore: number;
    confidenceAfter: number;
    structureBefore: number;
    structureAfter: number;
  };
};
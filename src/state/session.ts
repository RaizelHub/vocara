import { randomUUID } from "expo-crypto";

import { questionsFor } from "@/data/interviewQuestions";
import { LENGTH_QUESTION_COUNTS, type InterviewSession, type InterviewLength, type InterviewType, type Difficulty, type InterviewerStyle } from "@/types/interview";

let current: InterviewSession | null = null;

export function startInterviewSession(
  input: {
    id?: string;
    role: string;
    type: InterviewType;
    difficulty: Difficulty;
    interviewerStyle: InterviewerStyle;
    length: InterviewLength;
    totalQuestions?: number;
    questions?: string[];
    questionIds?: string[];
  },
): InterviewSession {
  const questions =
    input.questions ??
    questionsFor(input.type, input.role, LENGTH_QUESTION_COUNTS[input.length]);
  const session: InterviewSession = {
    id: input.id ?? randomUUID(),
    role: input.role,
    type: input.type,
    difficulty: input.difficulty,
    interviewerStyle: input.interviewerStyle,
    length: input.length,
    totalQuestions: input.totalQuestions ?? questions.length,
    questions,
    questionIds: input.questionIds ?? questions.map(() => randomUUID()),
  };
  current = session;
  return session;
}

export function getInterviewSession(): InterviewSession | null {
  return current;
}

export function resetInterviewSession() {
  current = null;
}

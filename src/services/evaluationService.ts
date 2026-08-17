import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

import { assertSupabaseConfigured, supabase } from "@/lib/supabase";

const EVALUATION_TIMEOUT_MS = 90_000;

export type CategoryScore = {
  relevance: number;
  structure: number;
  clarity: number;
  grammar: number;
  vocabulary: number;
  confidence: number;
};

export type AnswerEvaluationResult = {
  answerId: string;
  overallScore: number;
  scores: CategoryScore;
  summary: string;
  strengths: { title: string; detail: string }[];
  improvements: { title: string; detail: string; action: string }[];
  betterApproach: string;
  improvedAnswer: string;
  fillerWords: { word: string; count: number }[];
  feedbackStatus: string;
};

export const evaluationService = {
  async evaluateAnswer(answerId: string): Promise<AnswerEvaluationResult> {
    assertSupabaseConfigured();

    const { data, error } = await supabase.functions.invoke<AnswerEvaluationResult>(
      "evaluate-answer",
      {
        body: { answerId },
        timeout: EVALUATION_TIMEOUT_MS,
      },
    );

    if (!error && data) return data;
    if (!error) {
      throw new EvaluationError(
        "The evaluation service returned an empty response.",
        "invalid_response",
      );
    }

    if (error instanceof FunctionsHttpError) {
      const status = error.context instanceof Response ? error.context.status : 0;
      let payload: { code?: unknown; message?: unknown; retryable?: unknown } = {};
      try {
        payload = (await error.context.json()) as typeof payload;
      } catch {
        // Gateway errors are not guaranteed to include a JSON body.
      }
      throw new EvaluationError(
        typeof payload.message === "string"
          ? payload.message
          : "We couldn't generate the feedback.",
        status === 401
          ? "unauthorized"
          : typeof payload.code === "string"
            ? payload.code
            : "evaluation_failed",
        typeof payload.retryable === "boolean"
          ? payload.retryable
          : status >= 500,
      );
    }

    if (error instanceof FunctionsFetchError) {
      throw new EvaluationError(
        "We couldn't reach the evaluation service.",
        "network_error",
        true,
      );
    }

    if (error instanceof FunctionsRelayError) {
      throw new EvaluationError(
        "The evaluation service is temporarily unavailable.",
        "service_unavailable",
        true,
      );
    }

    throw new EvaluationError(
      "We couldn't generate the feedback.",
      "evaluation_failed",
      true,
    );
  },
};

export class EvaluationError extends Error {
  code: string;
  retryable: boolean;

  constructor(message: string, code: string, retryable = true) {
    super(message);
    this.name = "EvaluationError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function getEvaluationErrorMessage(error: unknown) {
  if (error instanceof EvaluationError) {
    if (error.code === "already_processing") {
      return "Your feedback is already being generated. Wait a moment and try again.";
    }
    if (error.code === "insufficient_answer") {
      return "This answer is too short to evaluate. Please record a fuller answer.";
    }
    if (error.code === "transcript_required") {
      return "Create the transcript before requesting feedback.";
    }
    if (!error.retryable) return error.message;
    if (error.code === "unauthorized") {
      return "Your session expired. Sign in again before retrying.";
    }
    if (error.code === "network_error") {
      return "We couldn't connect. Your answer is safe, so you can retry.";
    }
    return error.message;
  }
  return "We couldn't generate the feedback.";
}

export function canRetryEvaluation(error: unknown) {
  return !(error instanceof EvaluationError) || error.retryable;
}

export function evaluationRequiresAuthentication(error: unknown) {
  return error instanceof EvaluationError && error.code === "unauthorized";
}
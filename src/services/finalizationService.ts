import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

import { assertSupabaseConfigured, supabase } from "@/lib/supabase";

const FINALIZATION_TIMEOUT_MS = 90_000;

export type SessionFeedbackResult = {
  sessionId: string;
  feedback: {
    overallScore: number;
    performanceLabel: string;
    summary: string;
    scores: {
      relevance: number;
      structure: number;
      clarity: number;
      grammar: number;
      vocabulary: number;
      confidence: number;
    };
    strengths: { title: string; detail: string }[];
    focusAreas: { title: string; detail: string; action: string }[];
    recommendedPractice: { type: string; reason: string };
    strongestAnswerId: string | null;
    focusAnswerId: string | null;
  };
};

export const finalizationService = {
  async finalizeInterview(sessionId: string): Promise<SessionFeedbackResult> {
    assertSupabaseConfigured();

    const { data, error } = await supabase.functions.invoke<SessionFeedbackResult>(
      "finalize-interview",
      {
        body: { sessionId },
        timeout: FINALIZATION_TIMEOUT_MS,
      },
    );

    if (!error && data) return data;
    if (!error) {
      throw new FinalizationError(
        "The finalization service returned an empty response.",
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
      throw new FinalizationError(
        typeof payload.message === "string"
          ? payload.message
          : "We couldn't finalize the interview.",
        status === 401
          ? "unauthorized"
          : typeof payload.code === "string"
            ? payload.code
            : "finalization_failed",
        typeof payload.retryable === "boolean"
          ? payload.retryable
          : status >= 500,
      );
    }

    if (error instanceof FunctionsFetchError) {
      throw new FinalizationError(
        "We couldn't reach the finalization service.",
        "network_error",
        true,
      );
    }

    if (error instanceof FunctionsRelayError) {
      throw new FinalizationError(
        "The finalization service is temporarily unavailable.",
        "service_unavailable",
        true,
      );
    }

    throw new FinalizationError(
      "We couldn't finalize the interview.",
      "finalization_failed",
      true,
    );
  },
};

export class FinalizationError extends Error {
  code: string;
  retryable: boolean;

  constructor(message: string, code: string, retryable = true) {
    super(message);
    this.name = "FinalizationError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function getFinalizationErrorMessage(error: unknown) {
  if (error instanceof FinalizationError) {
    if (error.code === "already_processing") {
      return "Your summary is already being created. Wait a moment and try again.";
    }
    if (error.code === "incomplete_answers") {
      return "Every question must be answered before finalizing.";
    }
    if (error.code === "incomplete_feedback") {
      return "Every answer needs feedback before the interview can be finalized.";
    }
    if (!error.retryable) return error.message;
    if (error.code === "unauthorized") {
      return "Your session expired. Sign in again before retrying.";
    }
    if (error.code === "network_error") {
      return "We couldn't connect. Your answers are safe, so you can retry.";
    }
    return error.message;
  }
  return "We couldn't finalize the interview.";
}

export function canRetryFinalization(error: unknown) {
  return !(error instanceof FinalizationError) || error.retryable;
}

export function finalizationRequiresAuthentication(error: unknown) {
  return error instanceof FinalizationError && error.code === "unauthorized";
}
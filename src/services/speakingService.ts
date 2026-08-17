import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

import { randomUUID } from "expo-crypto";

import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import type {
  SpeakingAttemptRecord,
  SpeakingEvaluationResult,
  SpeakingHistoryItem,
  SpeakingPrompt,
  SpeakingSessionPayload,
  SpeakingSessionRecord,
  SpeakingTranscriptionResult,
} from "@/types/speaking";

const STEP_TIMEOUT_MS = 90_000;

export type SpeakingStepErrorCode =
  | "invalid_attempt_id"
  | "attempt_not_found"
  | "audio_not_attached"
  | "recording_required"
  | "attempt_limit_reached"
  | "daily_limit_reached"
  | "already_processing"
  | "insufficient_answer"
  | "transcript_required"
  | "already_completed"
  | "network_error"
  | "service_unavailable"
  | "unauthorized"
  | "unknown";

export class SpeakingStepError extends Error {
  code: SpeakingStepErrorCode;
  retryable: boolean;

  constructor(message: string, code: SpeakingStepErrorCode, retryable = true) {
    super(message);
    this.name = "SpeakingStepError";
    this.code = code;
    this.retryable = retryable;
  }
}

export const speakingService = {
  async createSession(
    userId: string,
    prompt: SpeakingPrompt,
  ): Promise<SpeakingSessionRecord> {
    assertSupabaseConfigured();

    const { data, error } = await supabase
      .from("speaking_sessions")
      .insert({
id: randomUUID(),
        user_id: userId,
        category: prompt.category,
        prompt_id: prompt.id,
        prompt_text: prompt.text,
        prompt_tip: prompt.tip,
        difficulty: prompt.difficulty,
        time_limit_seconds: prompt.timeLimitSeconds,
      })
      .select("*")
      .single();

    if (error) throw error;
    return data as SpeakingSessionRecord;
  },

  async reserveAttempt(
    sessionId: string,
    userId: string,
  ): Promise<SpeakingAttemptRecord> {
    assertSupabaseConfigured();

    const { data, error } = await supabase.rpc("reserve_speaking_attempt", {
      p_attempt_id: randomUUID(),
      p_session_id: sessionId,
      p_user_id: userId,
    });
    if (error) throw error;
    if (!data) throw new Error("We couldn't reserve a speaking attempt.");
    return data as SpeakingAttemptRecord;
  },

  async attachAudio(input: {
    attemptId: string;
    audioPath: string;
    durationSeconds: number;
    mimeType: string;
    sizeBytes: number;
  }): Promise<SpeakingAttemptRecord> {
    assertSupabaseConfigured();

    const { data, error } = await supabase.rpc("attach_speaking_audio", {
      p_attempt_id: input.attemptId,
      p_audio_path: input.audioPath,
      p_duration_seconds: input.durationSeconds,
      p_audio_mime_type: input.mimeType,
      p_audio_size_bytes: input.sizeBytes,
    });
    if (error) throw error;
    if (!data) throw new Error("We couldn't attach the recording.");
    return data as SpeakingAttemptRecord;
  },

  async closeSession(
    sessionId: string,
    status: "completed" | "abandoned",
  ): Promise<SpeakingSessionRecord> {
    assertSupabaseConfigured();

    const { data, error } = await supabase.rpc("close_speaking_session", {
      p_session_id: sessionId,
      p_status: status,
    });
    if (error) throw error;
    if (!data) throw new Error("We couldn't close this practice session.");
    return data as SpeakingSessionRecord;
  },

  async transcribeAttempt(attemptId: string): Promise<SpeakingTranscriptionResult> {
    assertSupabaseConfigured();

    const { data, error } = await supabase.functions.invoke<SpeakingTranscriptionResult>(
      "transcribe-speaking",
      {
        body: { attemptId },
        timeout: STEP_TIMEOUT_MS,
      },
    );

    if (!error && data) return data;
    if (!error) {
      throw new SpeakingStepError(
        "The transcription service returned an empty response.",
        "unknown",
      );
    }
    throw invokeError(error, "transcription");
  },

  async evaluateAttempt(attemptId: string): Promise<SpeakingEvaluationResult> {
    assertSupabaseConfigured();

    const { data, error } = await supabase.functions.invoke<SpeakingEvaluationResult>(
      "evaluate-speaking",
      {
        body: { attemptId },
        timeout: STEP_TIMEOUT_MS,
      },
    );

    if (!error && data) return data;
    if (!error) {
      throw new SpeakingStepError(
        "The evaluation service returned an empty response.",
        "unknown",
      );
    }
    throw invokeError(error, "evaluation");
  },

  async fetchSession(sessionId: string): Promise<SpeakingSessionPayload> {
    assertSupabaseConfigured();

    const { data, error } = await supabase.rpc("get_speaking_session", {
      p_session_id: sessionId,
    });
    if (error) throw error;
    if (!data) throw new Error("We couldn't load this practice session.");
    return data as unknown as SpeakingSessionPayload;
  },

  async fetchHistory(): Promise<SpeakingHistoryItem[]> {
    assertSupabaseConfigured();

    const { data, error } = await supabase.rpc("get_speaking_history");
    if (error) throw error;
    return (data as unknown as SpeakingHistoryItem[]) ?? [];
  },

  async fetchPracticeSummary(): Promise<{
    currentStreak: number;
    longestStreak: number;
    todaySeconds: number;
    practiceDays: string[];
  }> {
    assertSupabaseConfigured();

    const { data, error } = await supabase.rpc("get_user_practice_summary");
    if (error) throw error;
    if (!data) {
      return { currentStreak: 0, longestStreak: 0, todaySeconds: 0, practiceDays: [] };
    }
    return data as unknown as {
      currentStreak: number;
      longestStreak: number;
      todaySeconds: number;
      practiceDays: string[];
    };
  },
};

async function invokeError(error: unknown, step: "transcription" | "evaluation") {
  const fallbackMessage =
    step === "transcription"
      ? "We couldn't create the transcript."
      : "We couldn't generate the feedback.";

  if (error instanceof FunctionsHttpError) {
    const status = error.context instanceof Response ? error.context.status : 0;
    let payload: { code?: unknown; message?: unknown; retryable?: unknown } = {};
    try {
      payload = (await error.context.json()) as typeof payload;
    } catch {
      // Gateway errors are not guaranteed to include a JSON body.
    }
    const code = normalizeStepCode(payload.code);
    return new SpeakingStepError(
      typeof payload.message === "string" ? payload.message : fallbackMessage,
      status === 401 || code === "unauthorized" ? "unauthorized" : code,
      typeof payload.retryable === "boolean"
        ? payload.retryable
        : status >= 500,
    );
  }

  if (error instanceof FunctionsFetchError) {
    return new SpeakingStepError(
      "We couldn't reach the service.",
      "network_error",
      true,
    );
  }

  if (error instanceof FunctionsRelayError) {
    return new SpeakingStepError(
      "The service is temporarily unavailable.",
      "service_unavailable",
      true,
    );
  }

  return new SpeakingStepError(fallbackMessage, "unknown", true);
}

function normalizeStepCode(code: unknown): SpeakingStepErrorCode {
  if (typeof code !== "string") return "unknown";
  const known: SpeakingStepErrorCode[] = [
    "invalid_attempt_id",
    "attempt_not_found",
    "audio_not_attached",
    "recording_required",
    "attempt_limit_reached",
    "daily_limit_reached",
    "already_processing",
    "insufficient_answer",
    "transcript_required",
    "unauthorized",
  ];
  return known.includes(code as SpeakingStepErrorCode)
    ? (code as SpeakingStepErrorCode)
    : "unknown";
}

export function getSpeakingStepMessage(error: unknown) {
  if (error instanceof SpeakingStepError) {
    if (error.code === "already_processing") {
      return "Your recording is already being processed. Wait a moment and try again.";
    }
    if (error.code === "insufficient_answer") {
      return "This answer is too short to evaluate. Please record a fuller answer.";
    }
    if (error.code === "recording_required") {
      return "Record a new answer before retrying.";
    }
    if (error.code === "attempt_limit_reached") {
      return "This recording reached its retry limit. Record a new answer.";
    }
    if (error.code === "daily_limit_reached") {
      return "You've reached today's limit. Your recordings are saved — come back tomorrow.";
    }
    if (!error.retryable) return error.message;
    if (error.code === "unauthorized") {
      return "Your session expired. Sign in again before retrying.";
    }
    if (error.code === "network_error") {
      return "We couldn't connect. Your uploaded recording is safe, so you can retry.";
    }
    if (error.code === "service_unavailable") {
      return "The service is busy right now. Please retry shortly.";
    }
    return error.message;
  }
  return "Something went wrong while processing your recording.";
}

export function canRetrySpeakingStep(error: unknown) {
  return !(error instanceof SpeakingStepError) || error.retryable;
}

export function speakingStepRequiresReRecord(error: unknown) {
  return (
    error instanceof SpeakingStepError &&
    (error.code === "recording_required" || error.code === "attempt_limit_reached")
  );
}

export function speakingStepRequiresAuthentication(error: unknown) {
  return error instanceof SpeakingStepError && error.code === "unauthorized";
}
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

import { assertSupabaseConfigured, supabase } from "@/lib/supabase";

const TRANSCRIPTION_TIMEOUT_MS = 90_000;

export type TranscriptionResult = {
  answerId: string;
  transcript: string;
  durationSeconds: number;
  wordCount: number;
  speakingPace: number;
};

export const transcriptionService = {
  async transcribe(answerId: string): Promise<TranscriptionResult> {
    assertSupabaseConfigured();

    const { data, error } = await supabase.functions.invoke<TranscriptionResult>(
      "transcribe-answer",
      {
        body: { answerId },
        timeout: TRANSCRIPTION_TIMEOUT_MS,
      },
    );

    if (!error && data) return data;
    if (!error) {
      throw new TranscriptionError(
        "The transcription service returned an empty response.",
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
      throw new TranscriptionError(
        typeof payload.message === "string"
          ? payload.message
          : "We couldn't create the transcript.",
        status === 401
          ? "unauthorized"
          : typeof payload.code === "string"
            ? payload.code
            : "transcription_failed",
        typeof payload.retryable === "boolean"
          ? payload.retryable
          : status >= 500,
      );
    }

    if (error instanceof FunctionsFetchError) {
      throw new TranscriptionError(
        "We couldn't reach the transcription service.",
        "network_error",
        true,
      );
    }

    if (error instanceof FunctionsRelayError) {
      throw new TranscriptionError(
        "The transcription service is temporarily unavailable.",
        "service_unavailable",
        true,
      );
    }

    throw new TranscriptionError(
      "We couldn't create the transcript.",
      "transcription_failed",
      true,
    );
  },
};

export class TranscriptionError extends Error {
  code: string;
  retryable: boolean;

  constructor(message: string, code: string, retryable = true) {
    super(message);
    this.name = "TranscriptionError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function getTranscriptionErrorMessage(error: unknown) {
  if (error instanceof TranscriptionError) {
    if (error.code === "already_processing") {
      return "Your transcript is already being created. Wait a moment and try again.";
    }
    if (error.code === "audio_too_large") {
      return "This recording is too large to transcribe. Please record it again.";
    }
    if (!error.retryable) return error.message;
    if (error.code === "unauthorized") {
      return "Your session expired. Sign in again before retrying.";
    }
    if (error.code === "network_error") {
      return "We couldn't connect. Your uploaded recording is safe, so you can retry.";
    }
    return error.message;
  }
  return "We recorded your answer, but couldn't create the transcript.";
}

export function canRetryTranscription(error: unknown) {
  return !(error instanceof TranscriptionError) || error.retryable;
}

export function transcriptionRequiresAuthentication(error: unknown) {
  return error instanceof TranscriptionError && error.code === "unauthorized";
}

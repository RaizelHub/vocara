import { accountAccessResponse } from "../_shared/accountPrivacy.ts";
import { fetchGroqJson, ProviderError, usageContext, aiClaimError, type UsageContext } from "../_shared/aiProvider.ts";
import type { SupabaseContext } from "npm:@supabase/server@1.4.1";
import { withSupabase } from "npm:@supabase/server@1.4.1";

import type {
  Database,
  SpeakingAttemptRow as AttemptRow,
} from "../_shared/database.types.ts";
import {
  AudioInspectionError,
  inspectM4a,
  toHex,
} from "../_shared/audioInspect.ts";

const AUDIO_BUCKET = "speaking-audio";
const MAX_STORAGE_AUDIO_BYTES = 5 * 1024 * 1024;
const PROVIDER_FILE_LIMIT_BYTES = 25 * 1024 * 1024;
const PROVIDER_TIMEOUT_MS = 75_000;
const DEFAULT_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";
const ALLOWED_TRANSCRIPTION_MODELS = new Set([
  "whisper-large-v3",
  "whisper-large-v3-turbo",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_AUDIO_TYPES = new Set(["audio/mp4", "audio/m4a", "audio/x-m4a"]);
const ATTEMPT_COLUMNS =
  "id,session_id,user_id,attempt_number,transcript,audio_path,duration_seconds,word_count,speaking_pace,transcription_status,transcription_retryable,transcription_attempt_count,transcription_attempt_id,transcription_started_at,transcription_model,transcription_provider_request_id,audio_mime_type,audio_size_bytes,audio_sha256,audio_generation,audio_attached_at" as const;

type TranscriptionResponse = {
  attemptId: string;
  transcript: string;
  durationSeconds: number;
  wordCount: number;
  speakingPace: number;
};

type ProviderConfig = { apiKey: string; model: string };

class FunctionError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor(status: number, code: string, message: string, retryable = true) {
    super(message);
    this.name = "FunctionError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export default {
  fetch: withSupabase<Database>(
    { auth: "user" },
    async (request: Request, context: SupabaseContext<Database>) => {
      if (request.method !== "POST") {
        return errorResponse(405, "method_not_allowed", "Use POST for transcription.");
      }

      const userId = context.userClaims?.id;
      if (!userId) {
        return errorResponse(401, "unauthorized", "Authentication is required.");
      }
      const accountDenied = await accountAccessResponse(context.supabaseAdmin, userId);
      if (accountDenied) return accountDenied;


      let attemptId: string;
      try {
        const body = (await request.json()) as { attemptId?: unknown };
        if (
          typeof body.attemptId !== "string" || !UUID_PATTERN.test(body.attemptId)
        ) {
          throw new FunctionError(
            400,
            "invalid_attempt_id",
            "A valid attempt ID is required.",
          );
        }
        attemptId = body.attemptId;
      } catch (error) {
        if (error instanceof FunctionError) {
          return errorResponse(error.status, error.code, error.message, error.retryable);
        }
        return errorResponse(400, "invalid_request", "Send a valid JSON request body.");
      }

      const { data: visibleAttempt, error: attemptError } = await context.supabase
        .from("speaking_attempts")
        .select(ATTEMPT_COLUMNS)
        .eq("id", attemptId)
        .maybeSingle();

      if (attemptError) {
        return errorResponse(500, "attempt_lookup_failed", "We couldn't load this attempt.");
      }
      if (!visibleAttempt || visibleAttempt.user_id !== userId) {
        return errorResponse(404, "attempt_not_found", "Attempt not found.");
      }

      let attempt = visibleAttempt as AttemptRow;
      if (isCompleted(attempt)) return Response.json(toResponse(attempt));

      if (!attempt.transcription_retryable) {
        return errorResponse(
          422,
          "recording_required",
          "Record a new answer before retrying transcription.",
          false,
        );
      }
      try {
        validateAttachedAudio(attempt, userId);
      } catch (error) {
        return handledErrorResponse(error);
      }

      let providerConfig: ProviderConfig;
      try {
        providerConfig = getProviderConfig();
      } catch (error) {
        return handledErrorResponse(error);
      }

      const requestId = crypto.randomUUID();
      const { data: claimed, error: claimError } = await context.supabaseAdmin.rpc(
        "claim_speaking_transcription",
        {
          p_attempt_id: attemptId,
          p_user_id: userId,
          p_attempt_number: attempt.attempt_number,
          p_transcription_attempt_id: requestId,
        },
      );

      if (claimError) {
        const capacity = aiClaimError(claimError);
        if (capacity) return capacity;
        if (claimError.message.includes("SPEAKING_TRANSCRIPTION_ALREADY_COMPLETED")) {
          const { data: current } = await context.supabaseAdmin
            .from("speaking_attempts")
            .select(ATTEMPT_COLUMNS)
            .eq("id", attemptId)
            .eq("user_id", userId)
            .maybeSingle();
          if (current && isCompleted(current as AttemptRow)) {
            return Response.json(toResponse(current as AttemptRow));
          }
          return errorResponse(409, "already_processing", "This attempt is already being processed.");
        }
        return handleClaimError(claimError);
      }
      if (!claimed) {
        return errorResponse(500, "claim_failed", "We couldn't start the transcript.");
      }
      attempt = claimed as AttemptRow;
      if (attempt.transcription_status !== "processing") {
        return errorResponse(
          429,
          "attempt_limit_reached",
          "This recording reached its transcription retry limit. Record it again.",
          false,
        );
      }

      try {
        const [sessionResult, audioResult] = await Promise.all([
          context.supabase
            .from("speaking_sessions")
            .select("prompt_text,category")
            .eq("id", attempt.session_id)
            .single(),
          context.supabase.storage.from(AUDIO_BUCKET).download(attempt.audio_path!),
        ]);

        if (sessionResult.error) {
          throw new FunctionError(
            500,
            "context_lookup_failed",
            "We couldn't load the speaking context.",
          );
        }
        if (audioResult.error || !audioResult.data) {
          throw new FunctionError(
            422,
            "audio_not_found",
            "The uploaded recording could not be found.",
            false,
          );
        }

        const audio = audioResult.data;
        const media = await inspectDownloadedAudio(audio, attempt);
        const { data: mediaVerified, error: mediaVerificationError } =
          await context.supabaseAdmin.rpc("verify_speaking_audio", {
            p_attempt_id: attemptId,
            p_user_id: userId,
            p_transcription_attempt_id: requestId,
            p_audio_sha256: media.sha256,
            p_duration_seconds: media.durationSeconds,
          });
        if (mediaVerificationError) {
          throw new FunctionError(
            500,
            "media_verification_failed",
            "We couldn't verify this recording. Please retry.",
          );
        }
        if (!mediaVerified) {
          throw new FunctionError(
            429,
            "attempt_limit_reached",
            "This recording reached its transcription retry limit. Record it again.",
            false,
          );
        }

        const transcription = await requestTranscription(
          audio,
          attempt.audio_path!,
          requestId,
          providerConfig,
        usageContext(context.supabaseAdmin, userId, requestId, "speaking_transcription_requests"),
        media.durationSeconds,
          {
            category: sessionResult.data.category,
            prompt: sessionResult.data.prompt_text,
          },
        );
        const normalizedTranscript = normalizeTranscript(transcription.text);
        if (!normalizedTranscript) {
          throw new FunctionError(
            422,
            "no_speech_detected",
            "We couldn't detect speech. Please record your answer again.",
            false,
          );
        }

        const durationSeconds = media.durationSeconds;
        const wordCount = countWords(normalizedTranscript);
        if (wordCount === 0) {
          throw new FunctionError(
            422,
            "no_speech_detected",
            "We couldn't detect speech. Please record your answer again.",
            false,
          );
        }
        const speakingPace = calculateSpeakingPace(wordCount, durationSeconds);
        const { data: completed, error: updateError } = await context.supabaseAdmin
          .rpc("complete_speaking_transcription", {
            p_attempt_id: attemptId,
            p_user_id: userId,
            p_transcription_attempt_id: requestId,
            p_transcript: normalizedTranscript,
            p_duration_seconds: durationSeconds,
            p_word_count: wordCount,
            p_speaking_pace: speakingPace,
            p_audio_sha256: media.sha256,
            p_model: transcription.model,
            p_provider_request_id: transcription.requestId,
          });

        if (updateError) {
          if (updateError.message.includes("SPEAKING_TRANSCRIPTION_ATTEMPT_SUPERSEDED")) {
            throw new FunctionError(
              409,
              "attempt_superseded",
              "A newer recording replaced this transcription attempt.",
            );
          }
          throw new FunctionError(
            500,
            "attempt_update_failed",
            "The transcript was created but could not be saved.",
          );
        }
        if (!completed) {
          throw new FunctionError(
            409,
            "attempt_superseded",
            "A newer recording replaced this transcription attempt.",
          );
        }

        return Response.json(toResponse(completed as AttemptRow));
      } catch (error) {
        const handled = normalizeFunctionError(error);
        const uncertainProviderOutcome = [
          "GROQ_TIMEOUT",
        "GROQ_UNAVAILABLE",
        "AI_ACCOUNTING_UNAVAILABLE",
        "transcription_timeout",
          "transcription_unavailable",
        ].includes(handled.code);
        let finalRetryable = handled.retryable;
        if (!uncertainProviderOutcome) {
          const {
            data: failedAttempt,
            error: failureUpdateError,
          } = await context.supabaseAdmin.rpc("fail_speaking_transcription", {
            p_attempt_id: attemptId,
            p_user_id: userId,
            p_transcription_attempt_id: requestId,
            p_error_code: handled.code,
            p_error_message: handled.message,
            p_retryable: handled.retryable,
          });

          if (failureUpdateError) {
            console.error("[transcribe-speaking] Failed to persist failure state", {
              attemptId,
              code: failureUpdateError.code,
            });
          } else if (failedAttempt) {
            finalRetryable = failedAttempt.transcription_retryable;
          }
        }

        return errorResponse(
          handled.status,
          handled.code,
          handled.message,
          finalRetryable,
        );
      }
    },
  ),
};

function handleClaimError(error: { message: string }) {
  if (error.message.includes("SPEAKING_TRANSCRIPTION_NOT_FOUND")) {
    return errorResponse(404, "attempt_not_found", "Attempt not found.");
  }
  if (error.message.includes("SPEAKING_TRANSCRIPTION_AUDIO_NOT_ATTACHED")) {
    return errorResponse(
      422,
      "audio_not_attached",
      "Upload the attempt audio before transcription.",
      false,
    );
  }
  if (error.message.includes("SPEAKING_TRANSCRIPTION_RECORDING_REQUIRED")) {
    return errorResponse(
      422,
      "recording_required",
      "Record a new answer before retrying transcription.",
      false,
    );
  }
  if (error.message.includes("SPEAKING_TRANSCRIPTION_ATTEMPT_LIMIT")) {
    return errorResponse(
      429,
      "attempt_limit_reached",
      "This recording reached its transcription retry limit. Record it again.",
      false,
    );
  }
  if (error.message.includes("SPEAKING_TRANSCRIPTION_DAILY_LIMIT")) {
    return errorResponse(
      429,
      "daily_limit_reached",
      "You've reached today's transcription limit. Please try again later.",
    );
  }
  if (error.message.includes("SPEAKING_TRANSCRIPTION_ALREADY_PROCESSING")) {
    return errorResponse(
      409,
      "already_processing",
      "This attempt is already being transcribed.",
    );
  }
  return errorResponse(500, "claim_failed", "We couldn't start the transcript.");
}

function validateAttachedAudio(attempt: AttemptRow, userId: string) {
  if (!attempt.audio_path || attempt.duration_seconds === null) {
    throw new FunctionError(422, "audio_not_attached", "Upload the attempt audio first.");
  }
  if (attempt.duration_seconds <= 0 || attempt.duration_seconds > 120) {
    throw new FunctionError(422, "invalid_duration", "The recording duration is invalid.");
  }

  const pathParts = attempt.audio_path.split("/");
  if (
    pathParts.length !== 3 ||
    pathParts[0] !== userId ||
    pathParts[1] !== attempt.session_id ||
    !UUID_PATTERN.test(pathParts[2].replace(/\.m4a$/i, "")) ||
    !pathParts[2].toLowerCase().endsWith(".m4a")
  ) {
    throw new FunctionError(403, "invalid_audio_path", "The recording path is invalid.");
  }
}

async function inspectDownloadedAudio(audio: Blob, attempt: AttemptRow) {
  if (audio.size <= 0) {
    throw new FunctionError(422, "empty_audio", "The uploaded recording is empty.", false);
  }
  if (audio.size > MAX_STORAGE_AUDIO_BYTES || audio.size > PROVIDER_FILE_LIMIT_BYTES) {
    throw new FunctionError(
      413,
      "audio_too_large",
      "The uploaded recording is too large to transcribe.",
      false,
    );
  }
  if (attempt.audio_size_bytes !== null && audio.size !== attempt.audio_size_bytes) {
    throw new FunctionError(
      409,
      "audio_changed",
      "The uploaded recording changed. Upload it again before retrying.",
      false,
    );
  }

  const mimeType = audio.type || attempt.audio_mime_type || "";
  if (!ALLOWED_AUDIO_TYPES.has(mimeType)) {
    throw new FunctionError(
      415,
      "unsupported_audio",
      "This audio format is not supported.",
      false,
    );
  }

  const bytes = new Uint8Array(await audio.arrayBuffer());
  const media = inspectM4a(bytes);
  if (media.durationSeconds > 120.5) {
    throw new FunctionError(
      413,
      "audio_too_long",
      "The recording is longer than two minutes. Please record it again.",
      false,
    );
  }
  if (
    attempt.duration_seconds !== null &&
    Math.abs(media.durationSeconds - attempt.duration_seconds) > 3
  ) {
    throw new FunctionError(
      422,
      "duration_mismatch",
      "The recording duration could not be verified. Please record it again.",
      false,
    );
  }

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return {
    durationSeconds: Math.min(120, Math.max(1, Math.round(media.durationSeconds))),
    sha256: toHex(new Uint8Array(digest)),
  };
}

async function requestTranscription(
  audio: Blob,
  audioPath: string,
  requestId: string,
  configuration: ProviderConfig,
  usage: UsageContext,
  audioSeconds: number,
  context: { category: string; prompt: string },
) {
  const { apiKey, model } = configuration;
  const mimeType = audio.type || "audio/mp4";
  const fileName = audioPath.split("/").at(-1) ?? "answer.m4a";
  const form = new FormData();
  form.append("file", new File([audio], fileName, { type: mimeType }));
  form.append("model", model);
  form.append("prompt", buildTranscriptionPrompt(context));

  const { payload, response } = await fetchGroqJson({
    url: "https://api.groq.com/openai/v1/audio/transcriptions",
    apiKey, model, body: form, usage, audioSeconds, timeoutMs: PROVIDER_TIMEOUT_MS,
  });
  if (!payload || typeof payload.text !== "string") {
    throw new FunctionError(
      502,
      "invalid_transcription_response",
      "The transcription service returned an invalid response.",
    );
  }
  return {
    text: payload.text,
    model,
    requestId: response.headers.get("x-request-id"),
  };
}

function getProviderConfig(): ProviderConfig {
  const apiKey = Deno.env.get("GROQ_API_KEY")?.trim();
  const model =
    Deno.env.get("GROQ_TRANSCRIPTION_MODEL")?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
  if (!apiKey || !ALLOWED_TRANSCRIPTION_MODELS.has(model)) {
    throw new FunctionError(
      500,
      "transcription_not_configured",
      "Transcription is not configured yet.",
    );
  }
  return { apiKey, model };
}

function buildTranscriptionPrompt(context: { category: string; prompt: string }) {
  const category = context.category.replace(/\s+/g, " ").trim().slice(0, 40);
  const prompt = context.prompt.replace(/\s+/g, " ").trim().slice(0, 700);
  return (
    `Speaking practice (${category}). Prompt: ${prompt}. ` +
    "Preserve names, technical terms, product names, and filler words as spoken."
  );
}

function normalizeTranscript(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function countWords(transcript: string) {
  return (
    transcript.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0
  );
}

function calculateSpeakingPace(wordCount: number, durationSeconds: number) {
  if (wordCount === 0 || durationSeconds <= 0) return 0;
  return Math.round(wordCount / (durationSeconds / 60));
}

function isCompleted(attempt: AttemptRow) {
  return (
    attempt.transcription_status === "completed" && !!attempt.transcript?.trim()
  );
}

function toResponse(attempt: AttemptRow): TranscriptionResponse {
  const transcript = attempt.transcript?.trim() ?? "";
  const durationSeconds = attempt.duration_seconds ?? 0;
  const wordCount = attempt.word_count ?? countWords(transcript);
  const speakingPace =
    attempt.speaking_pace === null
      ? calculateSpeakingPace(wordCount, durationSeconds)
      : Math.round(Number(attempt.speaking_pace));
  return {
    attemptId: attempt.id,
    transcript,
    durationSeconds,
    wordCount,
    speakingPace,
  };
}

function normalizeFunctionError(error: unknown) {
  if (error instanceof ProviderError) return error;
  if (error instanceof FunctionError) return error;
  if (error instanceof AudioInspectionError) {
    return new FunctionError(
      415,
      "invalid_audio_container",
      "The recording file is invalid. Please record your answer again.",
      false,
    );
  }
  return new FunctionError(
    500,
    "transcription_failed",
    "We couldn't create the transcript. Please retry.",
  );
}

function handledErrorResponse(error: unknown) {
  const handled = normalizeFunctionError(error);
  return errorResponse(handled.status, handled.code, handled.message, handled.retryable);
}

function errorResponse(status: number, code: string, message: string, retryable = true) {
  return Response.json({ code, message, retryable }, { status });
}
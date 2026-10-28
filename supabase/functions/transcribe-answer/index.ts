import { accountAccessResponse } from "../_shared/accountPrivacy.ts";
import { fetchGroqJson, ProviderError, usageContext, aiClaimError, type UsageContext } from "../_shared/aiProvider.ts";
import type { SupabaseContext } from "npm:@supabase/server@1.4.1";
import { withSupabase } from "npm:@supabase/server@1.4.1";

import type {
  InterviewAnswerRow as AnswerRow,
  Database,
} from "../_shared/database.types.ts";

const AUDIO_BUCKET = "interview-audio";
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
const ANSWER_COLUMNS =
  "id,session_id,question_id,user_id,transcript,audio_path,duration_seconds,word_count,speaking_pace,transcription_status,transcription_retryable,transcription_attempt_count,transcription_attempt_id,transcription_started_at,transcription_model,transcription_provider_request_id,audio_mime_type,audio_size_bytes,audio_sha256,audio_generation,audio_attached_at" as const;

type TranscriptionResponse = {
  answerId: string;
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
  fetch: withSupabase<Database>({ auth: "user" }, async (request: Request, context: SupabaseContext<Database>) => {
    if (request.method !== "POST") {
      return errorResponse(405, "method_not_allowed", "Use POST for transcription.");
    }

    const userId = context.userClaims?.id;
    if (!userId) {
      return errorResponse(401, "unauthorized", "Authentication is required.");
    }

    const accountDenied = await accountAccessResponse(context.supabaseAdmin, userId);
    if (accountDenied) return accountDenied;

    let answerId: string;
    try {
      const body = (await request.json()) as { answerId?: unknown };
      if (typeof body.answerId !== "string" || !UUID_PATTERN.test(body.answerId)) {
        throw new FunctionError(400, "invalid_answer_id", "A valid answer ID is required.");
      }
      answerId = body.answerId;
    } catch (error) {
      if (error instanceof FunctionError) {
        return errorResponse(error.status, error.code, error.message, error.retryable);
      }
      return errorResponse(400, "invalid_request", "Send a valid JSON request body.");
    }

    const { data: visibleAnswer, error: answerError } = await context.supabase
      .from("interview_answers")
      .select(ANSWER_COLUMNS)
      .eq("id", answerId)
      .maybeSingle();

    if (answerError) {
      return errorResponse(500, "answer_lookup_failed", "We couldn't load this answer.");
    }
    if (!visibleAnswer || visibleAnswer.user_id !== userId) {
      return errorResponse(404, "answer_not_found", "Answer not found.");
    }

    let answer = visibleAnswer as AnswerRow;
    if (isCompleted(answer)) return Response.json(toResponse(answer));

    if (!answer.transcription_retryable) {
      return errorResponse(
        422,
        "recording_required",
        "Record a new answer before retrying transcription.",
        false,
      );
    }
    try {
      validateAttachedAudio(answer, userId);
    } catch (error) {
      return handledErrorResponse(error);
    }

    let providerConfig: ProviderConfig;
    try {
      providerConfig = getProviderConfig();
    } catch (error) {
      return handledErrorResponse(error);
    }

    const attemptId = crypto.randomUUID();
    const { data: claimed, error: claimError } = await context.supabaseAdmin.rpc(
      "claim_answer_transcription",
      {
        p_answer_id: answerId,
        p_user_id: userId,
        p_attempt_id: attemptId,
      },
    );

    if (claimError) {
        const capacity = aiClaimError(claimError);
        if (capacity) return capacity;
      if (claimError.message.includes("TRANSCRIPTION_ALREADY_COMPLETED")) {
        const { data: current } = await context.supabaseAdmin
          .from("interview_answers")
          .select(ANSWER_COLUMNS)
          .eq("id", answerId)
          .eq("user_id", userId)
          .maybeSingle();
        if (current && isCompleted(current as AnswerRow)) {
          return Response.json(toResponse(current as AnswerRow));
        }
      }
      if (claimError.message.includes("TRANSCRIPTION_ANSWER_NOT_FOUND")) {
        return errorResponse(404, "answer_not_found", "Answer not found.");
      }
      if (claimError.message.includes("TRANSCRIPTION_AUDIO_NOT_ATTACHED")) {
        return errorResponse(
          422,
          "audio_not_attached",
          "Upload the answer audio before transcription.",
          false,
        );
      }
      if (claimError.message.includes("INTERVIEW_ANSWER_RETRY_EXHAUSTED")) {
        return errorResponse(
          429,
          "answer_retry_exhausted",
          "This answer reached its processing safety limit. Saved answers remain available. Contact support for help with this interview.",
          false,
        );
      }
      if (claimError.message.includes("TRANSCRIPTION_RECORDING_REQUIRED")) {
        return errorResponse(
          422,
          "recording_required",
          "Record a new answer before retrying transcription.",
          false,
        );
      }
      if (claimError.message.includes("TRANSCRIPTION_ATTEMPT_LIMIT")) {
        return errorResponse(
          429,
          "attempt_limit_reached",
          "This recording reached its transcription retry limit. Record it again.",
          false,
        );
      }
      if (claimError.message.includes("TRANSCRIPTION_DAILY_LIMIT")) {
        return errorResponse(
          429,
          "daily_limit_reached",
          "You've reached today's transcription limit. Please try again later.",
        );
      }
      if (claimError.message.includes("TRANSCRIPTION_ALREADY_PROCESSING")) {
        return errorResponse(
          409,
          "already_processing",
          "This answer is already being transcribed.",
        );
      }
      return errorResponse(500, "claim_failed", "We couldn't start the transcript.");
    }
    if (!claimed) {
      return errorResponse(500, "claim_failed", "We couldn't start the transcript.");
    }
    answer = claimed as AnswerRow;
    if (answer.transcription_status !== "processing") {
      return errorResponse(
        429,
        "attempt_limit_reached",
        "This recording reached its transcription retry limit. Record it again.",
        false,
      );
    }

    try {
      const [sessionResult, questionResult, audioResult] = await Promise.all([
        context.supabase
          .from("interview_sessions")
          .select("role")
          .eq("id", answer.session_id)
          .single(),
        context.supabase
          .from("interview_questions")
          .select("question_text")
          .eq("id", answer.question_id)
          .single(),
        context.supabase.storage.from(AUDIO_BUCKET).download(answer.audio_path!),
      ]);

      if (sessionResult.error || questionResult.error) {
        throw new FunctionError(
          500,
          "context_lookup_failed",
          "We couldn't load the interview context.",
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
      const media = await inspectDownloadedAudio(audio, answer);
      const { data: mediaVerified, error: mediaVerificationError } =
        await context.supabaseAdmin.rpc("verify_answer_audio", {
          p_answer_id: answerId,
          p_user_id: userId,
          p_attempt_id: attemptId,
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
        answer.audio_path!,
        attemptId,
        providerConfig,
        usageContext(context.supabaseAdmin, userId, attemptId, "transcription_requests"),
        media.durationSeconds,
        {
          role: sessionResult.data.role,
          question: questionResult.data.question_text,
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
        .rpc("complete_answer_transcription", {
          p_answer_id: answerId,
          p_user_id: userId,
          p_attempt_id: attemptId,
          p_transcript: normalizedTranscript,
          p_duration_seconds: durationSeconds,
          p_word_count: wordCount,
          p_speaking_pace: speakingPace,
          p_audio_sha256: media.sha256,
          p_model: transcription.model,
          p_provider_request_id: transcription.requestId,
        });

      if (updateError) {
        if (updateError.message.includes("TRANSCRIPTION_ATTEMPT_SUPERSEDED")) {
          throw new FunctionError(
            409,
            "attempt_superseded",
            "A newer recording replaced this transcription attempt.",
          );
        }
        throw new FunctionError(
          500,
          "answer_update_failed",
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

      return Response.json(toResponse(completed as AnswerRow));
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
          data: failedAnswer,
          error: failureUpdateError,
        } = await context.supabaseAdmin.rpc("fail_answer_transcription", {
          p_answer_id: answerId,
          p_user_id: userId,
          p_attempt_id: attemptId,
          p_error_code: handled.code,
          p_error_message: handled.message,
          p_retryable: handled.retryable,
        });

        if (failureUpdateError) {
          console.error("[transcribe-answer] Failed to persist failure state");
        } else if (failedAnswer) {
          finalRetryable = failedAnswer.transcription_retryable;
        }
      }

      return errorResponse(
        handled.status,
        handled.code,
        handled.message,
        finalRetryable,
      );
    }
  }),
};

function validateAttachedAudio(answer: AnswerRow, userId: string) {
  if (!answer.audio_path || answer.duration_seconds === null) {
    throw new FunctionError(422, "audio_not_attached", "Upload the answer audio first.");
  }
  if (answer.duration_seconds <= 0 || answer.duration_seconds > 120) {
    throw new FunctionError(422, "invalid_duration", "The recording duration is invalid.");
  }

  const pathParts = answer.audio_path.split("/");
  if (
    pathParts.length !== 4 ||
    pathParts[0] !== userId ||
    pathParts[1] !== answer.session_id ||
    pathParts[2] !== answer.id ||
    !UUID_PATTERN.test(pathParts[3].replace(/\.m4a$/i, "")) ||
    !pathParts[3].toLowerCase().endsWith(".m4a")
  ) {
    throw new FunctionError(403, "invalid_audio_path", "The recording path is invalid.");
  }
}

async function inspectDownloadedAudio(audio: Blob, answer: AnswerRow) {
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
  if (answer.audio_size_bytes !== null && audio.size !== answer.audio_size_bytes) {
    throw new FunctionError(
      409,
      "audio_changed",
      "The uploaded recording changed. Upload it again before retrying.",
      false,
    );
  }

  const mimeType = audio.type || answer.audio_mime_type || "";
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
    answer.duration_seconds !== null &&
    Math.abs(media.durationSeconds - answer.duration_seconds) > 3
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

type Mp4Box = {
  type: string;
  dataStart: number;
  end: number;
};

const MAX_MP4_BOXES_PER_LEVEL = 4096;
const MAX_AUDIO_SAMPLES = 100_000;

export function inspectM4a(bytes: Uint8Array) {
  try {
    const topLevel = readBoxes(bytes, 0, bytes.byteLength);
    const mdatPayloadBytes = topLevel
      .filter((box) => box.type === "mdat")
      .reduce((total, box) => total + box.end - box.dataStart, 0);
    if (
      !topLevel.some((box) => box.type === "ftyp") ||
      mdatPayloadBytes <= 0
    ) {
      throw new Error("Missing required MP4 boxes.");
    }

    const moov = topLevel.find((box) => box.type === "moov");
    if (!moov) throw new Error("Missing MP4 metadata.");

    const tracks = readBoxes(bytes, moov.dataStart, moov.end).filter(
      (box) => box.type === "trak",
    );
    let audioDuration: number | null = null;
    let audioTrackCount = 0;

    for (const track of tracks) {
      const mdia = readBoxes(bytes, track.dataStart, track.end).find(
        (box) => box.type === "mdia",
      );
      if (!mdia) continue;
      const mediaBoxes = readBoxes(bytes, mdia.dataStart, mdia.end);
      const handler = mediaBoxes.find((box) => box.type === "hdlr");
      if (!handler) continue;
      const handlerType = readFourCc(bytes, handler.dataStart + 8, handler.end);
      if (handlerType === "vide") throw new Error("Video tracks are not accepted.");
      if (handlerType !== "soun") continue;

      audioTrackCount += 1;
      const mdhd = mediaBoxes.find((box) => box.type === "mdhd");
      if (!mdhd) throw new Error("Missing audio duration metadata.");
      const mediaTiming = readMediaTiming(bytes, mdhd);

      const minf = mediaBoxes.find((box) => box.type === "minf");
      if (!minf) throw new Error("Missing audio media information.");
      const stbl = readBoxes(bytes, minf.dataStart, minf.end).find(
        (box) => box.type === "stbl",
      );
      if (!stbl) throw new Error("Missing audio sample table.");
      const sampleBoxes = readBoxes(bytes, stbl.dataStart, stbl.end);
      const stsd = sampleBoxes.find(
        (box) => box.type === "stsd",
      );
      const stts = sampleBoxes.find((box) => box.type === "stts");
      const stsz = sampleBoxes.find((box) => box.type === "stsz");
      if (!stsd || !stts || !stsz) {
        throw new Error("Missing required audio sample metadata.");
      }

      const description = readAacSampleDescription(bytes, stsd);
      if (description.sampleRate !== mediaTiming.timescale) {
        throw new Error("Audio sample rate and media timescale do not match.");
      }
      const sampleTiming = readSampleTiming(
        bytes,
        stts,
        mediaTiming.timescale,
        description.sampleRate,
      );
      const sampleSizes = readSampleSizes(bytes, stsz);
      if (sampleTiming.sampleCount !== sampleSizes.sampleCount) {
        throw new Error("Audio timing and sample counts do not match.");
      }
      if (sampleSizes.totalBytes <= 0 || sampleSizes.totalBytes > mdatPayloadBytes) {
        throw new Error("Audio sample bytes are invalid.");
      }
      if (Math.abs(mediaTiming.durationSeconds - sampleTiming.durationSeconds) > 0.25) {
        throw new Error("Audio duration metadata does not agree.");
      }
      audioDuration = sampleTiming.durationSeconds;
    }

    if (audioTrackCount !== 1 || audioDuration === null || audioDuration <= 0) {
      throw new Error("Expected one valid audio track.");
    }
    return { durationSeconds: audioDuration };
  } catch (error) {
    if (error instanceof FunctionError) throw error;
    const wrapped = new FunctionError(
      415,
      "invalid_audio_container",
      "The recording file is invalid. Please record your answer again.",
      false,
    );
    wrapped.cause = error;
    throw wrapped;
  }
}

function readBoxes(bytes: Uint8Array, start: number, end: number): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let offset = start;

  while (offset + 8 <= end) {
    const size32 = readUint32(bytes, offset);
    const type = readFourCc(bytes, offset + 4, end);
    let headerSize = 8;
    let size = size32;

    if (size32 === 1) {
      if (offset + 16 > end) throw new Error("Invalid extended MP4 box.");
      const size64 = readUint64(bytes, offset + 8);
      if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("MP4 box is too large.");
      }
      size = Number(size64);
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }

    if (size < headerSize || offset + size > end) {
      throw new Error("Invalid MP4 box size.");
    }
    boxes.push({ type, dataStart: offset + headerSize, end: offset + size });
    if (boxes.length > MAX_MP4_BOXES_PER_LEVEL) {
      throw new Error("MP4 contains too many boxes.");
    }
    offset += size;
  }

  if (offset !== end) {
    const trailing = bytes.subarray(offset, end);
    if (trailing.some((value) => value !== 0)) throw new Error("Invalid MP4 padding.");
  }
  return boxes;
}

function readMediaTiming(bytes: Uint8Array, box: Mp4Box) {
  const version = bytes[box.dataStart];
  if (version === 0) {
    if (box.dataStart + 20 > box.end) throw new Error("Invalid mdhd box.");
    const timescale = readUint32(bytes, box.dataStart + 12);
    const duration = readUint32(bytes, box.dataStart + 16);
    if (timescale === 0) throw new Error("Invalid audio timescale.");
    return { timescale, durationSeconds: duration / timescale };
  }
  if (version === 1) {
    if (box.dataStart + 32 > box.end) throw new Error("Invalid mdhd box.");
    const timescale = readUint32(bytes, box.dataStart + 20);
    const duration = readUint64(bytes, box.dataStart + 24);
    if (timescale === 0) throw new Error("Invalid audio timescale.");
    return { timescale, durationSeconds: Number(duration) / timescale };
  }
  throw new Error("Unsupported mdhd version.");
}

function readAacSampleDescription(bytes: Uint8Array, stsd: Mp4Box) {
  if (stsd.dataStart + 16 > stsd.end) throw new Error("Invalid stsd box.");
  const entryCount = readUint32(bytes, stsd.dataStart + 4);
  const entryStart = stsd.dataStart + 8;
  const entrySize = readUint32(bytes, entryStart);
  const entryEnd = entryStart + entrySize;
  if (
    entryCount !== 1 ||
    entrySize < 36 ||
    entryEnd > stsd.end ||
    readFourCc(bytes, entryStart + 4, entryEnd) !== "mp4a"
  ) {
    throw new Error("The recording is not a single AAC sample entry.");
  }

  const version = readUint16(bytes, entryStart + 16);
  const channelCount = readUint16(bytes, entryStart + 24);
  const sampleSize = readUint16(bytes, entryStart + 26);
  const sampleRate = readUint32(bytes, entryStart + 32) / 65536;
  if (
    version !== 0 ||
    channelCount < 1 ||
    channelCount > 2 ||
    sampleSize !== 16 ||
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 48000
  ) {
    throw new Error(
      `Unsupported AAC recording parameters (${version}/${channelCount}/${sampleSize}/${sampleRate}).`,
    );
  }

  const esds = readBoxes(bytes, entryStart + 36, entryEnd).find(
    (box) => box.type === "esds",
  );
  if (!esds || esds.dataStart + 6 > esds.end) {
    throw new Error("Missing AAC decoder configuration.");
  }
  const config = readAudioSpecificConfig(
    bytes,
    esds.dataStart + 4,
    esds.end,
    sampleRate,
    channelCount,
  );
  if (
    config.audioObjectType !== 2 ||
    config.sampleRate !== sampleRate ||
    config.channelConfiguration !== channelCount
  ) {
    throw new Error(
      `AAC decoder configuration does not match (${config.audioObjectType}/${config.sampleRate}/${config.channelConfiguration}).`,
    );
  }

  return { sampleRate };
}

function readAudioSpecificConfig(
  bytes: Uint8Array,
  start: number,
  end: number,
  expectedSampleRate: number,
  expectedChannels: number,
) {
  for (let offset = start; offset < end - 2; offset += 1) {
    if (bytes[offset] !== 0x05) continue;
    const descriptor = readDescriptorLength(bytes, offset + 1, end);
    if (!descriptor || descriptor.length < 2 || descriptor.dataStart + descriptor.length > end) {
      continue;
    }

    try {
      const reader = createBitReader(
        bytes.subarray(descriptor.dataStart, descriptor.dataStart + descriptor.length),
      );
      let audioObjectType = reader.read(5);
      if (audioObjectType === 31) audioObjectType = 32 + reader.read(6);
      const frequencyIndex = reader.read(4);
      const sampleRates = [
        96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050,
        16000, 12000, 11025, 8000, 7350,
      ];
      const sampleRate = frequencyIndex === 15 ? reader.read(24) : sampleRates[frequencyIndex];
      const channelConfiguration = reader.read(4);
      if (
        audioObjectType === 2 &&
        sampleRate === expectedSampleRate &&
        channelConfiguration === expectedChannels
      ) {
        return { audioObjectType, sampleRate, channelConfiguration };
      }
    } catch {
      // Continue scanning the bounded esds payload for DecoderSpecificInfo.
    }
  }
  throw new Error("Invalid AAC decoder configuration.");
}

function readDescriptorLength(bytes: Uint8Array, start: number, end: number) {
  let length = 0;
  let offset = start;
  for (let index = 0; index < 4 && offset < end; index += 1) {
    const value = bytes[offset++];
    length = (length << 7) | (value & 0x7f);
    if ((value & 0x80) === 0) return { length, dataStart: offset };
  }
  return null;
}

function createBitReader(bytes: Uint8Array) {
  let bitOffset = 0;
  return {
    read(count: number) {
      if (count < 0 || bitOffset + count > bytes.byteLength * 8) {
        throw new Error("Invalid AAC bitstream.");
      }
      let value = 0;
      for (let index = 0; index < count; index += 1) {
        const byte = bytes[Math.floor(bitOffset / 8)];
        value = value * 2 + ((byte >> (7 - (bitOffset % 8))) & 1);
        bitOffset += 1;
      }
      return value;
    },
  };
}

function readSampleTiming(
  bytes: Uint8Array,
  stts: Mp4Box,
  timescale: number,
  sampleRate: number,
) {
  if (stts.dataStart + 8 > stts.end) throw new Error("Invalid stts box.");
  const entryCount = readUint32(bytes, stts.dataStart + 4);
  if (entryCount < 1 || entryCount > MAX_AUDIO_SAMPLES) {
    throw new Error("Invalid audio timing entry count.");
  }
  if (stts.dataStart + 8 + entryCount * 8 > stts.end) {
    throw new Error("Truncated audio timing table.");
  }

  let sampleCount = 0;
  let totalDuration = 0n;
  for (let index = 0; index < entryCount; index += 1) {
    const offset = stts.dataStart + 8 + index * 8;
    const count = readUint32(bytes, offset);
    const delta = readUint32(bytes, offset + 4);
    const samplesPerFrame = (delta * sampleRate) / timescale;
    const fullFrame =
      Math.min(Math.abs(samplesPerFrame - 1024), Math.abs(samplesPerFrame - 960)) <=
      0.01;
    const boundaryPartialFrame =
      count === 1 &&
      (index === 0 || index === entryCount - 1) &&
      samplesPerFrame > 0 &&
      samplesPerFrame < 1024;
    if (
      count < 1 ||
      delta < 1 ||
      (!fullFrame && !boundaryPartialFrame)
    ) {
      throw new Error(`Unexpected AAC sample timing (${count}/${delta}/${samplesPerFrame}).`);
    }
    sampleCount += count;
    if (sampleCount > MAX_AUDIO_SAMPLES) throw new Error("Too many audio samples.");
    totalDuration += BigInt(count) * BigInt(delta);
  }

  return { sampleCount, durationSeconds: Number(totalDuration) / timescale };
}

function readSampleSizes(bytes: Uint8Array, stsz: Mp4Box) {
  if (stsz.dataStart + 12 > stsz.end) throw new Error("Invalid stsz box.");
  const uniformSize = readUint32(bytes, stsz.dataStart + 4);
  const sampleCount = readUint32(bytes, stsz.dataStart + 8);
  if (sampleCount < 1 || sampleCount > MAX_AUDIO_SAMPLES) {
    throw new Error("Invalid audio sample count.");
  }

  if (uniformSize > 0) {
    return { sampleCount, totalBytes: uniformSize * sampleCount };
  }
  if (stsz.dataStart + 12 + sampleCount * 4 > stsz.end) {
    throw new Error("Truncated audio sample-size table.");
  }

  let totalBytes = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const size = readUint32(bytes, stsz.dataStart + 12 + index * 4);
    if (size < 1) throw new Error("Invalid audio sample size.");
    totalBytes += size;
  }
  return { sampleCount, totalBytes };
}

function readUint16(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > bytes.byteLength) throw new Error("Unexpected EOF.");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(
    offset,
    false,
  );
}

function readUint32(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw new Error("Unexpected EOF.");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
    false,
  );
}

function readUint64(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 8 > bytes.byteLength) throw new Error("Unexpected EOF.");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(
    offset,
    false,
  );
}

function readFourCc(bytes: Uint8Array, offset: number, end: number) {
  if (offset < 0 || offset + 4 > end || offset + 4 > bytes.byteLength) {
    throw new Error("Unexpected EOF.");
  }
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function requestTranscription(
  audio: Blob,
  audioPath: string,
  attemptId: string,
  configuration: ProviderConfig,
  usage: UsageContext,
  audioSeconds: number,
  context: { role: string; question: string },
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

function buildTranscriptionPrompt(context: { role: string; question: string }) {
  const role = context.role.replace(/\s+/g, " ").trim().slice(0, 160);
  const question = context.question.replace(/\s+/g, " ").trim().slice(0, 700);
  return (
    `Interview answer for the role ${role}. Question: ${question}. ` +
    "Preserve names, technical terms, programming languages, product names, and filler words as spoken."
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

function isCompleted(answer: AnswerRow) {
  return answer.transcription_status === "completed" && !!answer.transcript?.trim();
}

function toResponse(answer: AnswerRow): TranscriptionResponse {
  const transcript = answer.transcript?.trim() ?? "";
  const durationSeconds = answer.duration_seconds ?? 0;
  const wordCount = answer.word_count ?? countWords(transcript);
  const speakingPace =
    answer.speaking_pace === null
      ? calculateSpeakingPace(wordCount, durationSeconds)
      : Math.round(Number(answer.speaking_pace));
  return { answerId: answer.id, transcript, durationSeconds, wordCount, speakingPace };
}

function normalizeFunctionError(error: unknown) {
  if (error instanceof ProviderError) return error;
  if (error instanceof FunctionError) return error;
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

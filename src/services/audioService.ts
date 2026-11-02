import { AudioUploadError } from "./audioErrors";
import { CryptoDigestAlgorithm, digest, randomUUID } from "expo-crypto";
import { fetch as expoFetch } from "expo/fetch";
import { File } from "expo-file-system";

import {
  assertSupabaseConfigured,
  supabase,
  supabasePublicConfig,
} from "@/lib/supabase";

export const INTERVIEW_AUDIO_BUCKET = "interview-audio";
export const SPEAKING_AUDIO_BUCKET = "speaking-audio";
export const ANSWER_AUDIO_MIME_TYPE = "audio/mp4";
export const MAX_ANSWER_AUDIO_BYTES = 5 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 45_000;

type UploadAnswerAudioInput = {
  localUri: string;
  audioPath: string;
  signal?: AbortSignal;
};

export type UploadedAnswerAudio = {
  path: string;
  mimeType: typeof ANSWER_AUDIO_MIME_TYPE;
  sizeBytes: number;
};

export const audioService = {
  createAnswerPath(userId: string, sessionId: string, answerId: string) {
    return `${userId}/${sessionId}/${answerId}/${randomUUID()}.m4a`;
  },

  async uploadAnswerAudio(input: UploadAnswerAudioInput): Promise<UploadedAnswerAudio> {
    assertSupabaseConfigured();
    const file = validateLocalAudio(input.localUri);

    // A byte body preserves the explicit Storage MIME type instead of allowing
    // expo/fetch to replace it with platform-derived File metadata.
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) throw authError;
    if (!authData.session) throw new AudioUploadError("unauthorized", "Session expired.");

    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    if (input.signal?.aborted) {
      throw new AudioUploadError("cancelled", "The audio upload was cancelled.");
    }
    input.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, UPLOAD_TIMEOUT_MS);
    let response: Response;
    try {
      response = await expoFetch(
        `${supabasePublicConfig.url}/storage/v1/object/${INTERVIEW_AUDIO_BUCKET}/${encodeStoragePath(input.audioPath)}`,
        {
          method: "POST",
          headers: {
            apikey: supabasePublicConfig.publishableKey,
            Authorization: `Bearer ${authData.session.access_token}`,
            "Content-Type": ANSWER_AUDIO_MIME_TYPE,
            "Cache-Control": "max-age=3600",
            "x-upsert": "false",
          },
          body: fileBytes,
          signal: controller.signal,
        },
      );
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AudioUploadError(
          timedOut ? "timeout" : "cancelled",
          timedOut ? "The audio upload timed out." : "The audio upload was cancelled.",
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", abortFromCaller);
    }

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const duplicate =
        response.status === 409 ||
        responseText.toLowerCase().includes("already exists") ||
        responseText.toLowerCase().includes("duplicate");

      if (!duplicate) {
        const authenticationFailure =
          response.status === 401 ||
          (response.status === 403 && /jwt|token|auth/i.test(responseText));
        if (authenticationFailure) {
          throw new AudioUploadError("unauthorized", "Session expired.");
        }
        throw storageUploadError(response.status, responseText);
      }

      const existing = await supabase.storage
        .from(INTERVIEW_AUDIO_BUCKET)
        .download(input.audioPath);
      if (
        existing.error ||
        !existing.data ||
        existing.data.size !== file.size ||
        (await sha256(existing.data)) !== (await sha256(file))
      ) {
        throw new AudioUploadError(
          "path_conflict",
          "A different recording already uses this upload path.",
        );
      }
    }

    return {
      path: input.audioPath,
      mimeType: ANSWER_AUDIO_MIME_TYPE,
      sizeBytes: file.size,
    };
  },

  createSpeakingAttemptPath(userId: string, sessionId: string, attemptId: string) {
    return `${userId}/${sessionId}/${attemptId}.m4a`;
  },

  async uploadSpeakingAudio(input: UploadAnswerAudioInput): Promise<UploadedAnswerAudio> {
    assertSupabaseConfigured();
    const file = validateLocalAudio(input.localUri);

    // Keep Storage metadata consistent with the interview upload path.
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) throw authError;
    if (!authData.session) throw new AudioUploadError("unauthorized", "Session expired.");

    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    if (input.signal?.aborted) {
      throw new AudioUploadError("cancelled", "The audio upload was cancelled.");
    }
    input.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, UPLOAD_TIMEOUT_MS);
    let response: Response;
    try {
      response = await expoFetch(
        `${supabasePublicConfig.url}/storage/v1/object/${SPEAKING_AUDIO_BUCKET}/${encodeStoragePath(input.audioPath)}`,
        {
          method: "POST",
          headers: {
            apikey: supabasePublicConfig.publishableKey,
            Authorization: `Bearer ${authData.session.access_token}`,
            "Content-Type": ANSWER_AUDIO_MIME_TYPE,
            "Cache-Control": "max-age=3600",
            "x-upsert": "false",
          },
          body: fileBytes,
          signal: controller.signal,
        },
      );
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AudioUploadError(
          timedOut ? "timeout" : "cancelled",
          timedOut ? "The audio upload timed out." : "The audio upload was cancelled.",
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", abortFromCaller);
    }

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const duplicate =
        response.status === 409 ||
        responseText.toLowerCase().includes("already exists") ||
        responseText.toLowerCase().includes("duplicate");

      if (!duplicate) {
        const authenticationFailure =
          response.status === 401 ||
          (response.status === 403 && /jwt|token|auth/i.test(responseText));
        if (authenticationFailure) {
          throw new AudioUploadError("unauthorized", "Session expired.");
        }
        throw storageUploadError(response.status, responseText);
      }

      const existing = await supabase.storage
        .from(SPEAKING_AUDIO_BUCKET)
        .download(input.audioPath);
      if (
        existing.error ||
        !existing.data ||
        existing.data.size !== file.size ||
        (await sha256(existing.data)) !== (await sha256(file))
      ) {
        throw new AudioUploadError(
          "path_conflict",
          "A different recording already uses this upload path.",
        );
      }
    }

    return {
      path: input.audioPath,
      mimeType: ANSWER_AUDIO_MIME_TYPE,
      sizeBytes: file.size,
    };
  },

  async deleteSpeakingAudio(path: string) {
    assertSupabaseConfigured();
    const { error } = await supabase.storage.from(SPEAKING_AUDIO_BUCKET).remove([path]);
    if (error) throw error;
  },

  async createSpeakingPlaybackUrl(path: string, expiresInSeconds = 300) {
    assertSupabaseConfigured();
    const { data, error } = await supabase.storage
      .from(SPEAKING_AUDIO_BUCKET)
      .createSignedUrl(path, Math.max(1, Math.min(expiresInSeconds, 300)));
    if (error) throw error;
    return data.signedUrl;
  },

  async deleteAnswerAudio(path: string) {
    assertSupabaseConfigured();
    const { error } = await supabase.storage.from(INTERVIEW_AUDIO_BUCKET).remove([path]);
    if (error) throw error;
  },

  async createPlaybackUrl(path: string, expiresInSeconds = 60) {
    assertSupabaseConfigured();
    const { data, error } = await supabase.storage
      .from(INTERVIEW_AUDIO_BUCKET)
      .createSignedUrl(path, Math.max(1, Math.min(expiresInSeconds, 300)));
    if (error) throw error;
    return data.signedUrl;
  },
};

function validateLocalAudio(uri: string) {
  const file = new File(uri);
  if (!file.exists || file.size <= 0) {
    throw new Error("The recorded audio file is unavailable.");
  }
  if (file.extension.toLowerCase() !== ".m4a") {
    throw new Error("The recorded audio format is not supported.");
  }
  if (file.size > MAX_ANSWER_AUDIO_BYTES) {
    throw new Error("The recorded answer is too large to upload.");
  }
  return file;
}

function encodeStoragePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function storageUploadError(status: number, responseText: string) {
  const details = responseText.trim().slice(0, 500);
  const normalized = details.toLowerCase();
  const code =
    status === 413 || normalized.includes("too large") || normalized.includes("maximum allowed size")
      ? "too_large"
      : status === 415 || normalized.includes("mime")
        ? "unsupported_mime"
        : status === 403 || normalized.includes("row-level security")
          ? "forbidden"
          : "upload_failed";

  if (__DEV__) {
    console.warn("Audio upload rejected by Supabase Storage");
  }

  return new AudioUploadError(code, "Storage rejected the upload.", status);
}

async function sha256(blob: Blob) {
  const hash = await digest(
    CryptoDigestAlgorithm.SHA256,
    new Uint8Array(await blob.arrayBuffer()),
  );
  return Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export { AudioUploadError, canRetryAudioUpload, audioUploadRequiresAuthentication, getAudioUploadErrorMessage } from "./audioErrors";

export class AudioUploadError extends Error {
  code: string;
  status?: number;
  details?: string;

  constructor(code: string, message: string, status?: number, details?: string) {
    super(message);
    this.name = "AudioUploadError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function canRetryAudioUpload(error: unknown) {
  if (error instanceof AudioUploadError) {
    return ![
      "forbidden",
      "path_conflict",
      "too_large",
      "unauthorized",
      "unsupported_mime",
    ].includes(error.code);
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return ![
    "too large",
    "format is not supported",
    "file is unavailable",
    "recording is unavailable",
  ].some((value) => message.includes(value));
}

export function audioUploadRequiresAuthentication(error: unknown) {
  return error instanceof AudioUploadError && error.code === "unauthorized";
}

export function getAudioUploadErrorMessage(error: unknown) {
  if (error instanceof AudioUploadError && error.code === "unauthorized") {
    return "Your session expired. Sign in again before retrying.";
  }
  if (error instanceof AudioUploadError && error.code === "path_conflict") {
    return "We couldn't verify this upload. Record your answer again to create a fresh file.";
  }
  if (error instanceof AudioUploadError && error.code === "too_large") {
    return "This recording is too large. Record a shorter answer and try again.";
  }
  if (error instanceof AudioUploadError && error.code === "unsupported_mime") {
    return "Storage rejected this recording format. Please record your answer again.";
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("recording is unavailable")) return "This unsaved recording is no longer available. Record your answer again.";
  if (message.includes("too large")) {
    return "This recording is too large. Record a shorter answer and try again.";
  }
  if (message.includes("format")) {
    return "This recording format isn't supported. Please record your answer again.";
  }
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timed out")
  ) {
    return "Couldn't upload your answer. Check your connection and try again.";
  }
  return "Couldn't upload your answer. Your local recording is still available.";
}

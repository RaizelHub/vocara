import { MAX_RESUME_FILE_BYTES, RESUME_PROCESSING_STATUSES } from "./resumeConfig.ts";

const PDF_MAGIC_NUMBER = "%PDF";
const MAX_RESUME_FILENAME_LENGTH = 255;

export function sanitizeResumeFileName(name: string): string {
  const base = name.replace(/[^\w.\- ]/g, "_").replace(/\s+/g, "_").slice(0, MAX_RESUME_FILENAME_LENGTH - 4) || "resume";
  if (!base.toLowerCase().endsWith(".pdf")) {
    return `${base}.pdf`;
  }
  return base;
}

export function buildResumeStoragePath(userId: string, resumeId: string, fileName: string): string {
  const sanitized = sanitizeResumeFileName(fileName);
  return `${userId}/${resumeId}/${sanitized}`;
}

export function isValidResumeMimeType(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

export function validateResumeFile(file: {
  name: string;
  size: number;
  mimeType?: string;
  buffer?: Uint8Array;
}): ValidationResult {
  if (!file.name || file.name.length > MAX_RESUME_FILENAME_LENGTH) {
    return { ok: false as const, code: "invalid_name" };
  }
  if (file.size <= 0 || file.size > MAX_RESUME_FILE_BYTES) {
    return { ok: false as const, code: "invalid_size" };
  }
  if (file.mimeType && !isValidResumeMimeType(file.mimeType)) {
    return { ok: false as const, code: "invalid_type" };
  }
  if (file.buffer && file.buffer.length >= 4) {
    const header = new TextDecoder().decode(file.buffer.slice(0, 4));
    if (!header.startsWith(PDF_MAGIC_NUMBER)) {
      return { ok: false as const, code: "invalid_content" };
    }
  }
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".pdf")) {
    return { ok: false as const, code: "invalid_extension" };
  }
  return { ok: true as const, sanitizedName: sanitizeResumeFileName(file.name) };
}

export type ValidationResult =
  | { ok: true; sanitizedName: string }
  | { ok: false; code: "invalid_name" | "invalid_size" | "invalid_type" | "invalid_content" | "invalid_extension" };

export function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

export function truncateResumeText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

export const RESUME_PROCESS_STATUS = RESUME_PROCESSING_STATUSES;

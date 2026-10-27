import { InterviewStartError } from "@/lib/interviewErrors";
import { Platform } from "react-native";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";

import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/services/jobService";
import type { Json } from "@/types/database";
import {
  MAX_RESUME_FILE_BYTES,
  RESUME_ALLOWED_MIME_TYPES,
  type GeneratedPersonalizedInterview,
  type MatchStatus,
  type PersonalizedInterviewSettings,
  type ProcessResumeResponse,
  type ResumeAnalysis,
  type ResumeAnalysisRecord,
  type ResumeJobMatchRecord,
  type ResumeMatch,
  type ResumeProcessingStatus,
  type ResumeRecord,
} from "@/types/resume";

const RESUME_STORAGE_BUCKET = "resumes";
const PROCESS_TIMEOUT_MS = 180_000;
const COMPARE_TIMEOUT_MS = 180_000;
const GENERATE_TIMEOUT_MS = 180_000;

export class ResumeServiceError extends Error {
  code: string;
  retryable: boolean;

  constructor(message: string, code: string, retryable = true) {
    super(message);
    this.name = "ResumeServiceError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class ResumeFileValidationError extends Error {
  code: "empty" | "unsupported_type" | "too_large";

  constructor(code: "empty" | "unsupported_type" | "too_large") {
    super(resumeFileErrorMessage(code));
    this.name = "ResumeFileValidationError";
    this.code = code;
  }
}

export type UploadResumeInput = {
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  webFile?: Blob;
};

export type ResumeListItem = Pick<
  ResumeRecord,
  "id" | "file_name" | "processing_status" | "processing_error" | "analysis_version"
> & { created_at: string };

export const resumeService = {
  async uploadResume(input: UploadResumeInput): Promise<ResumeRecord> {
    assertSupabaseConfigured();

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session) {
      throw new ResumeServiceError(
        "Your session expired. Sign in again before continuing.",
        "unauthorized",
        false,
      );
    }

    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError || !user.user) {
      throw new ResumeServiceError(
        "Your session expired. Sign in again before continuing.",
        "unauthorized",
        false,
      );
    }
    const userId = user.user.id;

    const normalizedInput: UploadResumeInput = {
      ...input,
      mimeType:
        input.mimeType && input.mimeType !== "application/octet-stream"
          ? input.mimeType
          : input.fileName.toLowerCase().endsWith(".pdf")
            ? "application/pdf"
            : input.mimeType,
    };

    const resumeId = randomUUID();
    const storagePath = `${userId}/${resumeId}/${sanitizeResumeFileName(normalizedInput.fileName)}`;

    const uploadedSizeBytes = await uploadResumePdf(normalizedInput, storagePath);

    const finalSizeBytes = normalizedInput.sizeBytes > 0 ? normalizedInput.sizeBytes : uploadedSizeBytes;
    const inputToValidate = { ...normalizedInput, sizeBytes: finalSizeBytes };
    validateResumeFile(inputToValidate);

    const { data, error } = await supabase
      .from("resumes")
      .insert({
        id: resumeId,
        user_id: userId,
        file_name: normalizedInput.fileName,
        storage_path: storagePath,
        mime_type: "application/pdf",
        file_size_bytes: finalSizeBytes,
        processing_status: "uploaded",
      })
      .select(
        "id,user_id,is_active,deleted_at,file_name,storage_path,mime_type,file_size_bytes,extracted_text,processing_status,processing_error,analysis_model,analysis_version,created_at,updated_at",
      )
      .single();

    if (error) {
      await supabase.storage.from(RESUME_STORAGE_BUCKET).remove([storagePath]).catch(() => {});
      const isAuthErr = /jwt|token|auth|unauthorized|row-level security|row level security/i.test(error.message);
      if (isAuthErr) {
        throw new ResumeServiceError(
          "Your session expired. Sign in again before retrying.",
          "unauthorized",
          false,
        );
      }
      throw new ResumeServiceError(
        `We couldn't save your resume record: ${error.message}`,
        "resume_save_failed",
      );
    }
    return toResumeRecord(data);
  },

  async processResume(resumeId: string): Promise<ProcessResumeResponse> {
    const { data, error } = await invokeEdgeFunction<ProcessResumeResponse>({
      functionName: "process-resume",
      body: { resumeId },
      timeoutMs: PROCESS_TIMEOUT_MS,
    });
    if (error) throw error;
    if (!data?.resumeId || !data.analysis) {
      throw new ResumeServiceError(
        "The service returned an empty response. Please try again.",
        "invalid_response",
      );
    }
    return data;
  },

  async compareResumeJob(input: {
    resumeId: string;
    jobDescriptionId: string;
  }): Promise<{ matchId: string | null; match: ResumeMatch }> {
    const { data, error } = await invokeEdgeFunction<{
      resumeId: string;
      jobDescriptionId: string;
      matchId: string | null;
      match: ResumeMatch;
    }>({
      functionName: "compare-resume-job",
      body: input,
      timeoutMs: COMPARE_TIMEOUT_MS,
    });
    if (error) throw error;
    if (!data?.match) {
      throw new ResumeServiceError(
        "The service returned an empty response. Please try again.",
        "invalid_response",
      );
    }
    return { matchId: data.matchId ?? null, match: data.match };
  },

  async generateInterview(input: {
    requestId: string;
    resumeId: string;
    jobDescriptionId: string;
  } & PersonalizedInterviewSettings): Promise<GeneratedPersonalizedInterview> {
    const { data, error } = await invokeEdgeFunction<GeneratedPersonalizedInterview>({
      functionName: "generate-personalized-interview",
      body: {
        requestId: input.requestId,
        resumeId: input.resumeId,
        jobDescriptionId: input.jobDescriptionId,
        questionCount: input.questionCount,
        difficultyMode: input.difficultyMode,
        interviewerStyle: input.interviewerStyle,
      },
      timeoutMs: GENERATE_TIMEOUT_MS,
    });
    if (error) throw error;
    if (!data?.session?.id || !Array.isArray(data.questions) || data.questions.length === 0) {
      throw new ResumeServiceError(
        "The interview could not be created. Please try again.",
        "invalid_response",
      );
    }
    return data;
  },

  async fetchResumes(): Promise<ResumeListItem[]> {
    assertSupabaseConfigured();

    const { data, error } = await supabase
      .from("resumes")
      .select("id,file_name,processing_status,processing_error,analysis_version,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      throw new ResumeServiceError("We couldn't load your resumes.", "resumes_lookup_failed");
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      file_name: row.file_name,
      processing_status: row.processing_status as ResumeProcessingStatus,
      processing_error: row.processing_error,
      analysis_version: row.analysis_version,
      created_at: row.created_at,
    }));
  },

  async fetchResume(resumeId: string): Promise<ResumeRecord | null> {
    assertSupabaseConfigured();

    const { data, error } = await supabase
      .from("resumes")
      .select(
        "id,user_id,is_active,deleted_at,file_name,storage_path,mime_type,file_size_bytes,extracted_text,processing_status,processing_error,analysis_model,analysis_version,created_at,updated_at",
      )
      .eq("id", resumeId)
      .maybeSingle();

    if (error) {
      throw new ResumeServiceError("We couldn't load this resume.", "resume_lookup_failed");
    }
    return data ? toResumeRecord(data) : null;
  },

  async fetchResumeAnalysis(resumeId: string): Promise<ResumeAnalysis | null> {
    assertSupabaseConfigured();

    const { data, error } = await supabase
      .from("resume_analyses")
      .select(
        "skills,technologies,work_experience,projects,education,certifications,strengths,professional_summary,current_or_latest_role,seniority_level,years_experience_estimate,analysis_version",
      )
      .eq("resume_id", resumeId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new ResumeServiceError("We couldn't load the resume analysis.", "analysis_lookup_failed");
    }
    return toResumeAnalysis(data);
  },

  async fetchResumeMatch(input: {
    resumeId: string;
    jobDescriptionId: string;
  }): Promise<ResumeMatch | null> {
    assertSupabaseConfigured();

    const { data, error } = await supabase
      .from("resume_job_matches")
      .select(
        "overall_match_score,skill_match_score,experience_alignment_score,matching_skills,missing_requirements,transferable_strengths,experience_alignment,interview_risks,recommended_focus_areas,summary",
      )
      .eq("resume_id", input.resumeId)
      .eq("job_description_id", input.jobDescriptionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new ResumeServiceError("We couldn't load this comparison.", "match_lookup_failed");
    }
    return data ? toResumeMatch(data) : null;
  },

  async deleteResume(resumeId: string): Promise<void> {
    assertSupabaseConfigured();

    const resume = await this.fetchResume(resumeId);
    if (!resume) return;

    const { error } = await supabase.from("resumes").delete().eq("id", resumeId);
    if (error) {
      throw new ResumeServiceError("We couldn't delete this resume.", "resume_delete_failed");
    }
    await supabase.storage.from(RESUME_STORAGE_BUCKET).remove([resume.storage_path]);
  },
};

export function validateResumeFile(input: UploadResumeInput): void {
  const name = String(input.fileName ?? "").trim();
  if (!name) throw new ResumeFileValidationError("empty");
  if (input.sizeBytes <= 0) throw new ResumeFileValidationError("empty");
  if (!(RESUME_ALLOWED_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    throw new ResumeFileValidationError("unsupported_type");
  }
  if (input.sizeBytes > MAX_RESUME_FILE_BYTES) {
    throw new ResumeFileValidationError("too_large");
  }
}

export function sanitizeResumeFileName(fileName: string): string {
  const base = String(fileName ?? "").trim()
    .replace(/[^\w.\- ]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 251) || "resume";
  if (!base.toLowerCase().endsWith(".pdf")) {
    return `${base}.pdf`;
  }
  return base;
}

function resumeFileErrorMessage(code: "empty" | "unsupported_type" | "too_large") {
  if (code === "empty") {
    return "Choose a PDF file to get started.";
  }
  if (code === "unsupported_type") {
    return "Only PDF resumes are supported. Export your resume as a PDF and try again.";
  }
  return "That file is larger than 5 MB. Upload a smaller PDF.";
}

async function uploadResumePdf(input: UploadResumeInput, storagePath: string): Promise<number> {
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError) throw authError;
  if (!authData.session) {
    throw new ResumeServiceError("Your session expired. Sign in again before continuing.", "unauthorized", false);
  }

  let arrayBuffer: ArrayBuffer | null = null;
  let payloadLength = input.sizeBytes || 0;

  // 1. Web: use webFile.arrayBuffer() if provided
  if (Platform.OS === "web" && input.webFile && input.webFile.size > 0) {
    try {
      arrayBuffer = await input.webFile.arrayBuffer();
      payloadLength = input.webFile.size;
    } catch {
      // continue
    }
  }

  // 2. Universal fetch arrayBuffer (works on iOS, Android, and Web for blob/file/content URIs)
  if (!arrayBuffer || arrayBuffer.byteLength <= 0) {
    try {
      const response = await fetch(input.uri);
      if (response.ok) {
        arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer && arrayBuffer.byteLength > 0) {
          payloadLength = arrayBuffer.byteLength;
        }
      }
    } catch {
      // continue
    }
  }

  // 3. Native fallback: try expo-file-system File arrayBuffer
  if ((!arrayBuffer || arrayBuffer.byteLength <= 0) && Platform.OS !== "web") {
    try {
      const uriToUse = input.uri.includes("%") ? decodeURI(input.uri) : input.uri;
      const file = new File(uriToUse);
      if (file.exists && file.size > 0) {
        arrayBuffer = await file.arrayBuffer();
        payloadLength = file.size;
      }
    } catch {
      // continue
    }
  }

  if (!arrayBuffer || arrayBuffer.byteLength <= 0) {
    throw new ResumeServiceError("The selected PDF is unavailable.", "resume_file_unavailable", false);
  }

  const { error: uploadError } = await supabase.storage
    .from(RESUME_STORAGE_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false,
      headers: {
        Authorization: `Bearer ${authData.session.access_token}`,
      },
    });

  if (uploadError) {
    const errorMsg = uploadError.message || "Upload failed";
    const isAuthErr = /jwt|token|auth|unauthorized|row-level security|row level security/i.test(errorMsg);
    if (isAuthErr) {
      throw new ResumeServiceError("Your session expired. Sign in again before continuing.", "unauthorized", false);
    }
    throw new ResumeServiceError(
      `We couldn't upload your resume: ${errorMsg}`,
      "upload_failed",
    );
  }

  return payloadLength;
}

function toResumeRecord(row: ResumeRecord): ResumeRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    is_active: row.is_active,
    deleted_at: row.deleted_at,
    file_name: row.file_name,
    storage_path: row.storage_path,
    mime_type: row.mime_type,
    file_size_bytes: row.file_size_bytes,
    extracted_text: row.extracted_text,
    processing_status: row.processing_status as ResumeProcessingStatus,
    processing_error: row.processing_error,
    analysis_model: row.analysis_model,
    analysis_version: row.analysis_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toResumeAnalysis(
  row: Pick<
    ResumeAnalysisRecord,
    | "professional_summary"
    | "current_or_latest_role"
    | "seniority_level"
    | "years_experience_estimate"
    | "skills"
    | "technologies"
    | "work_experience"
    | "projects"
    | "education"
    | "certifications"
    | "strengths"
  >,
): ResumeAnalysis {
  return {
    professionalSummary: row.professional_summary ?? "",
    currentOrLatestRole: row.current_or_latest_role,
    seniorityLevel: (row.seniority_level as ResumeAnalysis["seniorityLevel"]) ?? "unknown",
    yearsExperienceEstimate: row.years_experience_estimate,
    skills: toResumeSkillList(row.skills),
    technologies: toStrings(row.technologies),
    workExperience: toWorkExperienceList(row.work_experience),
    projects: toProjectList(row.projects),
    education: toEducationList(row.education),
    certifications: toCertificationList(row.certifications),
    strengths: toStrings(row.strengths),
  };
}

function toResumeSkillList(value: Json | null): ResumeAnalysis["skills"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = item as unknown as {
      name?: unknown;
      category?: unknown;
      evidence?: unknown;
    } | null;
    if (!entry || typeof entry !== "object") return [];
    const name = typeof entry.name === "string" ? entry.name : "";
    const category = typeof entry.category === "string" ? entry.category : "";
    const evidence = typeof entry.evidence === "string" ? entry.evidence : "";
    if (!name || !category) return [];
    return [{ name, category, evidence }];
  });
}

function toWorkExperienceList(value: Json | null): ResumeAnalysis["workExperience"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = item as unknown as Record<string, unknown> | null;
    if (!entry || typeof entry !== "object") return [];
    const role = typeof entry.role === "string" ? entry.role : null;
    const company = typeof entry.company === "string" ? entry.company : null;
    const startDate = typeof entry.startDate === "string" ? entry.startDate : null;
    const endDate = typeof entry.endDate === "string" ? entry.endDate : null;
    const summary = typeof entry.summary === "string" ? entry.summary : null;
    const responsibilities = Array.isArray(entry.responsibilities)
      ? entry.responsibilities.filter((r): r is string => typeof r === "string")
      : [];
    if (!role && !company) return [];
    return [{ role, company, startDate, endDate, summary, responsibilities }];
  });
}

function toProjectList(value: Json | null): ResumeAnalysis["projects"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = item as unknown as Record<string, unknown> | null;
    if (!entry || typeof entry !== "object") return [];
    const name = typeof entry.name === "string" ? entry.name : "";
    const description = typeof entry.description === "string" ? entry.description : null;
    const technologies = Array.isArray(entry.technologies)
      ? entry.technologies.filter((t): t is string => typeof t === "string")
      : [];
    if (!name) return [];
    return [{ name, description, technologies }];
  });
}

function toEducationList(value: Json | null): ResumeAnalysis["education"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = item as unknown as Record<string, unknown> | null;
    if (!entry || typeof entry !== "object") return [];
    const degree = typeof entry.degree === "string" ? entry.degree : null;
    const institution = typeof entry.institution === "string" ? entry.institution : null;
    const year = typeof entry.year === "string" ? entry.year : null;
    if (!degree && !institution) return [];
    return [{ degree, institution, year }];
  });
}

function toCertificationList(value: Json | null): ResumeAnalysis["certifications"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = item as unknown as Record<string, unknown> | null;
    if (!entry || typeof entry !== "object") return [];
    const name = typeof entry.name === "string" ? entry.name : "";
    const issuer = typeof entry.issuer === "string" ? entry.issuer : null;
    const year = typeof entry.year === "string" ? entry.year : null;
    if (!name) return [];
    return [{ name, issuer, year }];
  });
}

function toResumeMatch(
  row: Pick<
    ResumeJobMatchRecord,
    | "overall_match_score"
    | "skill_match_score"
    | "experience_alignment_score"
    | "matching_skills"
    | "missing_requirements"
    | "transferable_strengths"
    | "experience_alignment"
    | "interview_risks"
    | "recommended_focus_areas"
    | "summary"
  >,
): ResumeMatch {
  return {
    overallMatchScore: row.overall_match_score,
    skillMatchScore: row.skill_match_score,
    experienceAlignmentScore: row.experience_alignment_score,
    matchingSkills: toMatchingSkillList(row.matching_skills),
    missingRequirements: toRequirementList(row.missing_requirements),
    transferableStrengths: toTransferableStrengthList(row.transferable_strengths),
    experienceAlignment: toAlignmentList(row.experience_alignment),
    interviewRisks: toRiskList(row.interview_risks),
    recommendedFocusAreas: toStrings(row.recommended_focus_areas),
    summary: row.summary ?? "",
  };
}

function toMatchingSkillList(value: Json | null): ResumeMatch["matchingSkills"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = item as unknown as { name?: unknown; evidence?: unknown } | null;
    if (!entry || typeof entry !== "object") return [];
    const name = typeof entry.name === "string" ? entry.name : "";
    const evidence = typeof entry.evidence === "string" ? entry.evidence : "";
    if (!name) return [];
    return [{ name, evidence }];
  });
}

function toRequirementList(value: Json | null): ResumeMatch["missingRequirements"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = item as unknown as {
      requirement?: unknown;
      status?: unknown;
      evidence?: unknown;
    } | null;
    if (!entry || typeof entry !== "object") return [];
    const requirement = typeof entry.requirement === "string" ? entry.requirement : "";
    const status = isMatchStatus(entry.status) ? entry.status : "not_found";
    const evidence = typeof entry.evidence === "string" ? entry.evidence : null;
    if (!requirement) return [];
    return [{ requirement, status, evidence }];
  });
}

function toTransferableStrengthList(value: Json | null): ResumeMatch["transferableStrengths"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = item as unknown as { strength?: unknown; evidence?: unknown } | null;
    if (!entry || typeof entry !== "object") return [];
    const strength = typeof entry.strength === "string" ? entry.strength : "";
    const evidence = typeof entry.evidence === "string" ? entry.evidence : null;
    if (!strength) return [];
    return [{ strength, evidence }];
  });
}

function toAlignmentList(value: Json | null): ResumeMatch["experienceAlignment"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = item as unknown as {
      requirement?: unknown;
      match?: unknown;
      evidence?: unknown;
    } | null;
    if (!entry || typeof entry !== "object") return [];
    const requirement = typeof entry.requirement === "string" ? entry.requirement : "";
    const match = isMatchStatus(entry.match) ? entry.match : "not_found";
    const evidence = typeof entry.evidence === "string" ? entry.evidence : null;
    if (!requirement) return [];
    return [{ requirement, match, evidence }];
  });
}

function toRiskList(value: Json | null): ResumeMatch["interviewRisks"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = item as unknown as { risk?: unknown; preparation?: unknown } | null;
    if (!entry || typeof entry !== "object") return [];
    const risk = typeof entry.risk === "string" ? entry.risk : "";
    const preparation = typeof entry.preparation === "string" ? entry.preparation : "";
    if (!risk) return [];
    return [{ risk, preparation }];
  });
}

function isMatchStatus(value: unknown): value is MatchStatus {
  return (
    value === "strong_match" ||
    value === "partial_match" ||
    value === "not_found" ||
    value === "transferable"
  );
}

function toStrings(value: Json | null) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function getResumeErrorMessage(error: unknown) {
  if (error instanceof InterviewStartError) return error.message;
  if (error instanceof ResumeFileValidationError) return error.message;
  if (error instanceof ResumeServiceError) {
    if (error.code === "unauthorized") {
      return "Your session expired. Sign in again before retrying.";
    }
    if (error.code === "network_error" || error.code === "upload_timeout" || error.code === "upload_failed") {
      return error.message;
    }
    if (error.code === "already_processing") {
      return "This resume is already being analyzed. Wait a moment and try again.";
    }
    if (error.code === "daily_limit_reached" || error.code === "attempt_limit_reached") {
      return error.message;
    }
    if (
      error.code === "resume_analysis_required" ||
      error.code === "job_analysis_required"
    ) {
      return error.message;
    }
    if (!error.retryable) return error.message;
    if (
      error.code === "GROQ_RATE_LIMIT" ||
      error.code === "rate_limit" ||
      error.code === "service_unavailable"
    ) {
      return "Vocara is handling a lot of requests right now. Try again in a moment.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "We couldn't analyze this resume. Please try again.";
}

export function canRetryResumeAction(error: unknown) {
  if (error instanceof ResumeFileValidationError) return false;
  if (error instanceof ResumeServiceError) return error.retryable;
  return true;
}

export function resumeActionRequiresAuthentication(error: unknown) {
  return error instanceof ResumeServiceError && error.code === "unauthorized";
}

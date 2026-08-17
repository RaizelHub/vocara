import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Json } from "@/types/database";
import { MAX_JOB_CHARS, MIN_JOB_CHARS } from "@/types/job";
import type {
  JobAnalysis,
  JobAnalysisRecord,
  JobDescription,
  JobSkill,
} from "@/types/job";

const ANALYZE_TIMEOUT_MS = 180_000;

export type AnalyzeJobResult = {
  jobDescriptionId: string;
  analysis: JobAnalysis;
};

export class JobServiceError extends Error {
  code: string;
  retryable: boolean;

  constructor(message: string, code: string, retryable = true) {
    super(message);
    this.name = "JobServiceError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class JobTextValidationError extends Error {
  code: "empty" | "too_short" | "too_long";

  constructor(code: "empty" | "too_short" | "too_long") {
    super(jobTextErrorMessage(code));
    this.name = "JobTextValidationError";
    this.code = code;
  }
}

export const jobService = {
  async createJobDescription(rawText: string): Promise<JobDescription> {
    assertSupabaseConfigured();

    const validation = validateJobText(rawText);
    if (!validation.ok) throw new JobTextValidationError(validation.code);

    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError || !user.user) {
      throw new JobServiceError(
        "Your session expired. Sign in again before continuing.",
        "unauthorized",
        false,
      );
    }

    const { data, error } = await supabase
      .from("job_descriptions")
      .insert({ user_id: user.user.id, raw_text: validation.raw })
      .select("id,title,company_name,analysis_status,created_at")
      .single();

    if (error) {
      throw new JobServiceError(
        "We couldn't save this job description. Please try again.",
        "job_save_failed",
      );
    }
    return toJobDescription(data);
  },

  async analyzeJob(jobDescriptionId: string): Promise<AnalyzeJobResult> {
    assertSupabaseConfigured();

    const { data, error } = await invokeEdgeFunction<AnalyzeJobResult>({
      functionName: "analyze-job",
      body: { jobDescriptionId },
      timeoutMs: ANALYZE_TIMEOUT_MS,
    });
    if (error) throw error;
    return data;
  },

  async fetchJobAnalysis(jobDescriptionId: string): Promise<JobAnalysis | null> {
    assertSupabaseConfigured();

    const { data, error } = await supabase
      .from("job_analyses")
      .select(
        "detected_role,seniority_level,summary,technical_skills,soft_skills,responsibilities,required_experience,preferred_experience,interview_focus_areas,keywords",
      )
      .eq("job_description_id", jobDescriptionId)
      .maybeSingle();

    if (error) {
      throw new JobServiceError(
        "We couldn't load the job analysis.",
        "analysis_lookup_failed",
      );
    }
    return data ? toJobAnalysis(data) : null;
  },

  async fetchSavedJobs(): Promise<JobDescription[]> {
    assertSupabaseConfigured();

    const { data, error } = await supabase
      .from("job_descriptions")
      .select("id,title,company_name,analysis_status,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      throw new JobServiceError("We couldn't load your saved jobs.", "jobs_lookup_failed");
    }
    return (data ?? []).map(toJobDescription);
  },

  async fetchJobDescription(jobDescriptionId: string): Promise<JobDescription | null> {
    assertSupabaseConfigured();

    const { data, error } = await supabase
      .from("job_descriptions")
      .select("id,title,company_name,analysis_status,created_at")
      .eq("id", jobDescriptionId)
      .maybeSingle();

    if (error) {
      throw new JobServiceError("We couldn't load this job description.", "job_lookup_failed");
    }
    return data ? toJobDescription(data) : null;
  },

  async deleteJobDescription(jobDescriptionId: string): Promise<void> {
    assertSupabaseConfigured();

    const { error } = await supabase
      .from("job_descriptions")
      .delete()
      .eq("id", jobDescriptionId);
    if (error) {
      throw new JobServiceError("We couldn't delete this job description.", "job_delete_failed");
    }
  },
};

export async function invokeEdgeFunction<T>(input: {
  functionName: string;
  body: unknown;
  timeoutMs: number;
}): Promise<{ data: T; error: JobServiceError | null }> {
  assertSupabaseConfigured();

  const { data, error } = await supabase.functions.invoke<T>(input.functionName, {
    body: input.body as Record<string, unknown>,
    timeout: input.timeoutMs,
  });
  if (!error && data) return { data, error: null };
  if (!error) {
    return {
      data: undefined as T,
      error: new JobServiceError(
        "The service returned an empty response. Please try again.",
        "invalid_response",
      ),
    };
  }

  if (error instanceof FunctionsHttpError) {
    const status = error.context instanceof Response ? error.context.status : 0;
    let payload: { code?: unknown; message?: unknown; retryable?: unknown } = {};
    try {
      payload = (await error.context.json()) as typeof payload;
    } catch {
      // Gateway errors are not guaranteed to include a JSON body.
    }
    return {
      data: undefined as T,
      error: new JobServiceError(
        typeof payload.message === "string"
          ? payload.message
          : "We couldn't complete the request.",
        status === 401
          ? "unauthorized"
          : typeof payload.code === "string"
            ? payload.code
            : "service_failed",
        typeof payload.retryable === "boolean"
          ? payload.retryable
          : status >= 500,
      ),
    };
  }

  if (error instanceof FunctionsFetchError) {
    return {
      data: undefined as T,
      error: new JobServiceError("We couldn't reach the service.", "network_error", true),
    };
  }

  if (error instanceof FunctionsRelayError) {
    return {
      data: undefined as T,
      error: new JobServiceError(
        "The service is temporarily unavailable.",
        "service_unavailable",
        true,
      ),
    };
  }

  return {
    data: undefined as T,
    error: new JobServiceError("We couldn't complete the request.", "service_failed", true),
  };
}

export function validateJobText(rawText: string) {
  const value = String(rawText ?? "");
  const raw = value.trim();
  const normalized = raw.replace(/\s+/g, " ");
  if (!normalized) {
    return { ok: false as const, code: "empty" as const, normalized: "", raw: "" };
  }
  if (normalized.length < MIN_JOB_CHARS) {
    return { ok: false as const, code: "too_short" as const, normalized: "", raw };
  }
  if (raw.length > MAX_JOB_CHARS) {
    return { ok: false as const, code: "too_long" as const, normalized: "", raw };
  }
  return { ok: true as const, code: null as never, normalized, raw };
}

function jobTextErrorMessage(code: "empty" | "too_short" | "too_long") {
  if (code === "empty") {
    return "Paste a job description to get started.";
  }
  if (code === "too_short") {
    return "This job description looks too short. Paste the full posting (at least 100 characters).";
  }
  return "That's a very long posting. Keep it under 12,000 characters.";
}

export function getJobErrorMessage(error: unknown) {
  if (error instanceof JobTextValidationError) return error.message;
  if (error instanceof JobServiceError) {
    if (error.code === "unauthorized") {
      return "Your session expired. Sign in again before retrying.";
    }
    if (error.code === "network_error") {
      return "We couldn't connect. Your job description is saved, so you can retry.";
    }
    if (error.code === "already_processing") {
      return "This job is already being analyzed. Wait a moment and try again.";
    }
    if (error.code === "attempt_limit_reached" || error.code === "daily_limit_reached") {
      return error.message;
    }
    if (!error.retryable) return error.message;
    if (
      error.code === "GROQ_RATE_LIMIT" ||
      error.code === "rate_limit" ||
      error.code === "service_unavailable"
    ) {
      return "Vocara is handling a lot of interviews right now. Try again in a moment.";
    }
    return error.message;
  }
  return "We couldn't analyze this job description. Please try again.";
}

export function canRetryJobAction(error: unknown) {
  return !(error instanceof JobServiceError) || error.retryable;
}

export function jobActionRequiresAuthentication(error: unknown) {
  return error instanceof JobServiceError && error.code === "unauthorized";
}

function toJobDescription(row: {
  id: string;
  title: string | null;
  company_name: string | null;
  analysis_status: string;
  created_at: string;
}): JobDescription {
  return {
    id: row.id,
    title: row.title,
    companyName: row.company_name,
    analysisStatus: row.analysis_status as JobDescription["analysisStatus"],
    created_at: row.created_at,
  };
}

function toJobAnalysis(
  row: Pick<
    JobAnalysisRecord,
    | "detected_role"
    | "seniority_level"
    | "summary"
    | "technical_skills"
    | "soft_skills"
    | "responsibilities"
    | "required_experience"
    | "preferred_experience"
    | "interview_focus_areas"
    | "keywords"
  >,
): JobAnalysis {
  return {
    detectedRole: row.detected_role,
    companyName: null,
    seniorityLevel: (row.seniority_level as JobAnalysis["seniorityLevel"]) ?? null,
    summary: row.summary ?? "",
    technicalSkills: toSkills(row.technical_skills),
    softSkills: toSkills(row.soft_skills),
    responsibilities: toStrings(row.responsibilities),
    requiredExperience: toStrings(row.required_experience),
    preferredExperience: toStrings(row.preferred_experience),
    interviewFocusAreas: toStrings(row.interview_focus_areas),
    keywords: toStrings(row.keywords),
  };
}

function toSkills(value: Json | null): JobSkill[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = item as unknown as { name?: unknown; importance?: unknown } | null;
    if (!entry || typeof entry !== "object") return [];
    if (typeof entry.name !== "string" || !entry.name) return [];
    const importance =
      entry.importance === "high" ||
      entry.importance === "medium" ||
      entry.importance === "low"
        ? entry.importance
        : "medium";
    return [{ name: entry.name, importance }];
  });
}

function toStrings(value: Json | null) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

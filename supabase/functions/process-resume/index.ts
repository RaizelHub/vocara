import { accountAccessResponse } from "../_shared/accountPrivacy.ts";
import { usageContext, aiClaimError } from "../_shared/aiProvider.ts";
import type { SupabaseContext } from "npm:@supabase/server@1.4.1";
import { withSupabase } from "npm:@supabase/server@1.4.1";
import { getDocumentProxy, extractText } from "npm:unpdf@1.8.0";

import {
  EvaluationFunctionError,
  requestStructuredEvaluation,
  withGroqRetry,
} from "../_shared/groq.ts";
import type { Database, ResumeRow } from "../_shared/database.types.ts";
import {
  getResumeConfig,
  MAX_COMPLETION_TOKENS_RESUME,
  MAX_RESUME_TEXT_CHARS,
  MIN_RESUME_TEXT_CHARS,
  type ResumeConfig,
} from "../_shared/resumeConfig.ts";
import {
  RESUME_ANALYSIS_JSON_SCHEMA,
  ResumeValidationError,
} from "../_shared/resumeSchemas.ts";
import { validateResumeAnalysis } from "../_shared/resumeValidation.ts";
import {
  buildResumeAnalysisInput,
  RESUME_ANALYSIS_INSTRUCTIONS,
} from "../_shared/resumePrompts.ts";
import {
  normalizeExtractedText,
  truncateResumeText,
} from "../_shared/resumeUtils.ts";
import {
  enforceFeatureAccess,
  FeatureAccessError,
  FEATURE_KEYS,
} from "../_shared/featureAccess.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESUME_STORAGE_BUCKET = "resumes";
const MAX_PDF_PAGES = 40;
const PDF_EXTRACTION_TIMEOUT_MS = 25_000;

type ProcessResumeResponse = {
  resumeId: string;
  analysisVersion: string;
  analysis: {
    professionalSummary: string;
    currentOrLatestRole: string | null;
    seniorityLevel: string;
    yearsExperienceEstimate: number | null;
    skills: { name: string; category: string; evidence: string }[];
    technologies: string[];
    workExperience: {
      role: string | null;
      company: string | null;
      startDate: string | null;
      endDate: string | null;
      summary: string | null;
      responsibilities: string[];
    }[];
    projects: { name: string; description: string | null; technologies: string[] }[];
    education: { degree: string | null; institution: string | null; year: string | null }[];
    certifications: { name: string; issuer: string | null; year: string | null }[];
    strengths: string[];
  };
};

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
        return errorResponse(
          405,
          "method_not_allowed",
          "Use POST for resume analysis.",
        );
      }

      const userId = context.userClaims?.id;
      if (!userId) {
        return errorResponse(
          401,
          "unauthorized",
          "Authentication is required.",
        );
      }
      const accountDenied = await accountAccessResponse(context.supabaseAdmin, userId);
      if (accountDenied) return accountDenied;


      let resumeId: string;
      try {
        const body = (await request.json()) as { resumeId?: unknown };
        if (typeof body.resumeId !== "string" || !UUID_PATTERN.test(body.resumeId)) {
          throw new FunctionError(
            400,
            "invalid_resume_id",
            "A valid resume ID is required.",
          );
        }
        resumeId = body.resumeId;
      } catch (error) {
        if (error instanceof FunctionError) {
          return errorResponse(
            error.status,
            error.code,
            error.message,
            error.retryable,
          );
        }
        return errorResponse(
          400,
          "invalid_request",
          "Send a valid JSON request body.",
        );
      }

      const { data: visibleResume, error: resumeError } = await context.supabase
        .from("resumes")
        .select(
          "id,user_id,storage_path,processing_status,analysis_version,file_name,mime_type,file_size_bytes,extracted_text",
        )
        .eq("id", resumeId)
        .maybeSingle();

      if (resumeError) {
        return errorResponse(
          500,
          "resume_lookup_failed",
          "We couldn't load this resume.",
        );
      }
      if (!visibleResume || visibleResume.user_id !== userId) {
        return errorResponse(404, "resume_not_found", "Resume not found.");
      }

      let configuration: ResumeConfig;
      try {
        configuration = getResumeConfig();
      } catch (error) {
        return handledErrorResponse(error);
      }

      const attemptId = crypto.randomUUID();
      const { data: claimed, error: claimError } = await context.supabaseAdmin
        .rpc(
          "claim_resume_analysis",
          {
            p_resume_id: resumeId,
            p_user_id: userId,
            p_attempt_id: attemptId,
            p_analysis_version: configuration.version,
            p_model: configuration.model,
          },
        );

      if (claimError) {
        const capacity = aiClaimError(claimError);
        if (capacity) return capacity;
        return handleClaimError(claimError);
      }
      if (claimed && typeof claimed === "object") {
        return await returnCompletedAnalysis(resumeId, configuration, context);
      }

      try {
        await enforceFeatureAccess(
          context.supabaseAdmin,
          userId,
          FEATURE_KEYS.resumeAnalysis,
          attemptId,
        );

        const extractedText = await extractPdfText(
          visibleResume,
          context,
          resumeId,
        );
        const normalized = normalizeExtractedText(extractedText);

        if (normalized.length < MIN_RESUME_TEXT_CHARS) {
          throw new FunctionError(
            422,
            "resume_too_short",
            "We couldn't find enough readable text in this PDF. Upload a text-based PDF resume.",
            false,
          );
        }

        const savedText = truncateResumeText(normalized, MAX_RESUME_TEXT_CHARS);
        const { error: saveTextError } = await context.supabaseAdmin
          .from("resumes")
          .update({ extracted_text: savedText })
          .eq("id", resumeId)
          .eq("user_id", userId);
        if (saveTextError) {
          console.error("[process-resume] Failed to persist extracted text", {
            resumeId,
            code: saveTextError.code,
          });
        }

        const { evaluation, validated } = await withGroqRetry(
          async (attempt) => {
            const evaluation = await requestStructuredEvaluation({
              usage: usageContext(context.supabaseAdmin, userId, attemptId, "resume_generation_requests"),
              config: { ...configuration, reasoningEffort: "low" },
              schemaName: "resume_analysis",
              schema: RESUME_ANALYSIS_JSON_SCHEMA,
              instructions: RESUME_ANALYSIS_INSTRUCTIONS,
              content: buildResumeAnalysisInput(savedText),
              userId,
              maxCompletionTokens: MAX_COMPLETION_TOKENS_RESUME,
              seed: 41 + attempt,
            });
            try {
              return {
                evaluation,
                validated: validateResumeAnalysis(evaluation.value),
              };
            } catch (error) {
              if (error instanceof ResumeValidationError) {
                throw new EvaluationFunctionError(
                  502,
                  "GROQ_INVALID_RESPONSE",
                  "AI returned an invalid resume analysis. Please retry.",
                );
              }
              throw error;
            }
          },
        );

        await completeAnalysis(
          resumeId,
          userId,
          attemptId,
          configuration,
          evaluation.model,
          validated,
          context,
        );

        const finalAnalysis = await loadAnalysis(
          resumeId,
          configuration.version,
          context,
        );
        if (!finalAnalysis) {
          throw new FunctionError(
            409,
            "analysis_result_missing",
            "The finished analysis is no longer available. Try again.",
            false,
          );
        }

        return Response.json(
          toResponse(resumeId, configuration.version, finalAnalysis),
        );
      } catch (error) {
        const handled = normalizeFunctionError(error);
        const shortTextFailure =
          handled.code === "resume_too_short" ||
          handled.code === "resume_unreadable";
        const { error: failureUpdateError } = await context.supabaseAdmin.rpc(
          "fail_resume_analysis",
          {
            p_resume_id: resumeId,
            p_user_id: userId,
            p_attempt_id: attemptId,
            p_error_code: shortTextFailure
              ? "RESUME_TOO_SHORT_TEXT"
              : handled.code,
            p_error_message: handled.message,
            p_analysis_version: configuration.version,
          },
        );
        if (failureUpdateError) {
          console.error("[process-resume] Failed to persist failure state", {
            resumeId,
            code: failureUpdateError.code,
          });
        }
        return errorResponse(
          handled.status,
          handled.code,
          handled.message,
          handled.retryable,
        );
      }
    },
  ),
};

async function extractPdfText(
  resume: Pick<
    ResumeRow,
    "storage_path"
  >,
  context: SupabaseContext<Database>,
  resumeId: string,
): Promise<string> {
  let file: Blob;
  try {
    const { data, error } = await context.supabase.storage
      .from(RESUME_STORAGE_BUCKET)
      .download(resume.storage_path);
    if (error) {
      console.error("[process-resume] Storage download failed", {
        resumeId,
        path: resume.storage_path,
        code: error.message,
      });
      throw new FunctionError(
        500,
        "resume_download_failed",
        "We couldn't read the uploaded PDF. Please re-upload it.",
      );
    }
    file = data;
  } catch (error) {
    if (error instanceof FunctionError) throw error;
    throw new FunctionError(
      500,
      "resume_download_failed",
      "We couldn't read the uploaded PDF. Please re-upload it.",
    );
  }

  if (!file || file.size <= 0 || file.size > 5_242_880) {
    throw new FunctionError(
      422,
      "resume_download_failed",
      "The uploaded PDF is invalid. Please re-upload it.",
      false,
    );
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(bytes);
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new FunctionError(
        422,
        "resume_too_many_pages",
        "This PDF has more than 40 pages. Upload a standard resume.",
        false,
      );
    }
    const { text } = await withExtractionTimeout(
      extractText(pdf, { mergePages: true }),
    );
    if (!text.trim()) {
      throw new FunctionError(
        422,
        "resume_unreadable",
        "This PDF appears to be a scanned image with no extractable text.",
        false,
      );
    }
    return text;
  } catch (error) {
    if (error instanceof FunctionError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") throw error;
    throw new FunctionError(
      422,
      "resume_unreadable",
      "We couldn't read this PDF. Upload a text-based PDF resume.",
      false,
    );
  }
}

async function withExtractionTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error("PDF extraction timed out");
          error.name = "TimeoutError";
          reject(error);
        }, PDF_EXTRACTION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function completeAnalysis(
  resumeId: string,
  userId: string,
  attemptId: string,
  configuration: ResumeConfig,
  model: string,
  validated: ReturnType<typeof validateResumeAnalysis>,
  context: SupabaseContext<Database>,
) {
  const { data, error } = await context.supabaseAdmin.rpc(
    "complete_resume_analysis",
    {
      p_resume_id: resumeId,
      p_user_id: userId,
      p_attempt_id: attemptId,
      p_analysis_version: configuration.version,
      p_model: model,
      p_professional_summary: validated.professionalSummary ?? "",
      p_current_or_latest_role: validated.currentOrLatestRole ?? "",
      p_seniority_level: validated.seniorityLevel,
      p_years_experience_estimate:
        validated.yearsExperienceEstimate ?? 0,
      p_skills: validated.skills,
      p_technologies: validated.technologies,
      p_work_experience: validated.workExperience,
      p_projects: validated.projects,
      p_education: validated.education,
      p_certifications: validated.certifications,
      p_strengths: validated.strengths,
    },
  );

  if (error) {
    if (error.message.includes("RESUME_ATTEMPT_SUPERSEDED")) {
      throw new FunctionError(
        409,
        "attempt_superseded",
        "A newer analysis request replaced this attempt.",
      );
    }
    if (error.message.includes("RESUME_INVALID_RESULT")) {
      throw new FunctionError(
        502,
        "invalid_generated_content",
        "The generated analysis could not be validated. Please try again.",
      );
    }
    throw new FunctionError(
      500,
      "analysis_save_failed",
      "The analysis was generated but could not be saved.",
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new FunctionError(
      500,
      "analysis_save_failed",
      "The analysis was generated but could not be saved.",
    );
  }
  return data as Record<string, unknown>;
}

async function returnCompletedAnalysis(
  resumeId: string,
  configuration: ResumeConfig,
  context: SupabaseContext<Database>,
) {
  const analysis = await loadAnalysis(resumeId, configuration.version, context);
  if (!analysis) {
    return errorResponse(
      409,
      "analysis_result_missing",
      "The finished analysis is no longer available. Try again.",
      false,
    );
  }
  return Response.json(toResponse(resumeId, configuration.version, analysis));
}

async function loadAnalysis(
  resumeId: string,
  version: string,
  context: SupabaseContext<Database>,
) {
  const { data, error } = await context.supabase
    .from("resume_analyses")
    .select(
      "professional_summary,current_or_latest_role,seniority_level,years_experience_estimate,skills,technologies,work_experience,projects,education,certifications,strengths,analysis_version",
    )
    .eq("resume_id", resumeId)
    .eq("analysis_version", version)
    .maybeSingle();

  if (
    error ||
    !data ||
    (data as { analysis_version: string }).analysis_version !== version
  ) {
    return null;
  }
  return data as {
    professional_summary: string | null;
    current_or_latest_role: string | null;
    seniority_level: string;
    years_experience_estimate: number | null;
    skills: unknown;
    technologies: unknown;
    work_experience: unknown;
    projects: unknown;
    education: unknown;
    certifications: unknown;
    strengths: unknown;
    analysis_version: string;
  };
}

function toResponse(
  resumeId: string,
  analysisVersion: string,
  analysis: {
    professional_summary: string | null;
    current_or_latest_role: string | null;
    seniority_level: string;
    years_experience_estimate: number | null;
    skills: unknown;
    technologies: unknown;
    work_experience: unknown;
    projects: unknown;
    education: unknown;
    certifications: unknown;
    strengths: unknown;
  },
): ProcessResumeResponse {
  const output: ProcessResumeResponse = {
    resumeId,
    analysisVersion,
    analysis: {
      professionalSummary: analysis.professional_summary ?? "",
      currentOrLatestRole: analysis.current_or_latest_role,
      seniorityLevel: analysis.seniority_level,
      yearsExperienceEstimate:
        typeof analysis.years_experience_estimate === "number"
          ? analysis.years_experience_estimate
          : null,
      skills: toSkillList(analysis.skills),
      technologies: toSkillNames(analysis.technologies),
      workExperience: toWorkExperienceList(analysis.work_experience),
      projects: toProjectList(analysis.projects),
      education: toEducationList(analysis.education),
      certifications: toCertificationList(analysis.certifications),
      strengths: toStringList(analysis.strengths),
    },
  };
  return output;
}

function toSkillList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is { name?: unknown; category?: unknown; evidence?: unknown } =>
        !!entry && typeof entry === "object",
    )
    .flatMap((entry) => {
      const name = typeof entry.name === "string" ? entry.name : "";
      const category = typeof entry.category === "string" ? entry.category : "";
      const evidence = typeof entry.evidence === "string" ? entry.evidence : "";
      if (!name || !category) return [];
      return [{ name, category, evidence }];
    });
}

function toSkillNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function toWorkExperienceList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .flatMap((entry) => {
      const role = typeof entry.role === "string" ? entry.role : null;
      const company = typeof entry.company === "string" ? entry.company : null;
      const startDate = typeof entry.startDate === "string" ? entry.startDate : null;
      const endDate = typeof entry.endDate === "string" ? entry.endDate : null;
      const summary = typeof entry.summary === "string" ? entry.summary : null;
      const responsibilities = Array.isArray(entry.responsibilities)
        ? entry.responsibilities.filter(
            (item): item is string => typeof item === "string",
          )
        : [];
      if (!role && !company) return [];
      return [{
        role,
        company,
        startDate,
        endDate,
        summary,
        responsibilities,
      }];
    });
}

function toProjectList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .flatMap((entry) => {
      const name = typeof entry.name === "string" ? entry.name : "";
      const description = typeof entry.description === "string" ? entry.description : null;
      const technologies = Array.isArray(entry.technologies)
        ? entry.technologies.filter((item): item is string => typeof item === "string")
        : [];
      if (!name) return [];
      return [{ name, description, technologies }];
    });
}

function toEducationList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .flatMap((entry) => {
      const degree = typeof entry.degree === "string" ? entry.degree : null;
      const institution = typeof entry.institution === "string" ? entry.institution : null;
      const year = typeof entry.year === "string" ? entry.year : null;
      if (!degree && !institution) return [];
      return [{ degree, institution, year }];
    });
}

function toCertificationList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .flatMap((entry) => {
      const name = typeof entry.name === "string" ? entry.name : "";
      const issuer = typeof entry.issuer === "string" ? entry.issuer : null;
      const year = typeof entry.year === "string" ? entry.year : null;
      if (!name) return [];
      return [{ name, issuer, year }];
    });
}

function toStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function handleClaimError(error: { message: string }) {
  if (error.message.includes("RESUME_NOT_FOUND")) {
    return errorResponse(404, "resume_not_found", "Resume not found.");
  }
  if (error.message.includes("RESUME_ALREADY_PROCESSING")) {
    return errorResponse(
      409,
      "already_processing",
      "This resume is already being analyzed.",
    );
  }
  if (error.message.includes("RESUME_DAILY_LIMIT")) {
    return errorResponse(
      429,
      "daily_limit_reached",
      "You've reached today's resume analysis limit. Please try again later.",
    );
  }
  if (error.message.includes("RESUME_INVALID_CLAIM")) {
    return errorResponse(
      400,
      "invalid_request",
      "The analysis request is invalid.",
      false,
    );
  }
  return errorResponse(
    500,
    "claim_failed",
    "We couldn't start the resume analysis.",
  );
}

function normalizeFunctionError(error: unknown) {
  if (error instanceof FunctionError) return error;
  if (error instanceof FeatureAccessError) {
    return new FunctionError(
      error.status,
      error.code,
      error.message,
      error.retryable,
    );
  }
  if (error instanceof EvaluationFunctionError) {
    return new FunctionError(
      error.status,
      error.code,
      error.message,
      error.retryable,
    );
  }
  return new FunctionError(
    500,
    "analysis_failed",
    "We couldn't analyze this resume. Please retry.",
  );
}

function handledErrorResponse(error: unknown) {
  const handled = normalizeFunctionError(error);
  return errorResponse(
    handled.status,
    handled.code,
    handled.message,
    handled.retryable,
  );
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryable = true,
) {
  return Response.json({ code, message, retryable }, { status });
}
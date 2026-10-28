import { accountAccessResponse } from "../_shared/accountPrivacy.ts";
import { usageContext, aiClaimError } from "../_shared/aiProvider.ts";
import type { SupabaseContext } from "npm:@supabase/server@1.4.1";
import { withSupabase } from "npm:@supabase/server@1.4.1";

import {
  EvaluationFunctionError,
  requestStructuredEvaluation,
  withGroqRetry,
} from "../_shared/groq.ts";
import type { Database, JobAnalysisRow } from "../_shared/database.types.ts";
import {
  getJobAnalysisConfig,
  IMPORTANCE_LEVELS,
  type JobAnalysisConfig,
  type JobImportance,
} from "../_shared/jobAnalysisConfig.ts";
import {
  JOB_ANALYSIS_JSON_SCHEMA,
  type JobAnalysisOutput,
  JobAnalysisValidationError,
  validateJobAnalysisValue,
} from "../_shared/jobAnalysisSchemas.ts";
import {
  buildJobAnalysisInput,
  JOB_ANALYSIS_INSTRUCTIONS,
} from "../_shared/jobAnalysisPrompts.ts";
import {
  enforceFeatureAccess,
  FeatureAccessError,
  FEATURE_KEYS,
} from "../_shared/featureAccess.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_COMPLETION_TOKENS = 2400;

type AnalyzeJobResponse = {
  jobDescriptionId: string;
  analysis: JobAnalysisOutput;
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
          "Use POST for job analysis.",
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


      let jobDescriptionId: string;
      try {
        const body = (await request.json()) as { jobDescriptionId?: unknown };
        if (
          typeof body.jobDescriptionId !== "string" ||
          !UUID_PATTERN.test(body.jobDescriptionId)
        ) {
          throw new FunctionError(
            400,
            "invalid_job_description_id",
            "A valid job description ID is required.",
          );
        }
        jobDescriptionId = body.jobDescriptionId;
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

      const { data: visibleJob, error: jobError } = await context.supabase
        .from("job_descriptions")
        .select("id,user_id,raw_text")
        .eq("id", jobDescriptionId)
        .maybeSingle();

      if (jobError) {
        return errorResponse(
          500,
          "job_lookup_failed",
          "We couldn't load this job description.",
        );
      }
      if (!visibleJob || visibleJob.user_id !== userId) {
        return errorResponse(
          404,
          "job_not_found",
          "Job description not found.",
        );
      }

      let configuration: JobAnalysisConfig;
      try {
        configuration = getJobAnalysisConfig();
      } catch (error) {
        return handledErrorResponse(error);
      }

      const attemptId = crypto.randomUUID();
      const { data: claimed, error: claimError } = await context.supabaseAdmin
        .rpc(
          "claim_job_analysis",
          {
            p_job_description_id: jobDescriptionId,
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
      if (claimed) {
        return Response.json(
          toResponse(
            jobDescriptionId,
            claimed,
            await getCompanyName(jobDescriptionId, context),
          ),
        );
      }

      try {
        await enforceFeatureAccess(
          context.supabaseAdmin,
          userId,
          FEATURE_KEYS.jobAnalysis,
          attemptId,
        );

        const { data: profile, error: profileError } = await context.supabase
          .from("profiles")
          .select("target_role")
          .eq("id", userId)
          .maybeSingle();
        if (profileError) {
          throw new FunctionError(
            500,
            "context_lookup_failed",
            "We couldn't load your interview context.",
          );
        }

        const { evaluation, validated } = await withGroqRetry(
          async (attempt) => {
            const evaluation = await requestStructuredEvaluation({
              usage: usageContext(context.supabaseAdmin, userId, attemptId, "job_generation_requests"),
              config: { ...configuration, reasoningEffort: "low" },
              schemaName: "job_analysis",
              schema: JOB_ANALYSIS_JSON_SCHEMA,
              instructions: JOB_ANALYSIS_INSTRUCTIONS,
              content: buildJobAnalysisInput({
                rawText: visibleJob.raw_text,
                candidateRole: profile?.target_role ?? null,
              }),
              userId,
              maxCompletionTokens: MAX_COMPLETION_TOKENS,
              seed: 41 + attempt,
            });
            try {
              return {
                evaluation,
                validated: validateJobAnalysisValue(evaluation.value),
              };
            } catch (error) {
              if (error instanceof JobAnalysisValidationError) {
                throw new EvaluationFunctionError(
                  502,
                  "GROQ_INVALID_RESPONSE",
                  "AI returned an invalid job analysis. Please retry.",
                );
              }
              throw error;
            }
          },
        );

        const { data: completed, error: updateError } = await context
          .supabaseAdmin.rpc(
            "complete_job_analysis",
            {
              p_job_description_id: jobDescriptionId,
              p_user_id: userId,
              p_attempt_id: attemptId,
              p_analysis_version: configuration.version,
              p_model: evaluation.model,
              p_detected_role: validated.detectedRole,
              p_company_name: validated.companyName,
              p_seniority_level: validated.seniorityLevel,
              p_summary: validated.summary,
              p_technical_skills: validated.technicalSkills,
              p_soft_skills: validated.softSkills,
              p_responsibilities: validated.responsibilities,
              p_required_experience: validated.requiredExperience,
              p_preferred_experience: validated.preferredExperience,
              p_interview_focus_areas: validated.interviewFocusAreas,
              p_keywords: validated.keywords,
            },
          );

        if (updateError) {
          throw new FunctionError(
            500,
            "analysis_save_failed",
            "The analysis was generated but could not be saved.",
          );
        }
        if (!completed) {
          throw new FunctionError(
            409,
            "attempt_superseded",
            "A newer analysis request replaced this attempt.",
          );
        }

        return Response.json(
          toResponse(
            jobDescriptionId,
            completed,
            await getCompanyName(jobDescriptionId, context),
          ),
        );
      } catch (error) {
        const handled = normalizeFunctionError(error);
        const { error: failureUpdateError } = await context.supabaseAdmin.rpc(
          "fail_job_analysis",
          {
            p_job_description_id: jobDescriptionId,
            p_user_id: userId,
            p_attempt_id: attemptId,
            p_error_code: handled.code,
            p_error_message: handled.message,
            p_analysis_version: configuration.version,
          },
        );
        if (failureUpdateError) {
          console.error("[analyze-job] Failed to persist failure state");
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

function handleClaimError(error: { message: string }) {
  if (error.message.includes("JOB_DESCRIPTION_NOT_FOUND")) {
    return errorResponse(404, "job_not_found", "Job description not found.");
  }
  if (error.message.includes("JOB_ANALYSIS_ALREADY_PROCESSING")) {
    return errorResponse(
      409,
      "already_processing",
      "This job is already being analyzed.",
    );
  }
  if (error.message.includes("JOB_ANALYSIS_ATTEMPT_LIMIT")) {
    return errorResponse(
      429,
      "attempt_limit_reached",
      "This job description reached its analysis retry limit. Create it again.",
      false,
    );
  }
  if (error.message.includes("JOB_ANALYSIS_DAILY_LIMIT")) {
    return errorResponse(
      429,
      "daily_limit_reached",
      "You've reached today's analysis limit. Please try again later.",
    );
  }
  if (error.message.includes("JOB_GENERATION_DAILY_LIMIT")) {
    return errorResponse(
      429,
      "daily_limit_reached",
      "You've reached today's AI practice limit. Please try again later.",
    );
  }
  return errorResponse(500, "claim_failed", "We couldn't start the analysis.");
}

async function getCompanyName(
  jobDescriptionId: string,
  context: SupabaseContext<Database>,
) {
  const { data } = await context.supabase
    .from("job_descriptions")
    .select("company_name")
    .eq("id", jobDescriptionId)
    .maybeSingle();
  return data?.company_name ?? null;
}

function toResponse(
  jobDescriptionId: string,
  analysis: JobAnalysisRow,
  companyName: string | null,
) {
  const output: AnalyzeJobResponse = {
    jobDescriptionId,
    analysis: {
      detectedRole: analysis.detected_role,
      companyName,
      seniorityLevel: analysis
        .seniority_level as JobAnalysisOutput["seniorityLevel"],
      summary: analysis.summary ?? "",
      technicalSkills: toSkills(analysis.technical_skills),
      softSkills: toSkills(analysis.soft_skills),
      responsibilities: toStrings(analysis.responsibilities),
      requiredExperience: toStrings(analysis.required_experience),
      preferredExperience: toStrings(analysis.preferred_experience),
      interviewFocusAreas: toStrings(analysis.interview_focus_areas),
      keywords: toStrings(analysis.keywords),
    },
  };
  return output;
}

function toSkills(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is { name?: unknown; importance?: unknown } =>
        !!entry && typeof entry === "object",
    )
    .flatMap((entry) => {
      if (typeof entry.name !== "string" || !entry.name) return [];
      const importance = typeof entry.importance === "string" &&
          IMPORTANCE_LEVELS.includes(entry.importance as JobImportance)
        ? (entry.importance as JobImportance)
        : "medium";
      return [{ name: entry.name, importance }];
    });
}

function toStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
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
    "We couldn't analyze this job description. Please retry.",
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

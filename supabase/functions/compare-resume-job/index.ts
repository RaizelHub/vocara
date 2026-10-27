import type { SupabaseContext } from "npm:@supabase/server@1.4.1";
import { withSupabase } from "npm:@supabase/server@1.4.1";

import {
  EvaluationFunctionError,
  requestStructuredEvaluation,
  withGroqRetry,
} from "../_shared/groq.ts";
import type { Database } from "../_shared/database.types.ts";
import {
  getResumeConfig,
  MATCH_STATUSES,
  MAX_COMPLETION_TOKENS_MATCH,
  type MatchStatus,
  type ResumeConfig,
  type ResumeSeniority,
} from "../_shared/resumeConfig.ts";
import {
  RESUME_MATCH_JSON_SCHEMA,
  ResumeValidationError,
  type ResumeMatchOutput,
} from "../_shared/resumeSchemas.ts";
import { validateResumeMatch } from "../_shared/resumeValidation.ts";
import {
  buildResumeMatchInput,
  RESUME_MATCH_INSTRUCTIONS,
} from "../_shared/resumePrompts.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CompareResumeJobResponse = {
  resumeId: string;
  jobDescriptionId: string;
  matchId: string | null;
  match: ResumeMatchOutput;
};

type ResumeAnalysisSummary = {
  current_or_latest_role: string | null;
  seniority_level: string;
  skills: unknown;
  technologies: unknown;
  work_experience: unknown;
  projects: unknown;
  strengths: unknown;
};

type JobAnalysisSummary = {
  detected_role: string | null;
  summary: string | null;
  technical_skills: unknown;
  responsibilities: unknown;
  required_experience: unknown;
  preferred_experience: unknown;
  interview_focus_areas: unknown;
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
          "Use POST for resume-job comparison.",
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

      let input: { resumeId: string; jobDescriptionId: string };
      try {
        const body = (await request.json()) as Record<string, unknown>;
        input = parseRequest(body);
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

      const [resumeResult, jobResult] = await Promise.all([
        context.supabase
          .from("resumes")
          .select("id,user_id,processing_status,analysis_version")
          .eq("id", input.resumeId)
          .maybeSingle(),
        context.supabase
          .from("job_descriptions")
          .select("id,user_id,analysis_status")
          .eq("id", input.jobDescriptionId)
          .maybeSingle(),
      ]);

      if (resumeResult.error || jobResult.error) {
        return errorResponse(
          500,
          "lookup_failed",
          "We couldn't load these documents.",
        );
      }
      const resume = resumeResult.data;
      if (!resume || resume.user_id !== userId) {
        return errorResponse(404, "resume_not_found", "Resume not found.");
      }
      const job = jobResult.data;
      if (!job || job.user_id !== userId) {
        return errorResponse(404, "job_not_found", "Job description not found.");
      }

      let configuration: ResumeConfig;
      try {
        configuration = getResumeConfig();
      } catch (error) {
        return handledErrorResponse(error);
      }

      const contextLookup = async () => {
        const [resumeAnalysisResult, jobAnalysisResult] = await Promise.all([
          context.supabase
            .from("resume_analyses")
            .select(
              "current_or_latest_role,seniority_level,skills,technologies,work_experience,projects,strengths,analysis_version",
            )
            .eq("resume_id", input.resumeId)
            .eq("analysis_version", configuration.version)
            .maybeSingle(),
          context.supabase
            .from("job_analyses")
            .select(
              "detected_role,summary,technical_skills,responsibilities,required_experience,preferred_experience,interview_focus_areas,analysis_version",
            )
            .eq("job_description_id", input.jobDescriptionId)
            .eq("analysis_version", configuration.version)
            .maybeSingle(),
        ]);
        if (resumeAnalysisResult.error || jobAnalysisResult.error) {
          throw new FunctionError(
            500,
            "context_lookup_failed",
            "We couldn't load the analyses for comparison.",
          );
        }
        const resumeAnalysis = resumeAnalysisResult.data as
          | (ResumeAnalysisSummary & { analysis_version: string })
          | null;
        const jobAnalysis = jobAnalysisResult.data as
          | (JobAnalysisSummary & { analysis_version: string })
          | null;
        if (
          resume.processing_status !== "completed" ||
          !resumeAnalysis ||
          resumeAnalysis.analysis_version !== configuration.version
        ) {
          throw new FunctionError(
            422,
            "resume_analysis_required",
            "Analyze your resume before comparing it to a job.",
            false,
          );
        }
        if (
          job.analysis_status !== "completed" ||
          !jobAnalysis ||
          jobAnalysis.analysis_version !== configuration.version
        ) {
          throw new FunctionError(
            422,
            "job_analysis_required",
            "Analyze this job description before comparing it to your resume.",
            false,
          );
        }
        return { resumeAnalysis, jobAnalysis };
      };

      const attemptId = crypto.randomUUID();
      const { data: claimed, error: claimError } = await context.supabaseAdmin
        .rpc(
          "claim_resume_job_match",
          {
            p_resume_id: input.resumeId,
            p_job_description_id: input.jobDescriptionId,
            p_user_id: userId,
            p_analysis_version: configuration.version,
            p_model: configuration.model,
          },
        );

      if (claimError) {
        return handleClaimError(claimError);
      }
      if (claimed && typeof claimed === "object") {
        const matchId = (claimed as { matchId?: unknown }).matchId;
        if (typeof matchId === "string" && UUID_PATTERN.test(matchId)) {
          const existing = await loadMatchRow(
            matchId,
            configuration.version,
            context,
          );
          if (existing) {
            return Response.json(
              toResponse(input.resumeId, input.jobDescriptionId, matchId, existing),
            );
          }
        }
        return errorResponse(
          409,
          "match_result_missing",
          "The finished comparison is no longer available. Try again.",
          false,
        );
      }

      try {
        const { resumeAnalysis, jobAnalysis } = await contextLookup();

        const { evaluation, validated } = await withGroqRetry(
          async (attempt) => {
            const evaluation = await requestStructuredEvaluation({
              config: { ...configuration, reasoningEffort: "low" },
              schemaName: "resume_job_match",
              schema: RESUME_MATCH_JSON_SCHEMA,
              instructions: RESUME_MATCH_INSTRUCTIONS,
              content: buildResumeMatchInput({
                resumeAnalysis: {
                  currentOrLatestRole: resumeAnalysis.current_or_latest_role,
                  seniorityLevel: resumeAnalysis.seniority_level as ResumeSeniority,
                  skills: asResumeSkillList(resumeAnalysis.skills),
                  technologies: asSkillNames(resumeAnalysis.technologies),
                  workExperience: asWorkExperienceList(resumeAnalysis.work_experience),
                  projects: asProjectList(resumeAnalysis.projects),
                  strengths: asSkillNames(resumeAnalysis.strengths),
                },
                jobAnalysis: {
                  detectedRole: jobAnalysis.detected_role,
                  summary: jobAnalysis.summary ?? "",
                  technicalSkills: asSkillList(jobAnalysis.technical_skills),
                  responsibilities: asSkillNames(jobAnalysis.responsibilities),
                  requiredExperience: asSkillNames(jobAnalysis.required_experience),
                  preferredExperience: asSkillNames(jobAnalysis.preferred_experience),
                  interviewFocusAreas: asSkillNames(jobAnalysis.interview_focus_areas),
                },
              }),
              userId,
              maxCompletionTokens: MAX_COMPLETION_TOKENS_MATCH,
              seed: 41 + attempt,
            });
            try {
              return {
                evaluation,
                validated: validateResumeMatch(evaluation.value),
              };
            } catch (error) {
              if (error instanceof ResumeValidationError) {
                throw new EvaluationFunctionError(
                  502,
                  "GROQ_INVALID_RESPONSE",
                  "AI returned an invalid comparison. Please retry.",
                );
              }
              throw error;
            }
          },
        );

        const scores = computeScores(validated, {
          technicalSkills: asSkillList(jobAnalysis.technical_skills),
          requiredExperience: asSkillNames(jobAnalysis.required_experience),
        }, {
          skillNames: [
            ...asSkillList(resumeAnalysis.skills).map((s) => s.name),
            ...asSkillNames(resumeAnalysis.technologies),
          ],
        });

        const { data: matchId, error: completeError } = await context
          .supabaseAdmin.rpc(
            "complete_resume_job_match",
            {
              p_resume_id: input.resumeId,
              p_job_description_id: input.jobDescriptionId,
              p_user_id: userId,
              p_analysis_version: configuration.version,
              p_model: evaluation.model,
              p_overall_match_score: scores.overallMatchScore,
              p_skill_match_score: scores.skillMatchScore,
              p_experience_alignment_score: scores.experienceAlignmentScore,
              p_matching_skills: validated.matchingSkills,
              p_missing_requirements: validated.missingRequirements,
              p_transferable_strengths: validated.transferableStrengths,
              p_experience_alignment: validated.experienceAlignment,
              p_interview_risks: validated.interviewRisks,
              p_recommended_focus_areas: validated.recommendedFocusAreas,
              p_summary: validated.summary,
            },
          );

        if (completeError) {
          if (completeError.message.includes("RESUME_JOB_INVALID_RESULT")) {
            throw new FunctionError(
              502,
              "invalid_generated_content",
              "The generated comparison could not be validated. Please try again.",
            );
          }
          throw new FunctionError(
            500,
            "match_save_failed",
            "The comparison was generated but could not be saved.",
          );
        }

        return Response.json(
          toResponse(input.resumeId, input.jobDescriptionId, matchId, {
            ...validated,
            overall_match_score: scores.overallMatchScore,
          }),
        );
      } catch (error) {
        const handled = normalizeFunctionError(error);
        const { error: failureError } = await context.supabaseAdmin.rpc(
          "fail_resume_job_match",
          {
            p_resume_id: input.resumeId,
            p_job_description_id: input.jobDescriptionId,
            p_user_id: userId,
            p_error_code: handled.code,
            p_error_message: handled.message,
          },
        );
        if (failureError) {
          console.error("[compare-resume-job] Failed to persist failure state", {
            resumeId: input.resumeId,
            jobDescriptionId: input.jobDescriptionId,
            code: failureError.code,
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

function parseRequest(body: Record<string, unknown>) {
  const resumeId = body.resumeId;
  if (typeof resumeId !== "string" || !UUID_PATTERN.test(resumeId)) {
    throw new FunctionError(
      400,
      "invalid_resume_id",
      "A valid resume ID is required.",
    );
  }
  const jobDescriptionId = body.jobDescriptionId;
  if (
    typeof jobDescriptionId !== "string" ||
    !UUID_PATTERN.test(jobDescriptionId)
  ) {
    throw new FunctionError(
      400,
      "invalid_job_description_id",
      "A valid job description ID is required.",
    );
  }
  return { resumeId, jobDescriptionId };
}

function computeScores(
  validated: ResumeMatchOutput,
  job: { technicalSkills: { name: string; importance: string }[]; requiredExperience: string[] },
  resume: { skillNames: string[] },
) {
  const jobSkillNames = job.technicalSkills.map((skill) => skill.name).filter(Boolean);
  const skillMatchScore = jobSkillNames.length === 0
    ? null
    : Math.round(
        (jobSkillNames.filter((name) => skillPresent(name, resume.skillNames)).length /
          jobSkillNames.length) *
          100,
      );

  const required = job.requiredExperience.filter(Boolean);
  const experienceAlignmentScore = required.length === 0
    ? null
    : Math.round(
        (required.filter(
          (requirement) =>
            validated.experienceAlignment.some(
              (entry) =>
                normalizeText(entry.requirement) === normalizeText(requirement) &&
                (entry.match === "strong_match" || entry.match === "transferable"),
            ),
        ).length /
          required.length) *
          100,
      );

  const available = [skillMatchScore, experienceAlignmentScore].filter(
    (value): value is number => value !== null,
  );
  const overallMatchScore = available.length === 2
    ? Math.round((available[0] + available[1]) / 2)
    : available.length === 1
      ? available[0]
      : Math.min(100, Math.max(0, Math.round(validated.overallMatchScore)));

  return { overallMatchScore, skillMatchScore, experienceAlignmentScore };
}

function skillPresent(jobSkill: string, resumeNames: string[]) {
  const needle = normalizeText(jobSkill);
  if (!needle) return false;
  return resumeNames.some((candidate) => {
    const value = normalizeText(candidate);
    if (!value) return false;
    return value.includes(needle) || needle.includes(value);
  });
}

function normalizeText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

async function loadMatchRow(
  matchId: string,
  version: string,
  context: SupabaseContext<Database>,
) {
  const { data } = await context.supabase
    .from("resume_job_matches")
    .select(
      "overall_match_score,skill_match_score,experience_alignment_score,matching_skills,missing_requirements,transferable_strengths,experience_alignment,interview_risks,recommended_focus_areas,summary,analysis_version",
    )
    .eq("id", matchId)
    .eq("analysis_version", version)
    .maybeSingle();
  if (!data || data.analysis_version !== version) return null;
  return data;
}

function toResponse(
  resumeId: string,
  jobDescriptionId: string,
  matchId: string | null,
  match: Record<string, unknown> & { overall_match_score: number },
): CompareResumeJobResponse {
  const output: CompareResumeJobResponse = {
    resumeId,
    jobDescriptionId,
    matchId,
    match: {
      overallMatchScore: match.overall_match_score,
      skillMatchScore: integerOrNull(match.skill_match_score),
      experienceAlignmentScore: integerOrNull(match.experience_alignment_score),
      matchingSkills: asMatchList(match.matching_skills),
      missingRequirements: asRequirementList(match.missing_requirements),
      transferableStrengths: asStrengthList(match.transferable_strengths),
      experienceAlignment: asAlignmentList(match.experience_alignment),
      interviewRisks: asRiskList(match.interview_risks),
      recommendedFocusAreas: asStringList(match.recommended_focus_areas),
      summary: typeof match.summary === "string" ? match.summary : "",
    },
  };
  return output;
}

function integerOrNull(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function asSkillList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is { name?: unknown; importance?: unknown } =>
        !!entry && typeof entry === "object",
    )
    .flatMap((entry) => {
      const name = typeof entry.name === "string" ? entry.name : "";
      const importance = typeof entry.importance === "string" ? entry.importance : "";
      if (!name) return [];
      return [{ name, importance }];
    });
}

function asResumeSkillList(value: unknown) {
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
      if (!name) return [];
      return [{ name, category, evidence }];
    });
}

function asSkillNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function asWorkExperienceList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .flatMap((entry) => {
      const role = typeof entry.role === "string" ? entry.role : null;
      const company = typeof entry.company === "string" ? entry.company : null;
      const responsibilities = Array.isArray(entry.responsibilities)
        ? entry.responsibilities.filter(
            (item): item is string => typeof item === "string",
          )
        : [];
      if (!role && !company) return [];
      return [{ role, company, responsibilities }];
    });
}

function asProjectList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .flatMap((entry) => {
      const name = typeof entry.name === "string" ? entry.name : "";
      const technologies = Array.isArray(entry.technologies)
        ? entry.technologies.filter((item): item is string => typeof item === "string")
        : [];
      if (!name) return [];
      return [{ name, technologies }];
    });
}

function asMatchList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is { name?: unknown; evidence?: unknown } =>
        !!entry && typeof entry === "object",
    )
    .flatMap((entry) => {
      const name = typeof entry.name === "string" ? entry.name : "";
      const evidence = typeof entry.evidence === "string" ? entry.evidence : "";
      if (!name) return [];
      return [{ name, evidence }];
    });
}

function asRequirementList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is { requirement?: unknown; status?: unknown; evidence?: unknown } =>
        !!entry && typeof entry === "object",
    )
    .flatMap((entry) => {
      const requirement = typeof entry.requirement === "string" ? entry.requirement : "";
      const status = typeof entry.status === "string" &&
          (MATCH_STATUSES as readonly string[]).includes(entry.status)
        ? (entry.status as MatchStatus)
        : "not_found";
      const evidence = typeof entry.evidence === "string" ? entry.evidence : null;
      if (!requirement) return [];
      return [{ requirement, status, evidence }];
    });
}

function asStrengthList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is { strength?: unknown; evidence?: unknown } =>
        !!entry && typeof entry === "object",
    )
    .flatMap((entry) => {
      const strength = typeof entry.strength === "string" ? entry.strength : "";
      const evidence = typeof entry.evidence === "string" ? entry.evidence : null;
      if (!strength) return [];
      return [{ strength, evidence }];
    });
}

function asAlignmentList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is { requirement?: unknown; match?: unknown; evidence?: unknown } =>
        !!entry && typeof entry === "object",
    )
    .flatMap((entry) => {
      const requirement = typeof entry.requirement === "string" ? entry.requirement : "";
      const match = typeof entry.match === "string" &&
          (MATCH_STATUSES as readonly string[]).includes(entry.match)
        ? (entry.match as MatchStatus)
        : "not_found";
      const evidence = typeof entry.evidence === "string" ? entry.evidence : null;
      if (!requirement) return [];
      return [{ requirement, match, evidence }];
    });
}

function asRiskList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is { risk?: unknown; preparation?: unknown } =>
        !!entry && typeof entry === "object",
    )
    .flatMap((entry) => {
      const risk = typeof entry.risk === "string" ? entry.risk : "";
      const preparation = typeof entry.preparation === "string" ? entry.preparation : "";
      if (!risk) return [];
      return [{ risk, preparation }];
    });
}

function asStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function handleClaimError(error: { message: string }) {
  if (error.message.includes("RESUME_NOT_FOUND")) {
    return errorResponse(404, "resume_not_found", "Resume not found.");
  }
  if (error.message.includes("JOB_NOT_FOUND")) {
    return errorResponse(404, "job_not_found", "Job description not found.");
  }
  if (error.message.includes("RESUME_ANALYSIS_REQUIRED")) {
    return errorResponse(
      422,
      "resume_analysis_required",
      "Analyze your resume before comparing it to a job.",
      false,
    );
  }
  if (error.message.includes("JOB_ANALYSIS_REQUIRED")) {
    return errorResponse(
      422,
      "job_analysis_required",
      "Analyze this job description before comparing it to your resume.",
      false,
    );
  }
  if (error.message.includes("RESUME_ANALYSIS_VERSION_MISMATCH")) {
    return errorResponse(
      422,
      "resume_analysis_required",
      "Analyze your resume again before comparing.",
      false,
    );
  }
  if (error.message.includes("JOB_ANALYSIS_VERSION_MISMATCH")) {
    return errorResponse(
      422,
      "job_analysis_required",
      "Analyze this job description again before comparing.",
      false,
    );
  }
  if (error.message.includes("RESUME_JOB_DAILY_LIMIT")) {
    return errorResponse(
      429,
      "daily_limit_reached",
      "You've reached today's comparison limit. Please try again later.",
    );
  }
  if (error.message.includes("RESUME_JOB_INVALID_CLAIM")) {
    return errorResponse(
      400,
      "invalid_request",
      "The comparison request is invalid.",
      false,
    );
  }
  return errorResponse(
    500,
    "claim_failed",
    "We couldn't start the comparison.",
  );
}

function normalizeFunctionError(error: unknown) {
  if (error instanceof FunctionError) return error;
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
    "comparison_failed",
    "We couldn't compare these documents. Please retry.",
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
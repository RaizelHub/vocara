import { accountAccessResponse } from "../_shared/accountPrivacy.ts";
import { usageContext, aiClaimError } from "../_shared/aiProvider.ts";
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
  MAX_COMPLETION_TOKENS_QUESTION,
  type ResumeConfig,
  type ResumeSeniority,
} from "../_shared/resumeConfig.ts";
import {
  DIFFICULTY_MODES,
  type DifficultyMode,
  INTERVIEWER_STYLES,
  JOB_QUESTION_TYPES,
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  QUESTION_DIFFICULTIES,
  type QuestionDifficulty,
  seniorityToDifficulty,
  adjustDifficulty,
} from "../_shared/jobAnalysisConfig.ts";
import {
  JobAnalysisValidationError,
  jobInterviewJsonSchema,
  validateJobInterviewValue,
} from "../_shared/jobAnalysisSchemas.ts";
import { buildPersonalizedInterviewInput, PERSONALIZED_QUESTION_INSTRUCTIONS } from "../_shared/resumePrompts.ts";
import {
  enforceFeatureAccess,
  FeatureAccessError,
  FEATURE_KEYS,
} from "../_shared/featureAccess.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_COMPLETION_TOKENS = 3200;

type GeneratePersonalizedInterviewResponse = {
  session: {
    id: string;
    role: string;
    interviewType: string;
    difficulty: string;
    interviewerStyle: string;
    totalQuestions: number;
    status: string;
    jobDescriptionId: string;
  };
  questions: {
    id: string;
    questionNumber: number;
    questionText: string;
    questionType: string;
    focusArea: string;
    difficulty: string;
    reason: string;
    expectedTopics: string[];
  }[];
};

type ResumeAnalysisSummary = {
  current_or_latest_role: string | null;
  seniority_level: string;
  skills: unknown;
  technologies: unknown;
  work_experience: unknown;
  projects: unknown;
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

type MatchSummary = {
  interview_risks: unknown;
  recommended_focus_areas: unknown;
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
          "Use POST for personalized interview generation.",
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


      let input: {
        requestId: string;
        resumeId: string;
        jobDescriptionId: string;
        questionCount: number;
        difficultyMode: DifficultyMode;
        interviewerStyle: string;
      };
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
          .select("id,user_id,company_name,analysis_status")
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
        const [resumeAnalysisResult, jobAnalysisResult, matchResult] =
          await Promise.all([
            context.supabase
              .from("resume_analyses")
              .select(
                "current_or_latest_role,seniority_level,skills,technologies,work_experience,projects,analysis_version",
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
            context.supabase
              .from("resume_job_matches")
              .select(
                "interview_risks,recommended_focus_areas",
              )
              .eq("resume_id", input.resumeId)
              .eq("job_description_id", input.jobDescriptionId)
              .is("deleted_at", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);
        if (
          resumeAnalysisResult.error ||
          jobAnalysisResult.error ||
          matchResult.error
        ) {
          throw new FunctionError(
            500,
            "context_lookup_failed",
            "We couldn't load the interview context.",
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
            "Analyze your resume before generating a personalized interview.",
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
            "Analyze this job description before generating a personalized interview.",
            false,
          );
        }
        return {
          resumeAnalysis,
          jobAnalysis,
          match: (matchResult.data as MatchSummary | null) ?? null,
        };
      };

      const attemptId = input.requestId;
      const { data: existing, error: claimError } = await context.supabaseAdmin
        .rpc(
          "claim_job_interview_generation",
          {
            p_job_description_id: input.jobDescriptionId,
            p_user_id: userId,
            p_attempt_id: attemptId,
            p_analysis_version: configuration.version,
            p_model: configuration.model,
          },
        );

      if (claimError) {
        const capacity = aiClaimError(claimError);
        if (capacity) return capacity;
        return handleGenerationClaimError(claimError);
      }
      if (existing) {
        try {
          return Response.json(parseCreated(existing));
        } catch (error) {
          return handledErrorResponse(error);
        }
      }

      try {
        await enforceFeatureAccess(
          context.supabaseAdmin,
          userId,
          FEATURE_KEYS.personalizedInterview,
          attemptId,
        );

        const { resumeAnalysis, jobAnalysis, match } = await contextLookup();
        const difficulty = supportedDifficulty(
          input.difficultyMode,
          seniorityToDifficulty(resumeAnalysis.seniority_level),
        );

        const { evaluation, validated } = await withGroqRetry(
          async (attempt) => {
            const evaluation = await requestStructuredEvaluation({
              usage: usageContext(context.supabaseAdmin, userId, attemptId, "job_generation_requests"),
              config: { ...configuration, reasoningEffort: "low" },
              schemaName: "personalized_interview",
              schema: jobInterviewJsonSchema(input.questionCount),
              instructions: PERSONALIZED_QUESTION_INSTRUCTIONS,
              content: buildPersonalizedInterviewInput({
                resumeAnalysis: {
                  currentOrLatestRole: resumeAnalysis.current_or_latest_role,
                  seniorityLevel: resumeAnalysis.seniority_level as ResumeSeniority,
                  skills: asResumeSkillList(resumeAnalysis.skills),
                  technologies: asStringList(resumeAnalysis.technologies),
                  workExperience: asWorkExperienceList(resumeAnalysis.work_experience),
                  projects: asProjectList(resumeAnalysis.projects),
                },
                jobAnalysis: {
                  detectedRole: jobAnalysis.detected_role,
                  summary: jobAnalysis.summary ?? "",
                  technicalSkills: asSkillList(jobAnalysis.technical_skills),
                  responsibilities: asStringList(jobAnalysis.responsibilities),
                  requiredExperience: asStringList(jobAnalysis.required_experience),
                  preferredExperience: asStringList(jobAnalysis.preferred_experience),
                  interviewFocusAreas: asStringList(jobAnalysis.interview_focus_areas),
                },
                resumeJobMatch: {
                  interviewRisks: asRiskList(match?.interview_risks),
                  recommendedFocusAreas: asStringList(match?.recommended_focus_areas),
                },
                questionCount: input.questionCount,
                difficultyMode: input.difficultyMode,
                difficulty,
                interviewerStyle: input.interviewerStyle,
              }),
              userId,
              maxCompletionTokens: MAX_COMPLETION_TOKENS,
              seed: 41 + attempt,
            });
            try {
              return {
                evaluation,
                validated: validateJobInterviewValue(
                  evaluation.value,
                  input.questionCount,
                ),
              };
            } catch (error) {
              if (error instanceof JobAnalysisValidationError) {
                throw new EvaluationFunctionError(
                  502,
                  "GROQ_INVALID_RESPONSE",
                  "AI returned an invalid interview. Please retry.",
                );
              }
              throw error;
            }
          },
        );

        const { data: created, error: createError } = await context
          .supabaseAdmin.rpc(
            "create_job_interview_session",
            {
              p_job_description_id: input.jobDescriptionId,
              p_user_id: userId,
              p_attempt_id: attemptId,
              p_analysis_version: configuration.version,
              p_model: evaluation.model,
              p_question_count: input.questionCount,
              p_difficulty_mode: input.difficultyMode,
              p_interviewer_style: input.interviewerStyle,
              p_session_difficulty: difficulty,
              p_questions: validated.questions,
            },
          );

        if (createError) {
          throw createFunctionError(createError);
        }

        return Response.json(parseCreated(created));
      } catch (error) {
        const handled = normalizeFunctionError(error);
        const { error: failureError } = await context.supabaseAdmin.rpc(
          "fail_job_interview_generation",
          {
            p_job_description_id: input.jobDescriptionId,
            p_user_id: userId,
            p_attempt_id: attemptId,
            p_error_code: handled.code,
          },
        );
        if (failureError) {
          console.error("[generate-personalized-interview] Failed to persist failure state");
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
  const requestId = body.requestId;
  if (typeof requestId !== "string" || !UUID_PATTERN.test(requestId)) {
    throw new FunctionError(
      400,
      "invalid_request_id",
      "A valid request ID is required.",
    );
  }
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
    typeof jobDescriptionId !== "string" || !UUID_PATTERN.test(jobDescriptionId)
  ) {
    throw new FunctionError(
      400,
      "invalid_job_description_id",
      "A valid job description ID is required.",
    );
  }
  const questionCount = body.questionCount;
  if (
    !Number.isInteger(questionCount) ||
    (questionCount as number) < MIN_QUESTION_COUNT ||
    (questionCount as number) > MAX_QUESTION_COUNT
  ) {
    throw new FunctionError(
      400,
      "invalid_question_count",
      "Question count must be between 5 and 12.",
    );
  }
  const difficultyMode = body.difficultyMode;
  if (
    typeof difficultyMode !== "string" ||
    !DIFFICULTY_MODES.includes(difficultyMode as DifficultyMode)
  ) {
    throw new FunctionError(
      400,
      "invalid_difficulty_mode",
      "Invalid difficulty mode.",
    );
  }
  const interviewerStyle = body.interviewerStyle;
  if (
    typeof interviewerStyle !== "string" ||
    !(INTERVIEWER_STYLES as readonly string[]).includes(interviewerStyle)
  ) {
    throw new FunctionError(
      400,
      "invalid_interviewer_style",
      "Invalid interviewer style.",
    );
  }
  return {
    requestId,
    resumeId,
    jobDescriptionId,
    questionCount: questionCount as number,
    difficultyMode: difficultyMode as DifficultyMode,
    interviewerStyle,
  };
}

function supportedDifficulty(mode: DifficultyMode, base: QuestionDifficulty) {
  return adjustDifficulty(base, mode);
}

function handleGenerationClaimError(error: { message: string }) {
  if (error.message.includes("JOB_DESCRIPTION_NOT_FOUND")) {
    return errorResponse(404, "job_not_found", "Job description not found.");
  }
  if (error.message.includes("JOB_ANALYSIS_REQUIRED")) {
    return errorResponse(
      422,
      "job_analysis_required",
      "Analyze this job description before generating a personalized interview.",
      false,
    );
  }
  if (error.message.includes("JOB_INTERVIEW_ALREADY_PROCESSING")) {
    return errorResponse(
      409,
      "already_processing",
      "This interview is already being generated. Try again in a moment.",
    );
  }
  if (error.message.includes("JOB_INTERVIEW_ATTEMPT_LIMIT")) {
    return errorResponse(
      429,
      "attempt_limit_reached",
      "This interview request reached its retry limit. Generate it again.",
      false,
    );
  }
  if (error.message.includes("JOB_INTERVIEW_DAILY_LIMIT")) {
    return errorResponse(
      429,
      "daily_limit_reached",
      "You've reached today's interview limit. Please try again later.",
    );
  }
  if (error.message.includes("JOB_INTERVIEW_RESULT_NOT_FOUND")) {
    return errorResponse(
      409,
      "generation_result_missing",
      "The generated interview is no longer available. Generate it again.",
      false,
    );
  }
  if (error.message.includes("JOB_INTERVIEW_INVALID_CLAIM")) {
    return errorResponse(
      400,
      "invalid_request",
      "The generation request is invalid.",
      false,
    );
  }
  return errorResponse(
    500,
    "claim_failed",
    "We couldn't start interview generation.",
  );
}

function createFunctionError(error: { message: string }) {
  if (error.message.includes("JOB_DESCRIPTION_NOT_FOUND")) {
    return new FunctionError(
      404,
      "job_not_found",
      "Job description not found.",
      false,
    );
  }
  if (error.message.includes("JOB_ANALYSIS_REQUIRED")) {
    return new FunctionError(
      422,
      "job_analysis_required",
      "Analyze this job description before generating a personalized interview.",
      false,
    );
  }
  if (error.message.includes("JOB_INTERVIEW_INVALID_INPUT")) {
    return new FunctionError(
      502,
      "invalid_generated_content",
      "The generated interview could not be validated. Please try again.",
    );
  }
  if (error.message.includes("JOB_INTERVIEW_CLAIM_REQUIRED")) {
    return new FunctionError(
      409,
      "generation_claim_expired",
      "This generation request expired. Please try again.",
    );
  }
  return new FunctionError(
    500,
    "session_create_failed",
    "We couldn't create the interview.",
  );
}

function parseCreated(created: unknown): GeneratePersonalizedInterviewResponse {
  if (!created || typeof created !== "object" || Array.isArray(created)) {
    throw invalidCreatedResponse();
  }
  const createdObject = created as Record<string, unknown>;
  if (
    !createdObject.session ||
    typeof createdObject.session !== "object" ||
    Array.isArray(createdObject.session) ||
    !Array.isArray(createdObject.questions)
  ) {
    throw invalidCreatedResponse();
  }
  const session = createdObject.session as Record<string, unknown>;
  const id = requireUuid(session.id);
  const role = requireText(session.role, 160);
  const interviewType = session.interviewType;
  const difficulty = session.difficulty;
  const interviewerStyle = session.interviewerStyle;
  const totalQuestions = session.totalQuestions;
  const status = session.status;
  const jobDescriptionId = requireUuid(session.jobDescriptionId);
  if (
    interviewType !== "job_specific" ||
    typeof difficulty !== "string" ||
    !QUESTION_DIFFICULTIES.includes(
      difficulty as (typeof QUESTION_DIFFICULTIES)[number],
    ) ||
    typeof interviewerStyle !== "string" ||
    !(INTERVIEWER_STYLES as readonly string[]).includes(interviewerStyle) ||
    !Number.isInteger(totalQuestions) ||
    (totalQuestions as number) < MIN_QUESTION_COUNT ||
    (totalQuestions as number) > MAX_QUESTION_COUNT ||
    (status !== "created" && status !== "in_progress") ||
    createdObject.questions.length !== totalQuestions
  ) {
    throw invalidCreatedResponse();
  }

  const seenIds = new Set<string>();
  const seenNumbers = new Set<number>();
  const questions = createdObject.questions.map((rawQuestion) => {
    if (
      !rawQuestion || typeof rawQuestion !== "object" ||
      Array.isArray(rawQuestion)
    ) {
      throw invalidCreatedResponse();
    }
    const question = rawQuestion as Record<string, unknown>;
    const questionId = requireUuid(question.id);
    const questionNumber = question.questionNumber;
    const questionText = requireText(question.questionText, 600);
    const questionType = question.questionType;
    const focusArea = requireText(question.focusArea, 120);
    const questionDifficulty = question.difficulty;
    const reason = requireText(question.reason, 400);
    const expectedTopics = question.expectedTopics;
    if (
      seenIds.has(questionId) ||
      !Number.isInteger(questionNumber) ||
      (questionNumber as number) < 1 ||
      (questionNumber as number) > (totalQuestions as number) ||
      seenNumbers.has(questionNumber as number) ||
      typeof questionType !== "string" ||
      !JOB_QUESTION_TYPES.includes(
        questionType as (typeof JOB_QUESTION_TYPES)[number],
      ) ||
      typeof questionDifficulty !== "string" ||
      !QUESTION_DIFFICULTIES.includes(
        questionDifficulty as (typeof QUESTION_DIFFICULTIES)[number],
      ) ||
      !Array.isArray(expectedTopics) ||
      expectedTopics.length < 1 ||
      expectedTopics.length > 5 ||
      expectedTopics.some(
        (topic) =>
          typeof topic !== "string" || !topic.trim() ||
          topic.trim().length > 40,
      )
    ) {
      throw invalidCreatedResponse();
    }
    seenIds.add(questionId);
    seenNumbers.add(questionNumber as number);
    return {
      id: questionId,
      questionNumber: questionNumber as number,
      questionText,
      questionType,
      focusArea,
      difficulty: questionDifficulty,
      reason,
      expectedTopics: expectedTopics.map((topic) => (topic as string).trim()),
    };
  });

  return {
    session: {
      id,
      role,
      interviewType,
      difficulty,
      interviewerStyle,
      totalQuestions: totalQuestions as number,
      status,
      jobDescriptionId,
    },
    questions,
  };
}

function requireUuid(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw invalidCreatedResponse();
  }
  return value;
}

function requireText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") throw invalidCreatedResponse();
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) {
    throw invalidCreatedResponse();
  }
  return normalized;
}

function invalidCreatedResponse() {
  return new FunctionError(
    502,
    "invalid_response",
    "The generated interview returned an invalid response. Please try again.",
  );
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

function asStringList(value: unknown) {
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
    "generation_failed",
    "We couldn't generate this interview. Please retry.",
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
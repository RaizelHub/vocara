import { accountAccessResponse } from "../_shared/accountPrivacy.ts";
import { usageContext, aiClaimError } from "../_shared/aiProvider.ts";
import type { SupabaseContext } from "npm:@supabase/server@1.4.1";
import { withSupabase } from "npm:@supabase/server@1.4.1";

import type {
  AnswerFeedbackRow,
  Database,
  InterviewAnswerRow,
  InterviewQuestionRow,
  InterviewSessionRow,
  JobAnalysisRow,
  ProfileRow,
  UserFocusAreaRow,
} from "../_shared/database.types.ts";
import {
  countFillerWords,
  isTranscriptInsufficient,
} from "../_shared/evaluationConfig.ts";
import {
  ANSWER_EVALUATION_JSON_SCHEMA,
  validateAnswerEvaluation,
} from "../_shared/evaluationSchemas.ts";
import {
  ANSWER_EVALUATION_INSTRUCTIONS,
  buildAnswerEvaluationInput,
} from "../_shared/evaluationPrompts.ts";
import {
  EvaluationFunctionError,
  getEvaluationConfig,
  requestStructuredEvaluation,
  withGroqRetry,
} from "../_shared/groq.ts";
import {
  FeatureAccessError,
} from "../_shared/featureAccess.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_COMPLETION_TOKENS = 1600;
const UNCERTAIN_PROVIDER_CODES = new Set(["GROQ_TIMEOUT", "GROQ_UNAVAILABLE"]);

type EvaluationResponse = {
  answerId: string;
  overallScore: number;
  scores: {
    relevance: number;
    structure: number;
    clarity: number;
    grammar: number;
    vocabulary: number;
    confidence: number;
  };
  summary: string;
  strengths: { title: string; detail: string }[];
  improvements: { title: string; detail: string; action: string }[];
  betterApproach: string;
  improvedAnswer: string;
  fillerWords: { word: string; count: number }[];
  feedbackStatus: string;
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
          "Use POST for evaluation.",
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


      let answerId: string;
      try {
        const body = (await request.json()) as { answerId?: unknown };
        if (
          typeof body.answerId !== "string" || !UUID_PATTERN.test(body.answerId)
        ) {
          throw new FunctionError(
            400,
            "invalid_answer_id",
            "A valid answer ID is required.",
          );
        }
        answerId = body.answerId;
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

      const { data: visibleAnswer, error: answerError } = await context.supabase
        .from("interview_answers")
        .select(
          "id,session_id,question_id,user_id,transcript,duration_seconds,word_count,speaking_pace,transcription_status,audio_generation",
        )
        .eq("id", answerId)
        .maybeSingle();

      if (answerError) {
        return errorResponse(
          500,
          "answer_lookup_failed",
          "We couldn't load this answer.",
        );
      }
      if (!visibleAnswer || visibleAnswer.user_id !== userId) {
        return errorResponse(404, "answer_not_found", "Answer not found.");
      }
      const answer = visibleAnswer as InterviewAnswerRow;
      if (
        answer.transcription_status !== "completed" ||
        !answer.transcript?.trim()
      ) {
        return errorResponse(
          422,
          "transcript_required",
          "Transcribe the answer before evaluating it.",
        );
      }
      if (isTranscriptInsufficient(answer.transcript)) {
        return errorResponse(
          422,
          "insufficient_answer",
          "This answer is too short to evaluate. Please record a fuller answer.",
          false,
        );
      }

      let configuration;
      try {
        configuration = getEvaluationConfig();
      } catch (error) {
        return handledErrorResponse(error);
      }

      const attemptId = crypto.randomUUID();
      const { data: claimed, error: claimError } = await context.supabaseAdmin
        .rpc(
          "claim_answer_evaluation",
          {
            p_answer_id: answerId,
            p_user_id: userId,
            p_attempt_id: attemptId,
            p_evaluation_version: configuration.version,
            p_model: configuration.model,
          },
        );

      if (claimError) {
        const capacity = aiClaimError(claimError);
        if (capacity) return capacity;
        return handleClaimError(claimError);
      }
      if (!claimed) {
        return errorResponse(
          500,
          "claim_failed",
          "We couldn't start the evaluation.",
        );
      }
      const claim = claimed as AnswerFeedbackRow;
      if (claim.evaluation_status === "completed") {
        return Response.json(toResponse(answerId, claim));
      }
      if (claim.evaluation_status !== "processing") {
        return errorResponse(
          429,
          "attempt_limit_reached",
          "This recording reached its evaluation retry limit. Record it again.",
          false,
        );
      }

      try {
        // claim_answer_evaluation verifies the session's prepaid reservation.
        // Retries and rehydration must not consume another feature allowance.

        const [sessionResult, questionResult, profileResult, focusResult] =
          await Promise.all([
            context.supabase
              .from("interview_sessions")
              .select(
                "role,interview_type,difficulty,interviewer_style,job_description_id,job_context",
              )
              .eq("id", answer.session_id)
              .single(),
            context.supabase
              .from("interview_questions")
              .select(
                "question_text,question_type,focus_area,expected_topics,difficulty",
              )
              .eq("id", answer.question_id)
              .single(),
            context.supabase
              .from("profiles")
              .select("experience_level")
              .eq("id", userId)
              .maybeSingle(),
            context.supabase
              .from("user_focus_areas")
              .select("focus_area")
              .eq("user_id", userId),
          ]);

        if (sessionResult.error || questionResult.error) {
          throw new FunctionError(
            500,
            "context_lookup_failed",
            "We couldn't load the interview context.",
          );
        }
        const session = sessionResult.data as InterviewSessionRow;
        const question = questionResult.data as InterviewQuestionRow;
        const profile = profileResult.data as ProfileRow | null;
        const focusAreas = (focusResult.data as UserFocusAreaRow[] | null)?.map(
          (entry) => entry.focus_area,
        ) ?? [];
        if (focusResult.error) {
          throw new FunctionError(
            500,
            "context_lookup_failed",
            "We couldn't load the interview context.",
          );
        }

        let jobContext: {
          jobRole: string | null;
          jobSummary: string;
          relevantSkills: string[];
          relevantResponsibilities: string[];
          questionFocusArea: string | null;
          expectedTopics: string[];
        } | null = null;
        if (session.interview_type === "job_specific") {
          const snapshot = asObject(session.job_context);
          if (snapshot) {
            jobContext = {
              jobRole: asOptionalText(snapshot.jobRole) ?? session.role,
              jobSummary: asOptionalText(snapshot.jobSummary)?.slice(0, 500) ??
                "",
              relevantSkills: [
                ...asSkillNames(snapshot.technicalSkills),
                ...asSkillNames(snapshot.softSkills),
              ].slice(0, 8),
              relevantResponsibilities: asStringList(snapshot.responsibilities)
                .slice(0, 4),
              questionFocusArea: question.focus_area,
              expectedTopics: asStringList(question.expected_topics).slice(
                0,
                5,
              ),
            };
          } else if (session.job_description_id) {
            const { data: analysisData, error: analysisError } = await context
              .supabase
              .from("job_analyses")
              .select(
                "detected_role,summary,technical_skills,soft_skills,responsibilities",
              )
              .eq("job_description_id", session.job_description_id)
              .maybeSingle();
            if (analysisError) {
              throw new FunctionError(
                500,
                "context_lookup_failed",
                "We couldn't load the interview context.",
              );
            }
            if (analysisData) {
              const analysis = analysisData as JobAnalysisRow;
              jobContext = {
                jobRole: analysis.detected_role,
                jobSummary: analysis.summary?.slice(0, 500) ?? "",
                relevantSkills: [
                  ...asSkillNames(analysis.technical_skills),
                  ...asSkillNames(analysis.soft_skills),
                ].slice(0, 8),
                relevantResponsibilities: asStringList(
                  analysis.responsibilities,
                ).slice(0, 4),
                questionFocusArea: question.focus_area,
                expectedTopics: asStringList(question.expected_topics).slice(
                  0,
                  5,
                ),
              };
            }
          }
          jobContext ??= {
            jobRole: session.role,
            jobSummary: "",
            relevantSkills: [],
            relevantResponsibilities: [],
            questionFocusArea: question.focus_area,
            expectedTopics: asStringList(question.expected_topics).slice(0, 5),
          };
        }

        const fillerWords = countFillerWords(answer.transcript!);
        const { evaluation, validated } = await withGroqRetry(
          async (providerAttempt) => {
            const evaluation = await requestStructuredEvaluation({
              usage: usageContext(context.supabaseAdmin, userId, attemptId, "ai_evaluation_requests"),
              config: configuration,
              schemaName: "answer_evaluation",
              schema: ANSWER_EVALUATION_JSON_SCHEMA,
              instructions: ANSWER_EVALUATION_INSTRUCTIONS,
              content: buildAnswerEvaluationInput({
                role: session.role,
                interviewType: session.interview_type,
                difficulty: session.difficulty,
                interviewerStyle: session.interviewer_style,
                question: question.question_text,
                questionType: question.question_type ?? "",
                focusArea: question.focus_area,
                questionDifficulty: question.difficulty,
                transcript: answer.transcript!,
                durationSeconds: answer.duration_seconds ?? 0,
                wordCount: answer.word_count ?? 0,
                speakingPace: answer.speaking_pace ?? 0,
                fillerWords,
                experienceLevel: profile?.experience_level ?? null,
                focusAreas,
                jobContext,
              }),
              userId,
              maxCompletionTokens: MAX_COMPLETION_TOKENS,
              seed: 41 + providerAttempt,
            });
            return {
              evaluation,
              validated: validateAnswerEvaluation(evaluation.value),
            };
          },
          { maxAttempts: 1 }, // A claim represents one potentially chargeable provider attempt.
        );

        const { data: completed, error: updateError } = await context
          .supabaseAdmin.rpc(
            "complete_answer_evaluation",
            {
              p_answer_id: answerId,
              p_user_id: userId,
              p_attempt_id: attemptId,
              p_evaluation_version: configuration.version,
              p_source_audio_generation: answer.audio_generation,
              p_relevance_score: validated.scores.relevance,
              p_structure_score: validated.scores.structure,
              p_clarity_score: validated.scores.clarity,
              p_grammar_score: validated.scores.grammar,
              p_vocabulary_score: validated.scores.vocabulary,
              p_confidence_score: validated.scores.confidence,
              p_feedback_summary: validated.summary,
              p_strengths: validated.strengths,
              p_improvements: validated.improvements,
              p_better_approach: validated.betterApproach,
              p_improved_answer: validated.improvedAnswer,
              p_filler_words: fillerWords,
              p_model: evaluation.model,
              p_provider_request_id: evaluation.requestId,
              p_ai_input_tokens: evaluation.inputTokens,
              p_ai_output_tokens: evaluation.outputTokens,
            },
          );

        if (updateError) {
          if (updateError.message.includes("ANSWER_EVALUATION_SUPERSEDED")) {
            throw new FunctionError(
              409,
              "attempt_superseded",
              "A newer recording replaced this evaluation attempt.",
            );
          }
          throw new FunctionError(
            500,
            "feedback_save_failed",
            "The feedback was generated but could not be saved.",
          );
        }
        if (!completed) {
          throw new FunctionError(
            409,
            "attempt_superseded",
            "A newer recording replaced this evaluation attempt.",
          );
        }

        return Response.json(
          toResponse(answerId, completed as AnswerFeedbackRow),
        );
      } catch (error) {
        const handled = normalizeFunctionError(error);
        if (!UNCERTAIN_PROVIDER_CODES.has(handled.code)) {
          const { error: failureUpdateError } = await context.supabaseAdmin.rpc(
            "fail_answer_evaluation",
            {
              p_answer_id: answerId,
              p_user_id: userId,
              p_attempt_id: attemptId,
              p_error_code: handled.code,
              p_error_message: handled.message,
              p_retryable: handled.retryable,
            },
          );
          if (failureUpdateError) {
            console.error("[evaluate-answer] Failed to persist failure state");
          }
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
  if (error.message.includes("ANSWER_EVALUATION_NOT_FOUND")) {
    return errorResponse(404, "answer_not_found", "Answer not found.");
  }
  if (error.message.includes("ANSWER_EVALUATION_TRANSCRIPT_REQUIRED")) {
    return errorResponse(
      422,
      "transcript_required",
      "Transcribe the answer before evaluating it.",
    );
  }
  if (error.message.includes("ANSWER_EVALUATION_ALREADY_PROCESSING")) {
    return errorResponse(
      409,
      "already_processing",
      "This answer is already being evaluated.",
    );
  }
  if (error.message.includes("INTERVIEW_ANSWER_RETRY_EXHAUSTED")) {
    return errorResponse(
      429,
      "answer_retry_exhausted",
      "This answer reached its processing safety limit. Saved answers remain available. Contact support for help with this interview.",
      false,
    );
  }
  if (error.message.includes("ANSWER_EVALUATION_RECORDING_REQUIRED")) {
    return errorResponse(
      422,
      "recording_required",
      "Record a new answer before retrying evaluation.",
      false,
    );
  }
  if (error.message.includes("ANSWER_EVALUATION_ATTEMPT_LIMIT")) {
    return errorResponse(
      429,
      "attempt_limit_reached",
      "This recording reached its evaluation retry limit. Record it again.",
      false,
    );
  }
  if (error.message.includes("AI_EVALUATION_DAILY_LIMIT")) {
    return errorResponse(
      429,
      "daily_limit_reached",
      "You've reached today's evaluation limit. Please try again later.",
    );
  }
  if (error.message.includes("SESSION_EVALUATION_IDENTITY_MISMATCH")) {
    return errorResponse(
      409,
      "evaluation_identity_mismatch",
      "This session is already linked to a different evaluation configuration.",
      false,
    );
  }
  return errorResponse(
    500,
    "claim_failed",
    "We couldn't start the evaluation.",
  );
}

function toResponse(
  answerId: string,
  feedback: AnswerFeedbackRow,
): EvaluationResponse {
  return {
    answerId,
    overallScore: feedback.overall_score ?? 0,
    scores: {
      relevance: feedback.relevance_score ?? 0,
      structure: feedback.structure_score ?? 0,
      clarity: feedback.clarity_score ?? 0,
      grammar: feedback.grammar_score ?? 0,
      vocabulary: feedback.vocabulary_score ?? 0,
      confidence: feedback.confidence_score ?? 0,
    },
    summary: feedback.feedback_summary ?? "",
    strengths: asStrengthList(feedback.strengths),
    improvements: asImprovementList(feedback.improvements),
    betterApproach: feedback.better_approach ?? "",
    improvedAnswer: feedback.improved_answer ?? "",
    fillerWords: asFillerWords(feedback.filler_words),
    feedbackStatus: feedback.evaluation_status,
  };
}

function asStrengthList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is { title?: unknown; detail?: unknown } =>
        !!entry && typeof entry === "object",
    )
    .map((entry) => ({
      title: typeof entry.title === "string" ? entry.title : "",
      detail: typeof entry.detail === "string" ? entry.detail : "",
    }))
    .filter((entry) => entry.title && entry.detail);
}

function asImprovementList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (
        entry,
      ): entry is { title?: unknown; detail?: unknown; action?: unknown } =>
        !!entry && typeof entry === "object",
    )
    .map((entry) => ({
      title: typeof entry.title === "string" ? entry.title : "",
      detail: typeof entry.detail === "string" ? entry.detail : "",
      action: typeof entry.action === "string" ? entry.action : "",
    }))
    .filter((entry) => entry.title && entry.detail && entry.action);
}

function asFillerWords(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is { word?: unknown; count?: unknown } =>
        !!entry && typeof entry === "object",
    )
    .map((entry) => ({
      word: typeof entry.word === "string" ? entry.word : "",
      count: typeof entry.count === "number" ? entry.count : 0,
    }))
    .filter((entry) => entry.word);
}

function asStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function asSkillNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const name = (entry as { name?: unknown }).name;
    return typeof name === "string" && name.trim() ? [name.trim()] : [];
  });
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
    "evaluation_failed",
    "We couldn't generate the feedback. Please retry.",
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

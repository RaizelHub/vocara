import { accountAccessResponse } from "../_shared/accountPrivacy.ts";
import { usageContext, aiClaimError } from "../_shared/aiProvider.ts";
import type { SupabaseContext } from "npm:@supabase/server@1.4.1";
import { withSupabase } from "npm:@supabase/server@1.4.1";

import type {
  AnswerFeedbackRow,
  Database,
  InterviewAnswerRow,
  InterviewQuestionRow,
} from "../_shared/database.types.ts";
import {
  aggregateCategoryScores,
  averageScore,
  type CategoryScores,
} from "../_shared/evaluationConfig.ts";
import {
  buildSessionEvaluationInput,
  SESSION_EVALUATION_INSTRUCTIONS,
} from "../_shared/evaluationPrompts.ts";
import {
  SESSION_EVALUATION_JSON_SCHEMA,
  validateSessionEvaluation,
} from "../_shared/evaluationSchemas.ts";
import {
  EvaluationFunctionError,
  getEvaluationConfig,
  requestStructuredEvaluation,
  withGroqRetry,
} from "../_shared/groq.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_COMPLETION_TOKENS = 1400;
const UNCERTAIN_PROVIDER_CODES = new Set(["GROQ_TIMEOUT", "GROQ_UNAVAILABLE"]);

type SessionInput = {
  role: string;
  interview_type: string;
  difficulty: string;
  interviewer_style: string;
  total_questions: number;
};

type FinalizationResponse = {
  sessionId: string;
  feedback: {
    overallScore: number;
    performanceLabel: string;
    summary: string;
    scores: CategoryScores;
    strengths: { title: string; detail: string }[];
    focusAreas: { title: string; detail: string; action: string }[];
    recommendedPractice: { type: string; reason: string };
    strongestAnswerId: string | null;
    focusAnswerId: string | null;
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
          "Use POST for finalization.",
        );
      }

      const userId = context.userClaims?.id;
      if (!userId) {
        return errorResponse(401, "unauthorized", "Authentication is required.");
      }
      const accountDenied = await accountAccessResponse(context.supabaseAdmin, userId);
      if (accountDenied) return accountDenied;


      let sessionId: string;
      try {
        const body = (await request.json()) as { sessionId?: unknown };
        if (typeof body.sessionId !== "string" || !UUID_PATTERN.test(body.sessionId)) {
          throw new FunctionError(400, "invalid_session_id", "A valid session ID is required.");
        }
        sessionId = body.sessionId;
      } catch (error) {
        if (error instanceof FunctionError) {
          return errorResponse(error.status, error.code, error.message, error.retryable);
        }
        return errorResponse(400, "invalid_request", "Send a valid JSON request body.");
      }

      let configuration;
      try {
        configuration = getEvaluationConfig();
      } catch (error) {
        return handledErrorResponse(error);
      }

      const attemptId = crypto.randomUUID();
      const { data: claimed, error: claimError } = await context.supabaseAdmin.rpc(
        "claim_interview_finalization",
        {
          p_session_id: sessionId,
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
        return errorResponse(500, "claim_failed", "We couldn't start the finalization.");
      }
      if (claimed.evaluation_status === "completed") {
        return Response.json(toResponse(sessionId, claimed, null));
      }
      if (claimed.evaluation_status !== "processing") {
        return errorResponse(
          429,
          "attempt_limit_reached",
          "This session reached its finalization retry limit.",
          false,
        );
      }

      try {
        const [sessionResult, answersResult, questionsResult] = await Promise.all([
          context.supabase
            .from("interview_sessions")
            .select("role,interview_type,difficulty,interviewer_style,total_questions")
            .eq("id", sessionId)
            .single(),
          context.supabase
            .from("interview_answers")
            .select("id,question_id")
            .eq("session_id", sessionId),
          context.supabase
            .from("interview_questions")
            .select("id,question_number,question_text")
            .eq("session_id", sessionId),
        ]);

        if (sessionResult.error || answersResult.error || questionsResult.error) {
          throw new FunctionError(
            500,
            "context_lookup_failed",
            "We couldn't load the interview context.",
          );
        }
        const session = sessionResult.data as SessionInput;
        const answers = (answersResult.data ?? []) as InterviewAnswerRow[];
        const questions = (questionsResult.data ?? []) as InterviewQuestionRow[];

        const answerIds = answers.map((entry) => entry.id);
        const feedbackResult =
          answerIds.length === 0
            ? null
            : await context.supabase
              .from("answer_feedback")
              .select(
                "id,answer_id,overall_score,relevance_score,structure_score,clarity_score,grammar_score,vocabulary_score,confidence_score,feedback_summary,strengths,improvements,evaluation_status,evaluation_version",
              )
              .in("answer_id", answerIds);
        if (feedbackResult?.error) {
          throw new FunctionError(
            500,
            "context_lookup_failed",
            "We couldn't load the interview context.",
          );
        }
        const feedbackRows = (feedbackResult?.data ?? []) as AnswerFeedbackRow[];
        const feedbackByAnswer = new Map(
          feedbackRows.map((entry) => [entry.answer_id, entry]),
        );
        const questionById = new Map(
          questions.map((entry) => [entry.id, entry]),
        );

        const evaluated = answers.flatMap((entry) => {
          const question = questionById.get(entry.question_id);
          if (!question) return [];
          const feedback = feedbackByAnswer.get(entry.id);
          if (
            !feedback ||
            feedback.evaluation_status !== "completed" ||
            feedback.overall_score === null ||
            !feedback.feedback_summary ||
            feedback.evaluation_version !== configuration.version
          ) {
            return [];
          }
          return [
            {
              answerId: entry.id,
              questionNumber: question.question_number,
              question: question.question_text,
              score: feedback.overall_score!,
              summary: feedback.feedback_summary!,
              strengths: asStrengths(feedback.strengths),
              improvements: asImprovements(feedback.improvements),
              scores: categoryScoresFromFeedback(feedback),
            },
          ];
        });
        if (evaluated.length !== session.total_questions) {
          throw new FunctionError(
            422,
            "incomplete_feedback",
            "Every answer needs feedback before the interview can be finalized.",
          );
        }

        const categoryScores = aggregateCategoryScores(
          evaluated.map((entry) => ({
            answerId: entry.answerId,
            questionNumber: entry.questionNumber,
            overallScore: entry.score,
            scores: entry.scores,
          })),
        );
        const overallScore =
          averageScore(evaluated.map((entry) => entry.score)) ?? 0;

        const { evaluation, validated } = await withGroqRetry(
          async (providerAttempt) => {
            const evaluation = await requestStructuredEvaluation({
              usage: usageContext(context.supabaseAdmin, userId, attemptId, "ai_evaluation_requests"),
              config: configuration,
              schemaName: "session_evaluation",
              schema: SESSION_EVALUATION_JSON_SCHEMA,
              instructions: SESSION_EVALUATION_INSTRUCTIONS,
              content: buildSessionEvaluationInput({
                role: session.role,
                interviewType: session.interview_type,
                difficulty: session.difficulty,
                overallScore,
                categoryScores: categoryScores ?? emptyCategoryScores(),
                answers: evaluated,
              }),
              userId,
              maxCompletionTokens: MAX_COMPLETION_TOKENS,
              seed: 41 + providerAttempt,
            });
            return {
              evaluation,
              validated: validateSessionEvaluation(evaluation.value),
            };
          },
          { maxAttempts: 1 }, // A claim represents one potentially chargeable provider attempt.
        );

        const { data: completed, error: updateError } = await context.supabaseAdmin.rpc(
          "complete_interview_finalization",
          {
            p_session_id: sessionId,
            p_user_id: userId,
            p_attempt_id: attemptId,
            p_evaluation_version: configuration.version,
            p_summary: validated.summary,
            p_strengths: validated.strengths,
            p_focus_areas: validated.focusAreas,
            p_recommended_practice_type: validated.recommendedPractice.type,
            p_recommended_practice_reason: validated.recommendedPractice.reason,
            p_model: evaluation.model,
            p_provider_request_id: evaluation.requestId,
            p_ai_input_tokens: evaluation.inputTokens,
            p_ai_output_tokens: evaluation.outputTokens,
          },
        );

        if (updateError) {
          if (updateError.message.includes("INTERVIEW_FINALIZATION_SUPERSEDED")) {
            throw new FunctionError(
              409,
              "attempt_superseded",
              "The interview changed while it was being finalized.",
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
            "The interview changed while it was being finalized.",
          );
        }

        return Response.json(toResponse(sessionId, completed, categoryScores));
      } catch (error) {
        const handled = normalizeFunctionError(error);
        if (!UNCERTAIN_PROVIDER_CODES.has(handled.code)) {
          const { error: failureUpdateError } = await context.supabaseAdmin.rpc(
            "fail_interview_finalization",
            {
              p_session_id: sessionId,
              p_user_id: userId,
              p_attempt_id: attemptId,
              p_error_code: handled.code,
              p_error_message: handled.message,
              p_retryable: handled.retryable,
            },
          );
          if (failureUpdateError) {
            console.error("[finalize-interview] Failed to persist failure state");
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
  if (error.message.includes("INTERVIEW_FINALIZATION_NOT_FOUND")) {
    return errorResponse(404, "session_not_found", "Session not found.");
  }
  if (error.message.includes("INTERVIEW_FINALIZATION_ABANDONED")) {
    return errorResponse(
      422,
      "session_abandoned",
      "This interview was abandoned and cannot be finalized.",
      false,
    );
  }
  if (error.message.includes("INTERVIEW_ALREADY_FINALIZED")) {
    return errorResponse(
      409,
      "already_finalized",
      "This interview is already finalized.",
      false,
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
  if (error.message.includes("INTERVIEW_FINALIZATION_INCOMPLETE_ANSWERS")) {
    return errorResponse(
      422,
      "incomplete_answers",
      "Every question must be answered and transcribed before finalizing.",
    );
  }
  if (error.message.includes("INTERVIEW_FINALIZATION_INCOMPLETE_FEEDBACK")) {
    return errorResponse(
      422,
      "incomplete_feedback",
      "Every answer needs feedback before the interview can be finalized.",
    );
  }
  if (error.message.includes("INTERVIEW_FINALIZATION_ALREADY_PROCESSING")) {
    return errorResponse(
      409,
      "already_processing",
      "This interview is already being finalized.",
    );
  }
  if (error.message.includes("INTERVIEW_FINALIZATION_NOT_RETRYABLE")) {
    return errorResponse(
      422,
      "not_retryable",
      "This interview cannot be finalized again.",
      false,
    );
  }
  if (error.message.includes("INTERVIEW_FINALIZATION_ATTEMPT_LIMIT")) {
    return errorResponse(
      429,
      "attempt_limit_reached",
      "This interview reached its finalization retry limit.",
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
  return errorResponse(500, "claim_failed", "We couldn't start the finalization.");
}

function toResponse(
  sessionId: string,
  feedback: {
    overall_score: number | null;
    performance_label: string | null;
    summary: string | null;
    clarity_score: number | null;
    grammar_score: number | null;
    confidence_score: number | null;
    structure_score: number | null;
    relevance_score: number | null;
    vocabulary_score: number | null;
    strengths: unknown;
    focus_areas: unknown;
    recommended_practice_type: string | null;
    recommended_practice_reason: string | null;
    strongest_answer_id: string | null;
    focus_answer_id: string | null;
  },
  categoryScores: CategoryScores | null,
): FinalizationResponse {
  return {
    sessionId,
    feedback: {
      overallScore: feedback.overall_score ?? 0,
      performanceLabel: feedback.performance_label ?? "",
      summary: feedback.summary ?? "",
      scores: categoryScores ?? {
        relevance: feedback.relevance_score ?? 0,
        structure: feedback.structure_score ?? 0,
        clarity: feedback.clarity_score ?? 0,
        grammar: feedback.grammar_score ?? 0,
        vocabulary: feedback.vocabulary_score ?? 0,
        confidence: feedback.confidence_score ?? 0,
      },
      strengths: asStrengths(feedback.strengths),
      focusAreas: asImprovements(feedback.focus_areas),
      recommendedPractice: {
        type: feedback.recommended_practice_type ?? "",
        reason: feedback.recommended_practice_reason ?? "",
      },
      strongestAnswerId: feedback.strongest_answer_id,
      focusAnswerId: feedback.focus_answer_id,
    },
  };
}

function emptyCategoryScores(): CategoryScores {
  return {
    relevance: 0,
    structure: 0,
    clarity: 0,
    grammar: 0,
    vocabulary: 0,
    confidence: 0,
  };
}

function categoryScoresFromFeedback(feedback: AnswerFeedbackRow): CategoryScores {
  return {
    relevance: feedback.relevance_score ?? 0,
    structure: feedback.structure_score ?? 0,
    clarity: feedback.clarity_score ?? 0,
    grammar: feedback.grammar_score ?? 0,
    vocabulary: feedback.vocabulary_score ?? 0,
    confidence: feedback.confidence_score ?? 0,
  };
}

function asStrengths(value: unknown) {
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

function asImprovements(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is { title?: unknown; detail?: unknown; action?: unknown } =>
        !!entry && typeof entry === "object",
    )
    .map((entry) => ({
      title: typeof entry.title === "string" ? entry.title : "",
      detail: typeof entry.detail === "string" ? entry.detail : "",
      action: typeof entry.action === "string" ? entry.action : "",
    }))
    .filter((entry) => entry.title && entry.detail && entry.action);
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
    "finalization_failed",
    "We couldn't finalize the interview. Please retry.",
  );
}

function handledErrorResponse(error: unknown) {
  const handled = normalizeFunctionError(error);
  return errorResponse(handled.status, handled.code, handled.message, handled.retryable);
}

function errorResponse(status: number, code: string, message: string, retryable = true) {
  return Response.json({ code, message, retryable }, { status });
}

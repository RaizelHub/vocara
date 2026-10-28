import { accountAccessResponse } from "../_shared/accountPrivacy.ts";
import { usageContext, aiClaimError } from "../_shared/aiProvider.ts";
import type { SupabaseContext } from "npm:@supabase/server@1.4.1";
import { withSupabase } from "npm:@supabase/server@1.4.1";

import type {
  Database,
  SpeakingAttemptRow,
  SpeakingFeedbackRow,
  SpeakingSessionRow,
} from "../_shared/database.types.ts";
import {
  countSpeakingFillerWords,
  EvaluationConfigError,
  getSpeakingEvaluationConfig,
  isSpeakingTranscriptInsufficient,
  type SpeakingCategoryScores,
} from "../_shared/speakingConfig.ts";
import {
  SPEAKING_EVALUATION_JSON_SCHEMA,
  validateSpeakingEvaluation,
  type SpeakingImprovement,
  type SpeakingStrength,
} from "../_shared/speakingSchemas.ts";
import {
  SPEAKING_EVALUATION_INSTRUCTIONS,
  buildSpeakingEvaluationInput,
} from "../_shared/speakingPrompts.ts";
import {
  EvaluationFunctionError,
  requestStructuredEvaluation,
  withGroqRetry,
} from "../_shared/groq.ts";
import {
  enforceFeatureAccess,
  FeatureAccessError,
  FEATURE_KEYS,
} from "../_shared/featureAccess.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_COMPLETION_TOKENS = 1600;
const UNCERTAIN_PROVIDER_CODES = new Set(["GROQ_TIMEOUT", "GROQ_UNAVAILABLE"]);

type EvaluationResponse = {
  attemptId: string;
  overallScore: number;
  scores: SpeakingCategoryScores;
  summary: string;
  strengths: SpeakingStrength[];
  improvements: SpeakingImprovement[];
  grammarCorrections: { original: string; corrected: string; explanation: string }[];
  naturalPhrasing: { original: string; improved: string }[];
  betterVersion: string;
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


      let attemptId: string;
      try {
        const body = (await request.json()) as { attemptId?: unknown };
        if (
          typeof body.attemptId !== "string" || !UUID_PATTERN.test(body.attemptId)
        ) {
          throw new FunctionError(
            400,
            "invalid_attempt_id",
            "A valid attempt ID is required.",
          );
        }
        attemptId = body.attemptId;
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

      const { data: visibleAttempt, error: attemptError } = await context.supabase
        .from("speaking_attempts")
        .select(
          "id,session_id,user_id,attempt_number,transcript,duration_seconds,word_count,speaking_pace,transcription_status,audio_generation",
        )
        .eq("id", attemptId)
        .maybeSingle();

      if (attemptError) {
        return errorResponse(
          500,
          "attempt_lookup_failed",
          "We couldn't load this attempt.",
        );
      }
      if (!visibleAttempt || visibleAttempt.user_id !== userId) {
        return errorResponse(404, "attempt_not_found", "Attempt not found.");
      }
      const attempt = visibleAttempt as SpeakingAttemptRow;
      if (
        attempt.transcription_status !== "completed" ||
        !attempt.transcript?.trim()
      ) {
        return errorResponse(
          422,
          "transcript_required",
          "Transcribe the attempt before evaluating it.",
        );
      }
      if (isSpeakingTranscriptInsufficient(attempt.transcript)) {
        return errorResponse(
          422,
          "insufficient_answer",
          "This answer is too short to evaluate. Please record a fuller answer.",
          false,
        );
      }

      let configuration;
      try {
        configuration = getSpeakingEvaluationConfig();
      } catch (error) {
        return handledErrorResponse(error);
      }

      const requestId = crypto.randomUUID();
      const { data: claimed, error: claimError } = await context.supabaseAdmin.rpc(
        "claim_speaking_evaluation",
        {
          p_attempt_id: attemptId,
          p_user_id: userId,
          p_evaluation_attempt_id: requestId,
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
      const claim = claimed as SpeakingFeedbackRow;
      if (claim.evaluation_status === "completed") {
        return Response.json(toResponse(attemptId, claim));
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
        await enforceFeatureAccess(
          context.supabaseAdmin,
          userId,
          FEATURE_KEYS.aiFeedback,
          requestId,
        );

        const sessionResult = await context.supabase
          .from("speaking_sessions")
          .select(
            "category,difficulty,prompt_text,prompt_tip,time_limit_seconds",
          )
          .eq("id", attempt.session_id)
          .eq("user_id", userId)
          .single();

        if (sessionResult.error) {
          throw new FunctionError(
            500,
            "context_lookup_failed",
            "We couldn't load the speaking context.",
          );
        }
        const session = sessionResult.data as SpeakingSessionRow;

        const fillerWords = countSpeakingFillerWords(attempt.transcript!);
        const { evaluation, validated } = await withGroqRetry(
          async (providerAttempt) => {
            const evaluation = await requestStructuredEvaluation({
              usage: usageContext(context.supabaseAdmin, userId, requestId, "speaking_evaluation_requests"),
              config: configuration,
              schemaName: "speaking_evaluation",
              schema: SPEAKING_EVALUATION_JSON_SCHEMA,
              instructions: SPEAKING_EVALUATION_INSTRUCTIONS,
              content: buildSpeakingEvaluationInput({
                category: session.category,
                difficulty: session.difficulty,
                prompt: session.prompt_text,
                tip: session.prompt_tip,
                timeLimitSeconds: session.time_limit_seconds,
                attemptNumber: attempt.attempt_number,
                transcript: attempt.transcript!,
                durationSeconds: attempt.duration_seconds ?? 0,
                wordCount: attempt.word_count ?? 0,
                speakingPace: attempt.speaking_pace ?? 0,
                fillerWords,
              }),
              userId,
              maxCompletionTokens: MAX_COMPLETION_TOKENS,
              seed: 41 + providerAttempt,
            });
            return {
              evaluation,
              validated: validateSpeakingEvaluation(evaluation.value),
            };
          },
        );

        const { data: completed, error: updateError } = await context
          .supabaseAdmin.rpc(
            "complete_speaking_evaluation",
            {
              p_attempt_id: attemptId,
              p_user_id: userId,
              p_evaluation_attempt_id: requestId,
              p_evaluation_version: configuration.version,
              p_source_audio_generation: attempt.audio_generation,
              p_clarity_score: validated.scores.clarity,
              p_fluency_score: validated.scores.fluency,
              p_grammar_score: validated.scores.grammar,
              p_vocabulary_score: validated.scores.vocabulary,
              p_structure_score: validated.scores.structure,
              p_conciseness_score: validated.scores.conciseness,
              p_feedback_summary: validated.summary,
              p_strengths: validated.strengths,
              p_improvements: validated.improvements,
              p_grammar_corrections: validated.grammarCorrections,
              p_natural_phrasing: validated.naturalPhrasing,
              p_better_version: validated.betterVersion,
              p_filler_words: fillerWords,
              p_model: evaluation.model,
              p_provider_request_id: evaluation.requestId,
              p_ai_input_tokens: evaluation.inputTokens,
              p_ai_output_tokens: evaluation.outputTokens,
            },
          );

        if (updateError) {
          if (updateError.message.includes("SPEAKING_EVALUATION_SUPERSEDED")) {
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
          toResponse(attemptId, completed as SpeakingFeedbackRow),
        );
      } catch (error) {
        const handled = normalizeFunctionError(error);
        if (!UNCERTAIN_PROVIDER_CODES.has(handled.code)) {
          const { error: failureUpdateError } = await context.supabaseAdmin.rpc(
            "fail_speaking_evaluation",
            {
              p_attempt_id: attemptId,
              p_user_id: userId,
              p_evaluation_attempt_id: requestId,
              p_error_code: handled.code,
              p_error_message: handled.message,
              p_retryable: handled.retryable,
            },
          );
          if (failureUpdateError) {
            console.error("[evaluate-speaking] Failed to persist failure state");
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
  if (error.message.includes("SPEAKING_EVALUATION_NOT_FOUND")) {
    return errorResponse(404, "attempt_not_found", "Attempt not found.");
  }
  if (error.message.includes("SPEAKING_EVALUATION_TRANSCRIPT_REQUIRED")) {
    return errorResponse(
      422,
      "transcript_required",
      "Transcribe the attempt before evaluating it.",
    );
  }
  if (error.message.includes("SPEAKING_EVALUATION_ALREADY_PROCESSING")) {
    return errorResponse(
      409,
      "already_processing",
      "This attempt is already being evaluated.",
    );
  }
  if (error.message.includes("SPEAKING_EVALUATION_RECORDING_REQUIRED")) {
    return errorResponse(
      422,
      "recording_required",
      "Record a new answer before retrying evaluation.",
      false,
    );
  }
  if (error.message.includes("SPEAKING_EVALUATION_ATTEMPT_LIMIT")) {
    return errorResponse(
      429,
      "attempt_limit_reached",
      "This recording reached its evaluation retry limit. Record it again.",
      false,
    );
  }
  if (error.message.includes("SPEAKING_EVALUATION_DAILY_LIMIT")) {
    return errorResponse(
      429,
      "daily_limit_reached",
      "You've reached today's evaluation limit. Please try again later.",
    );
  }
  return errorResponse(
    500,
    "claim_failed",
    "We couldn't start the evaluation.",
  );
}

function toResponse(
  attemptId: string,
  feedback: SpeakingFeedbackRow,
): EvaluationResponse {
  return {
    attemptId,
    overallScore: feedback.overall_score ?? 0,
    scores: {
      clarity: feedback.clarity_score ?? 0,
      fluency: feedback.fluency_score ?? 0,
      grammar: feedback.grammar_score ?? 0,
      vocabulary: feedback.vocabulary_score ?? 0,
      structure: feedback.structure_score ?? 0,
      conciseness: feedback.conciseness_score ?? 0,
    },
    summary: feedback.feedback_summary ?? "",
    strengths: asStrengthList(feedback.strengths),
    improvements: asImprovementList(feedback.improvements),
    grammarCorrections: asCorrectionList(feedback.grammar_corrections),
    naturalPhrasing: asPhrasingList(feedback.natural_phrasing),
    betterVersion: feedback.better_version ?? "",
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

function asCorrectionList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (
        entry,
      ): entry is {
        original?: unknown;
        corrected?: unknown;
        explanation?: unknown;
      } => !!entry && typeof entry === "object",
    )
    .map((entry) => ({
      original: typeof entry.original === "string" ? entry.original : "",
      corrected: typeof entry.corrected === "string" ? entry.corrected : "",
      explanation:
        typeof entry.explanation === "string" ? entry.explanation : "",
    }))
    .filter((entry) => entry.original && entry.corrected);
}

function asPhrasingList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is { original?: unknown; improved?: unknown } =>
        !!entry && typeof entry === "object",
    )
    .map((entry) => ({
      original: typeof entry.original === "string" ? entry.original : "",
      improved: typeof entry.improved === "string" ? entry.improved : "",
    }))
    .filter((entry) => entry.original && entry.improved);
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
  if (error instanceof EvaluationConfigError) {
    return new FunctionError(
      500,
      "evaluation_not_configured",
      "Speaking feedback is not configured yet.",
      false,
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

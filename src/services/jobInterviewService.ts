import { assertSupabaseConfigured } from "@/lib/supabase";
import { InterviewStartError } from "@/lib/interviewErrors";
import type {
  GeneratedJobInterview,
  JobInterviewSettings,
} from "@/types/job";
import { JobServiceError, invokeEdgeFunction } from "@/services/jobService";

const GENERATE_TIMEOUT_MS = 180_000;

export type GenerateJobInterviewInput = {
  requestId: string;
  jobDescriptionId: string;
} & JobInterviewSettings;

export const jobInterviewService = {
  async generateInterview(
    input: GenerateJobInterviewInput,
  ): Promise<GeneratedJobInterview> {
    assertSupabaseConfigured();

    const { data, error } = await invokeEdgeFunction<GeneratedJobInterview>({
      functionName: "generate-job-interview",
      body: {
        requestId: input.requestId,
        jobDescriptionId: input.jobDescriptionId,
        questionCount: input.questionCount,
        difficultyMode: input.difficultyMode,
        interviewerStyle: input.interviewerStyle,
        sessionDifficulty: input.sessionDifficulty,
      },
      timeoutMs: GENERATE_TIMEOUT_MS,
    });
    if (error) throw error;

    if (!data?.session?.id || !Array.isArray(data.questions) || data.questions.length === 0) {
      throw new JobServiceError(
        "The interview could not be created. Please try again.",
        "invalid_response",
        true,
      );
    }
    return data;
  },
};

export function getJobInterviewErrorMessage(error: unknown) {
  if (error instanceof InterviewStartError) return error.message;
  if (error instanceof JobServiceError) {
    if (error.code === "unauthorized") {
      return "Your session expired. Sign in again before retrying.";
    }
    if (error.code === "network_error") {
      return "We couldn't connect. Please try again.";
    }
    if (error.code === "job_analysis_required") {
      return "This job needs a fresh analysis before generating an interview.";
    }
    if (error.code === "daily_limit_reached" || error.code === "attempt_limit_reached") {
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
  return "We couldn't generate the interview. Please try again.";
}

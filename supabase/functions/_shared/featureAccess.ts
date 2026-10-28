// Feature-access enforcement for Groq-backed edge functions.
// Calls the atomic check_feature_access() RPC (service role) and maps its
// exceptions to structured FeatureAccessError results.

export const FEATURE_KEYS = {
  aiFeedback: "ai_feedback",
  jobAnalysis: "job_analysis",
  resumeAnalysis: "resume_analysis",
  personalizedInterview: "personalized_interview",
  deepInterview: "deep_interview",
  fullHistory: "full_history",
} as const;

export class FeatureAccessError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "FeatureAccessError";
    this.status = status;
    this.code = code;
    // Retryable so the recording/session survives an upgrade: the user can
    // pay and retry the same answer instead of recording from scratch.
    this.retryable = true;
  }
}

type RpcError = { message: string };

export type FeatureAccessResult = {
  allowed: boolean;
  plan: "free" | "pro";
  alreadyCounted: boolean;
};

// Reserve quota for (userId, feature) keyed by eventKey (the evaluation
// attempt id). Idempotent: retrying the same attempt never double-counts.
// Throws FeatureAccessError on PRO_REQUIRED / FEATURE_LIMIT_REACHED.
export async function enforceFeatureAccess(
  adminClient: { rpc: (fn: "check_feature_access", args: {
    p_user_id: string; p_feature: string; p_event_key: string;
  }) => PromiseLike<{ data: unknown; error: RpcError | null }> },
  userId: string,
  feature: string,
  eventKey: string,
): Promise<FeatureAccessResult> {
  const { data, error } = await adminClient.rpc("check_feature_access", {
    p_user_id: userId,
    p_feature: feature,
    p_event_key: eventKey,
  });
  if (error) throw mapFeatureAccessError(error);
  const result = data as FeatureAccessResult | null;
  if (!result || !result.allowed) {
    throw new FeatureAccessError(500, "feature_access_failed", "We couldn't verify your plan. Please retry.");
  }
  return result;
}

export function mapFeatureAccessError(error: { message: string }): FeatureAccessError {
  const message = error.message;
  if (message.includes("VOCARA_PRO_REQUIRED")) {
    return new FeatureAccessError(
      402,
      "pro_required",
      "This is a Vocara Pro feature. Upgrade to unlock it.",
    );
  }
  if (message.includes("VOCARA_FEATURE_LIMIT_REACHED")) {
    return new FeatureAccessError(
      429,
      "feature_limit_reached",
      "You've reached your free limit for this feature. Upgrade to Vocara Pro for unlimited access.",
    );
  }
  return new FeatureAccessError(
    500,
    "feature_access_failed",
    "We couldn't verify your plan. Please retry.",
  );
}

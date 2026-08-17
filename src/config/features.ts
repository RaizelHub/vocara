export const FEATURE_KEYS = {
  aiFeedback: "ai_feedback",
  jobAnalysis: "job_analysis",
  resumeAnalysis: "resume_analysis",
  personalizedInterview: "personalized_interview",
  deepInterview: "deep_interview",
  fullHistory: "full_history",
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export type PlanKey = "free" | "pro";

export const PLAN_LABELS: Record<PlanKey, string> = {
  free: "Free",
  pro: "Vocara Pro",
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  ai_feedback: "AI feedback",
  job_analysis: "Job analysis",
  resume_analysis: "Resume analysis",
  personalized_interview: "Personalized interviews",
  deep_interview: "Deep-dive interviews",
  full_history: "Full practice history",
};

export function formatLimit(
  feature: FeatureKey,
  limit: number | null,
): string {
  if (limit === null || limit === undefined) return "Unlimited";
  if (feature === FEATURE_KEYS.aiFeedback) return `${limit} per day`;
  return `${limit} per month`;
}

export function formatPeriod(feature: FeatureKey): "day" | "month" | null {
  if (feature === FEATURE_KEYS.aiFeedback) return "day";
  if (
    feature === FEATURE_KEYS.jobAnalysis ||
    feature === FEATURE_KEYS.resumeAnalysis ||
    feature === FEATURE_KEYS.personalizedInterview
  ) {
    return "month";
  }
  return null;
}

// Error codes the edge functions return when a feature is blocked.
export const PRO_REQUIRED_CODE = "pro_required";
export const FEATURE_LIMIT_CODE = "feature_limit_reached";

export function isMonetizationErrorCode(code: string | null | undefined) {
  return code === PRO_REQUIRED_CODE || code === FEATURE_LIMIT_CODE;
}

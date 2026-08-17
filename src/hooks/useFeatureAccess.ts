import { useCallback, useMemo } from "react";

import { useSubscription } from "@/providers/SubscriptionProvider";
import type { FeatureUsageSummary } from "@/types/database";

export type FeatureAccessState = {
  feature: string;
  allowed: boolean;
  isPro: boolean;
  limit: number | null;
  used: number | null;
  remaining: number | null;
  period: "day" | "month" | null;
  status: "ok" | "blocked" | "limited";
};

/**
 * Resolves the caller's current access to a plan-gated feature from the
 * server-computed usage summary. `usage` entries come from
 * get_feature_usage_summary (the caller's own plan), so absence of an entry
 * means the feature is unknown and access is denied conservatively.
 */
export function useFeatureAccess(feature: string): FeatureAccessState {
  const { plan, usage, status } = useSubscription();

  return useMemo(() => {
    const isPro = plan === "pro";
    const entry = usage.find((item) => item.feature === feature);
    // An active RevenueCat "pro" entitlement unlocks everything immediately,
    // even before the server usage summary reflects the new subscription.
    const allowed = isPro ? true : (entry?.allowed ?? false);
    const limit = isPro ? null : (entry?.limit_value ?? null);
    const used = entry?.used ?? null;
    const period = entry?.period ?? null;
    const remaining = limit === null ? null : Math.max(0, limit - (used ?? 0));

    let accessStatus: FeatureAccessState["status"] = "ok";
    if (!allowed) accessStatus = "blocked";
    else if (remaining !== null && remaining <= 0) accessStatus = "limited";

    return {
      feature,
      allowed,
      isPro,
      limit,
      used,
      remaining,
      period,
      status: status === "loading" ? "ok" : accessStatus,
    };
  }, [feature, plan, usage, status]);
}

export function useFeatureQuota(feature: string) {
  const access = useFeatureAccess(feature);
  const refresh = useRefreshUsage();
  return { ...access, refresh };
}

function useRefreshUsage() {
  const { refresh } = useSubscription();
  return useCallback(() => refresh(), [refresh]);
}

export function useUsageMeter(feature: string): FeatureUsageSummary | null {
  const { usage } = useSubscription();
  return useMemo(
    () => usage.find((item) => item.feature === feature) ?? null,
    [usage, feature],
  );
}

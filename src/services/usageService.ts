import { supabase, assertSupabaseConfigured } from "@/lib/supabase";
import type { FeatureUsageSummary } from "@/types/database";

/**
 * Loads the caller's plan + per-feature limits and current usage from the
 * server (get_feature_usage_summary, security definer keyed on auth.uid()).
 */
export async function fetchUsageSummary(): Promise<FeatureUsageSummary[]> {
  assertSupabaseConfigured();
  const { data, error } = await supabase.rpc("get_feature_usage_summary");
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as FeatureUsageSummary[];
}

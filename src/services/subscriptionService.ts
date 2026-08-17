import { supabase, assertSupabaseConfigured } from "@/lib/supabase";
import type { UserSubscription } from "@/types/database";

export type SubscriptionSyncResult = {
  plan: "free" | "pro";
  entitlement: {
    id: string;
    productIdentifier: string | null;
    expiresDate: string | null;
    store: string | null;
  } | null;
};

/**
 * Reads the user's subscription mirror. Returns null when the row does not
 * exist yet (the webhook or sync-subscription function creates it lazily);
 * callers should treat null as the Free plan.
 */
export async function fetchUserSubscription(): Promise<UserSubscription | null> {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("*")
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

/**
 * Reconciles the client's RevenueCat state with the server. Call after a
 * purchase, after a restore, and on app foreground.
 */
export async function syncSubscriptionToServer(): Promise<SubscriptionSyncResult> {
  assertSupabaseConfigured();
  const { data, error } = await supabase.functions.invoke(
    "sync-subscription",
    { method: "POST" },
  );
  if (error) {
    throw new Error(error.message);
  }
  return data as SubscriptionSyncResult;
}

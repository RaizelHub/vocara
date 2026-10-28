import { createClient } from "@supabase/supabase-js";
import { assertSupabaseConfigured, supabasePublicConfig } from "@/lib/supabase";
/** Reauthentication is memory-only: it must not switch the app's current account. */
export async function requestAccountDeletion(email: string, password: string) {
  assertSupabaseConfigured();
  const verifier = createClient(
    supabasePublicConfig.url,
    supabasePublicConfig.publishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  try {
    const { error: authError } = await verifier.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError) {
      throw new Error(
        "Identity verification failed. Check your email and password.",
      );
    }
    const { data, error } = await verifier.functions.invoke(
      "request-account-deletion",
      { body: { confirmation: "DELETE" } },
    );
    if (error || data?.code !== "DELETION_PENDING") {
      throw new Error(
        "We could not confirm the deletion request. Check your connection and try again; duplicate requests are safe.",
      );
    }
  } finally {
    await verifier.auth.signOut({ scope: "local" }).catch(() => {});
  }
}

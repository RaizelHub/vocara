import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, processLock } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const validUrl = isValidSupabaseUrl(url);
const configured = Boolean(validUrl && publishableKey);

export const supabaseEnvironment = {
  configured,
  error:
    configured
      ? null
      : "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env, then restart Expo.",
} as const;

// A syntactically valid placeholder lets the app render its branded configuration
// error instead of crashing during module initialization.
const clientUrl = configured ? url! : "https://missing-project.supabase.co";
const clientKey = configured ? publishableKey! : "missing-publishable-key";

export const supabasePublicConfig = {
  url: clientUrl,
  publishableKey: clientKey,
} as const;

export const supabase = createClient<Database>(clientUrl, clientKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: configured,
    persistSession: configured,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

export function assertSupabaseConfigured() {
  if (!supabaseEnvironment.configured) {
    throw new Error(supabaseEnvironment.error ?? "Supabase is not configured.");
  }
}

function isValidSupabaseUrl(value?: string) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" && parsed.hostname.length > 0) return true;
    return (
      __DEV__ &&
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "10.0.2.2"].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

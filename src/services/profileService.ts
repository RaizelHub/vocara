import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import type { FocusArea, Profile, UserPreference } from "@/types/database";

export type UserProfileSnapshot = {
  profile: Profile | null;
  focusAreas: FocusArea[];
  preferences: UserPreference | null;
};

export const profileService = {
  async getSnapshot(userId: string): Promise<UserProfileSnapshot> {
    assertSupabaseConfigured();

    const [profileResult, focusResult, preferencesResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("user_focus_areas")
        .select("focus_area")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (focusResult.error) throw focusResult.error;
    if (preferencesResult.error) throw preferencesResult.error;

    return {
      profile: profileResult.data,
      focusAreas: (focusResult.data ?? []).map((row) => row.focus_area),
      preferences: preferencesResult.data,
    };
  },
};

import type { EmailOtpType, Session, User } from "@supabase/supabase-js";
import { assertSupabaseConfigured, supabase } from "@/lib/supabase";

export type SignUpInput = {
  fullName: string;
  email: string;
  password: string;
};

export type AuthResult = {
  session: Session | null;
  user: User | null;
};

export type SignUpResult = AuthResult & {
  email: string;
  requiresEmailConfirmation: boolean;
};

export type AuthCallbackFlow = "verification" | "recovery";

const callbackRequests = new Map<string, Promise<AuthCallbackFlow>>();

function authCallbackUrl(flow: AuthCallbackFlow) {
  return `vocara://auth/callback?flow=${encodeURIComponent(flow)}`;
}

export const authService = {
  async signUp({ fullName, email, password }: SignUpInput): Promise<SignUpResult> {
    assertSupabaseConfigured();
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: authCallbackUrl("verification"),
      },
    });

    if (error) throw error;

    return {
      session: data.session,
      user: data.user,
      email: normalizedEmail,
      requiresEmailConfirmation: data.session === null,
    };
  },

  async signIn(email: string, password: string): Promise<AuthResult> {
    assertSupabaseConfigured();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
    return { session: data.session, user: data.user };
  },

  async signOut() {
    assertSupabaseConfigured();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  },

  async resetPassword(email: string) {
    assertSupabaseConfigured();
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: authCallbackUrl("recovery") },
    );
    if (error) throw error;
  },

  async updatePassword(password: string) {
    assertSupabaseConfigured();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },

  async resendVerification(email: string) {
    assertSupabaseConfigured();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: authCallbackUrl("verification") },
    });
    if (error) throw error;
  },

  consumeCallback(url: string) {
    const existing = callbackRequests.get(url);
    if (existing) return existing;

    const request = consumeAuthCallback(url).catch((error) => {
      callbackRequests.delete(url);
      throw error;
    });
    callbackRequests.set(url, request);
    return request;
  },
};

async function consumeAuthCallback(url: string): Promise<AuthCallbackFlow> {
  assertSupabaseConfigured();
  const parsed = new URL(url);
  const query = parsed.searchParams;
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const parameter = (name: string) => query.get(name) ?? fragment.get(name);
  const providerError = parameter("error_description") ?? parameter("error");
  if (providerError) throw new Error(providerError);

  const requestedFlow = parameter("flow");
  const callbackType = parameter("type");
  const flow: AuthCallbackFlow =
    requestedFlow === "recovery" || callbackType === "recovery"
      ? "recovery"
      : "verification";
  const code = parameter("code");
  const accessToken = parameter("access_token");
  const refreshToken = parameter("refresh_token");
  const tokenHash = parameter("token_hash");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return flow;
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return flow;
  }

  if (tokenHash && callbackType) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: callbackType as EmailOtpType,
    });
    if (error) throw error;
    return flow;
  }

  throw new Error("This authentication link is invalid or has expired.");
}

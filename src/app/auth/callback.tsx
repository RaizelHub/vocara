import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";

import { AuthButton } from "@/components/auth/AuthButton";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AuthStatusState } from "@/components/auth/AuthStatusState";
import { getAuthErrorMessage } from "@/lib/authErrors";
import { useAuth } from "@/providers/AuthProvider";
import { authService, type AuthCallbackFlow } from "@/services/authService";
import { colors } from "@/theme/colors";

type CallbackState =
  | { phase: "loading" }
  | { phase: "success"; flow: AuthCallbackFlow }
  | { phase: "error"; message: string };

type CallbackParams = {
  flow?: string | string[];
  type?: string | string[];
  code?: string | string[];
  access_token?: string | string[];
  refresh_token?: string | string[];
  token_hash?: string | string[];
  error?: string | string[];
  error_description?: string | string[];
};

const CALLBACK_TIMEOUT_MS = 8_000;

export default function AuthCallbackScreen() {
  const { session, profile } = useAuth();
  const linkingUrl = Linking.useLinkingURL();
  const params = useLocalSearchParams<CallbackParams>();
  const handledUrl = useRef<string | null>(null);
  const [state, setState] = useState<CallbackState>({ phase: "loading" });
  const flow = firstParam(params.flow) === "recovery" || firstParam(params.type) === "recovery"
    ? "recovery"
    : "verification";
  const callbackUrl = callbackUrlFrom(linkingUrl, params);

  useEffect(() => {
    if (!callbackUrl || handledUrl.current === callbackUrl) return;
    handledUrl.current = callbackUrl;
    let active = true;
    authService.consumeCallback(callbackUrl).then(
      (flow) => {
        if (active) setState({ phase: "success", flow });
      },
      (error) => {
        if (active) setState({ phase: "error", message: getAuthErrorMessage(error, "callback") });
      },
    );
    return () => {
      active = false;
    };
  }, [callbackUrl]);

  useEffect(() => {
    if (callbackUrl || state.phase !== "loading") return;
    const timer = setTimeout(() => {
      setState(
        session
          ? { phase: "success", flow }
          : {
              phase: "error",
              message: "We couldn't find a secure authentication link. Open the latest email from VOCARA and try again.",
            },
      );
    }, session ? 0 : CALLBACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [callbackUrl, flow, session, state.phase]);

  const handleContinue = useCallback(() => {
    if (state.phase !== "success") return;
    router.replace(
      state.flow === "recovery"
        ? "/reset-password"
        : profile?.onboarding_completed
          ? "/(tabs)/home"
          : "/career-setup",
    );
  }, [profile?.onboarding_completed, state]);

  return (
    <AuthScreen>
      <AuthHeader
        title={state.phase === "loading" ? "Securing your account" : "You're all set"}
        subtitle="VOCARA is confirming your secure link."
      />
      <View style={styles.content}>
        {state.phase === "loading" ? (
          <View accessibilityRole="progressbar" style={styles.loading}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Confirming your link...</Text>
          </View>
        ) : state.phase === "error" ? (
          <>
            <AuthStatusState tone="error" title="Link unavailable" body={state.message} />
            <View style={styles.action}>
              <AuthButton label="Back to Sign In" onPress={() => router.replace("/login")} />
            </View>
          </>
        ) : (
          <>
            <AuthStatusState
              tone="success"
              title={state.flow === "recovery" ? "Link confirmed" : "Email verified"}
              body={
                state.flow === "recovery"
                  ? "Create a new password to secure your account."
                  : "Your VOCARA account is ready."
              }
            />
            <View style={styles.action}>
              <AuthButton
                label={state.flow === "recovery" ? "Create New Password" : "Continue"}
                onPress={handleContinue}
              />
            </View>
          </>
        )}
      </View>
    </AuthScreen>
  );
}

function callbackUrlFrom(linkingUrl: string | null, params: CallbackParams) {
  if (linkingUrl?.includes("/auth/callback")) return linkingUrl;

  const queryParams = Object.fromEntries(
    Object.entries(params).flatMap(([key, value]) => {
      const first = firstParam(value);
      return first ? [[key, first]] : [];
    }),
  );
  const hasCallbackCredentials = [
    "code",
    "access_token",
    "refresh_token",
    "token_hash",
    "error",
    "error_description",
  ].some((key) => key in queryParams);
  if (!hasCallbackCredentials) return null;

  return `vocara://auth/callback?${new URLSearchParams(queryParams).toString()}`;
}

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

const styles = StyleSheet.create({
  content: {
    marginTop: 46,
  },
  loading: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: colors.secondary,
    fontSize: 15,
    marginTop: 18,
  },
  action: {
    marginTop: 34,
  },
});

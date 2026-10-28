import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AuthBootstrap } from "@/components/auth/AuthBootstrap";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { initSentry } from "@/lib/sentry";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { SubscriptionProvider } from "@/providers/SubscriptionProvider";
import { colors } from "@/theme/colors";

initSentry();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="dark" />
      <ErrorBoundary>
        <AuthProvider>
          <SubscriptionProvider>
            <RootNavigator />
          </SubscriptionProvider>
        </AuthProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, profile, deletionPending, loading, bootstrapError, retryBootstrap } = useAuth();
  const router = useRouter();
  useEffect(() => { if (deletionPending && !loading) router.replace("/account/delete"); }, [deletionPending, loading, router]);

  if (loading || bootstrapError) {
    return <AuthBootstrap error={bootstrapError} onRetry={retryBootstrap} />;
  }

  const signedIn = session !== null;
  const setupComplete = profile?.onboarding_completed === true;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
        animationDuration: 320,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="verify-email" />
      </Stack.Protected>

      <Stack.Screen name="account/delete" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="auth/callback" options={{ gestureEnabled: false }} />
      <Stack.Screen name="reset-password" options={{ gestureEnabled: false }} />

      <Stack.Protected guard={signedIn && !deletionPending && !setupComplete}>
        <Stack.Screen name="career-setup" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !deletionPending && setupComplete}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="interview/setup" />
        <Stack.Screen name="interview/session" options={{ gestureEnabled: false }} />
        <Stack.Screen name="interview/analyzing" />
        <Stack.Screen name="interview/results" />
        <Stack.Screen name="interview/retry" />
        <Stack.Screen name="interview/quick" />
        <Stack.Screen name="interview/job" />
        <Stack.Screen name="interview/job-analysis" />
        <Stack.Screen name="interview/job-preview" />
        <Stack.Screen name="interview/result/[id]" />
        <Stack.Screen name="resume/match" />
        <Stack.Screen name="resume/personalized" />
        <Stack.Screen name="speaking/index" />
        <Stack.Screen name="speaking/session" options={{ gestureEnabled: false }} />
        <Stack.Screen name="speaking/results" />
        <Stack.Screen name="pro" />
        <Stack.Screen name="usage" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = {
  root: { flex: 1 },
};

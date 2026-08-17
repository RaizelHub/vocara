import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton } from "@/components/ui/BackButton";
import { ErrorState, LoadingState } from "@/components/ui/DataState";
import { PressableScale } from "@/components/ui/PressableScale";
import type { InterviewResult } from "@/data/mockInterviewResult";
import { getDataErrorMessage, isAuthenticationError } from "@/lib/dataErrors";
import { useAuth } from "@/providers/AuthProvider";
import {
  fetchInterviewResult,
  isResultNotFoundError,
  isResultNotReadyError,
  toInterviewResult,
} from "@/services/interviewResultService";
import { colors } from "@/theme/colors";

export default function InterviewResultScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const { signOut } = useAuth();
  const id = typeof params.id === "string" ? params.id : undefined;
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorTitle(null);
    setErrorMessage(null);
    setAuthExpired(false);
    try {
      const payload = await fetchInterviewResult(id ?? "");
      setResult(toInterviewResult(payload));
    } catch (loadError) {
      if (isAuthenticationError(loadError)) {
        setAuthExpired(true);
        setErrorTitle("Sign in again");
        setErrorMessage("Your session expired. Sign in again to see this result.");
      } else if (!id || isResultNotFoundError(loadError)) {
        setErrorTitle("Session not found");
        setErrorMessage("This practice session is no longer available.");
      } else if (isResultNotReadyError(loadError)) {
        setErrorTitle("Feedback still on its way");
        setErrorMessage("Your feedback is still being prepared. Give it a few more seconds and try again.");
      } else {
        setErrorTitle("Couldn't load your result");
        setErrorMessage(getDataErrorMessage(loadError, "We couldn't load this result."));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const handleReauthenticate = useCallback(() => {
    void signOut()
      .catch(() => undefined)
      .finally(() => router.replace("/login"));
  }, [signOut]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} />
      </View>

      {loading ? (
        <LoadingState label="Loading your result…" />
      ) : errorTitle && errorMessage ? (
        <ErrorState
          title={errorTitle}
          message={errorMessage}
          retryLabel={authExpired ? "Sign in again" : "Try again"}
          onRetry={authExpired ? handleReauthenticate : () => void load()}
        />
      ) : result ? (
        <View style={styles.body}>
          <Text style={styles.score} accessibilityLabel={`Score ${result.score}`}>
            {result.score}
          </Text>
          <Text style={styles.scoreLabel}>out of 100</Text>
          <Text style={styles.title}>{result.role}</Text>
          <Text style={styles.meta}>
            {result.interviewType} · {result.completedAt} · {result.durationMinutes} min
          </Text>
          <PressableScale
            onPress={() => router.push(`/interview/results?id=${result.id}`)}
            accessibilityLabel="Open full review"
            style={styles.pillPress}
          >
            <View style={styles.pill}>
              <Text style={styles.pillText}>Open full review</Text>
            </View>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  score: {
    fontSize: 84,
    fontWeight: "800",
    letterSpacing: -3,
    color: colors.ink,
    lineHeight: 92,
    includeFontPadding: false,
  },
  scoreLabel: {
    fontSize: 13.5,
    color: colors.muted,
    fontWeight: "600",
    marginTop: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: colors.ink,
    textAlign: "center",
    marginTop: 16,
  },
  meta: {
    fontSize: 14,
    color: colors.secondary,
    marginTop: 6,
    textAlign: "center",
  },
  pillPress: {
    marginTop: 26,
  },
  pill: {
    borderRadius: 10,
    backgroundColor: "#FBEEE9",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pillText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: colors.accentDark,
  },
});
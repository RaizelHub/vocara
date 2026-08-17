import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../providers/AuthProvider";
import { startInterviewSession } from "../../state/session";
import { interviewSessionService } from "../../services/interviewSessionService";
import { sampleQuestions } from "../../data/interviewQuestions";
import { colors } from "../../theme/colors";
import type { Difficulty, InterviewerStyle } from "../../types/interview";

const QUICK_QUESTION_BANK_TYPE = "standard" as const;
const QUICK_QUESTION_COUNT = 1;

export default function QuickPracticeScreen() {
  const router = useRouter();
  const { user, profile, preferences } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(1);
  const starting = useRef(false);

  useEffect(() => {
    if (attempt === 0 || error) return;
    if (!user) return;
    if (starting.current) return;
    starting.current = true;
    setError(null);

    const role = profile?.target_role?.trim() || "Software Developer";
    const questions = sampleQuestions(
      QUICK_QUESTION_BANK_TYPE,
      role,
      QUICK_QUESTION_COUNT,
    );

    const session = startInterviewSession({
      role,
      type: QUICK_QUESTION_BANK_TYPE,
      difficulty: (preferences?.default_difficulty ?? "intermediate") as Difficulty,
      interviewerStyle: (preferences?.default_interviewer_style ??
        "balanced") as InterviewerStyle,
      length: "quick",
      totalQuestions: QUICK_QUESTION_COUNT,
      questions,
    });

    interviewSessionService
      .ensureCreated(session, user.id)
      .then(() => {
        router.replace("/interview/session");
      })
      .catch((e) => {
        starting.current = false;
        setError(
          e instanceof Error ? e.message : "Could not start Quick Practice.",
        );
      });
  }, [attempt, error, user, profile?.target_role, preferences, router]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Quick Practice",
          headerTitleAlign: "center",
        }}
      />
      <View style={styles.container}>
        {error ? (
          <View style={styles.inner}>
            <Text style={styles.error}>{error}</Text>
            <Text style={styles.retry} onPress={() => setAttempt((a) => a + 1)}>
              Tap to retry
            </Text>
          </View>
        ) : (
          <View style={styles.inner}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loading}>Preparing your question…</Text>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  inner: {
    alignItems: "center",
    gap: 16,
  },
  loading: {
    fontSize: 16,
    color: colors.secondary,
  },
  error: {
    fontSize: 16,
    color: colors.error,
    textAlign: "center",
  },
  retry: {
    fontSize: 16,
    color: colors.accent,
    fontWeight: "600",
  },
});

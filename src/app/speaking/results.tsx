import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AttemptFeedbackCard } from "@/components/speaking/AttemptFeedbackCard";
import { ErrorState, LoadingState } from "@/components/ui/DataState";
import { PressableScale } from "@/components/ui/PressableScale";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { randomPrompt } from "@/data/speakingPrompts";
import { getDataErrorMessage, isAuthenticationError } from "@/lib/dataErrors";
import { useAuth } from "@/providers/AuthProvider";
import { speakingService } from "@/services/speakingService";
import { colors } from "@/theme/colors";
import {
  SPEAKING_CATEGORY_LABELS,
  SPEAKING_DIFFICULTY_LABELS,
  type SpeakingAttemptResult,
  type SpeakingHistoryItem,
  type SpeakingSessionPayload,
} from "@/types/speaking";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export default function SpeakingResultsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ sessionId: string }>();
  const [payload, setPayload] = useState<SpeakingSessionPayload | null>(null);
  const [recent, setRecent] = useState<SpeakingHistoryItem | null>(null);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startingNew, setStartingNew] = useState(false);

  const load = useCallback(async () => {
    if (!params.sessionId) {
      setErrorTitle("Session unavailable");
      setErrorMessage("We couldn't find this practice session.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorTitle(null);
    setErrorMessage(null);
    try {
      const [sessionPayload, summary, historyItems] = await Promise.all([
        speakingService.fetchSession(params.sessionId),
        speakingService.fetchPracticeSummary().catch(() => null),
        speakingService.fetchHistory().catch(() => null),
      ]);
      setPayload(sessionPayload);
      setTodaySeconds(summary?.todaySeconds ?? 0);
      setRecent(
        historyItems?.find((item) => item.id === sessionPayload.session.id) ?? null,
      );
    } catch (error) {
      setErrorTitle("Couldn't load this session");
      setErrorMessage(
        getDataErrorMessage(error, "We couldn't load this practice session."),
      );
    } finally {
      setLoading(false);
    }
  }, [params.sessionId]);

  const startNew = useCallback(async () => {
    if (!user || startingNew) return;
    setStartingNew(true);
    try {
      const prompt = randomPrompt(payload?.session.promptId);
      const session = await speakingService.createSession(user.id, prompt);
      router.replace({ pathname: "/speaking/session", params: { sessionId: session.id } });
    } catch (error) {
      setErrorTitle("Couldn't start a new session");
      setErrorMessage(
        isAuthenticationError(error)
          ? "Your session expired. Sign in again."
          : getDataErrorMessage(error, "We couldn't start a new practice session."),
      );
    } finally {
      setStartingNew(false);
    }
  }, [payload, startingNew, user]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/speaking");
    }
  }, []);

  const evaluatedAttempts = (payload?.attempts ?? []).filter(
    (attempt): attempt is SpeakingAttemptResult =>
      attempt.evaluationStatus === "completed" && attempt.score !== null,
  );
  const bestScore =
    evaluatedAttempts.length > 0
      ? Math.max(...evaluatedAttempts.map((attempt) => attempt.score ?? 0))
      : null;
  const lastScore = evaluatedAttempts.at(-1)?.score ?? null;

  const renderHeader = (title: string) => (
    <View style={styles.header}>
      <PressableScale onPress={() => goBack()} accessibilityLabel="Back to prompts">
        <Ionicons name="chevron-back" size={24} color={colors.ink} />
      </PressableScale>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <StatusBar style="dark" />
        {renderHeader("Session results")}
        <LoadingState label="Loading your results…" />
      </View>
    );
  }

  if (errorTitle && errorMessage) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <StatusBar style="dark" />
        {renderHeader("Session results")}
        <ErrorState
          title={errorTitle}
          message={errorMessage}
          retryLabel={errorTitle === "Session unavailable" ? "Browse prompts" : "Try again"}
          onRetry={() =>
            errorTitle === "Session unavailable"
              ? router.replace("/speaking")
              : void load()
          }
        />
      </View>
    );
  }

  const session = payload?.session;
  if (!session) return null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <StatusBar style="dark" />
      {renderHeader("Session results")}
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        entering={FadeInDown.delay(0).duration(300)}
      >
        <View style={styles.promptCard}>
          <View style={styles.promptTop}>
            <View style={styles.categoryChip}>
              <Text style={styles.categoryText}>
                {SPEAKING_CATEGORY_LABELS[session.category as keyof typeof SPEAKING_CATEGORY_LABELS] ??
                  session.category}
              </Text>
            </View>
            <View style={styles.difficultyChip}>
              <Text style={styles.difficultyText}>
                {SPEAKING_DIFFICULTY_LABELS[session.difficulty as keyof typeof SPEAKING_DIFFICULTY_LABELS] ??
                  session.difficulty}
              </Text>
            </View>
          </View>
          <Text style={styles.promptText}>{session.promptText}</Text>
          <Text style={styles.promptMeta}>
            {session.completedAt ? formatFullDate(session.completedAt) : ""}
            {evaluatedAttempts.length > 0
              ? ` · ${evaluatedAttempts.length} ${evaluatedAttempts.length === 1 ? "attempt" : "attempts"} scored`
              : ""}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <StatBlock label="Best score" value={bestScore !== null ? String(bestScore) : "—"} />
          <View style={styles.statDivider} />
          <StatBlock label="Last score" value={lastScore !== null ? String(lastScore) : "—"} />
          <View style={styles.statDivider} />
          <StatBlock label="Today" value={`${Math.max(1, Math.round(todaySeconds / 60))}m`} />
        </View>

        {evaluatedAttempts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="mic-off-outline" size={20} color={colors.muted} />
            <Text style={styles.emptyText}>
              No scored attempts in this session. Practice this prompt again to get
              coaching feedback.
            </Text>
          </View>
        ) : (
          <View style={styles.attemptList}>
            {evaluatedAttempts.map((attempt, index) => (
              <Animated.View
                key={attempt.attemptId}
                entering={FadeInDown.delay(100 + index * 80).duration(400)}
              >
                <AttemptFeedbackCard
                  attempt={attempt}
                  previousScore={index > 0 ? (evaluatedAttempts[index - 1].score ?? null) : null}
                />
              </Animated.View>
            ))}
          </View>
        )}

        {recent?.summary && evaluatedAttempts.length > 0 && (
          <View style={styles.nextCard}>
            <Text style={styles.nextTitle}>Keep building on this</Text>
            <Text style={styles.nextText}>
              {recent.summary.bestScore !== null
                ? `Your best score for this prompt is ${recent.summary.bestScore}. `
                : ""}
              A fresh prompt keeps the momentum going.
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <PrimaryButton
            label={startingNew ? "Preparing…" : "Practice a new prompt"}
            loading={startingNew}
            onPress={() => void startNew()}
          />
          <PressableScale
            onPress={() => router.replace("/speaking")}
            accessibilityLabel="Browse prompts"
          >
            <Text style={styles.browseLink}>Browse all prompts</Text>
          </PressableScale>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatFullDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  headerSpacer: {
    width: 24,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 44,
  },
  promptCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginTop: 14,
    gap: 12,
  },
  promptTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryChip: {
    borderRadius: 7,
    backgroundColor: "#FBEEE9",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  categoryText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: colors.accentDark,
  },
  difficultyChip: {
    borderRadius: 7,
    backgroundColor: "#FBF0DC",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  difficultyText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#8A5A0E",
  },
  promptText: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: colors.ink,
  },
  promptMeta: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 18,
    paddingHorizontal: 8,
    marginTop: 14,
  },
  statBlock: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statValue: {
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  statDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: colors.border,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: 10,
    padding: 22,
    marginTop: 14,
  },
  emptyText: {
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.secondary,
    textAlign: "center",
  },
  attemptList: {
    gap: 14,
    marginTop: 14,
  },
  nextCard: {
    backgroundColor: "#FBF0DC",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#EFD9A8",
    padding: 16,
    marginTop: 18,
    gap: 5,
  },
  nextTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.ink,
  },
  nextText: {
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.secondary,
  },
  actions: {
    marginTop: 26,
    gap: 12,
  },
  browseLink: {
    textAlign: "center",
    fontSize: 15,
    fontWeight: "800",
    color: colors.accent,
    paddingVertical: 8,
  },
});
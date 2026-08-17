import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "@/components/ui/PressableScale";
import { dailyPrompt, promptsForCategory } from "@/data/speakingPrompts";
import { getDataErrorMessage, isAuthenticationError } from "@/lib/dataErrors";
import { useAuth } from "@/providers/AuthProvider";
import { speakingService } from "@/services/speakingService";
import { colors } from "@/theme/colors";
import {
  SPEAKING_CATEGORIES,
  SPEAKING_CATEGORY_LABELS,
  SPEAKING_DIFFICULTY_LABELS,
  type SpeakingCategory,
  type SpeakingHistoryItem,
  type SpeakingPrompt,
} from "@/types/speaking";

type CategoryFilter = SpeakingCategory | "all";

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

export default function SpeakingLibraryScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [history, setHistory] = useState<SpeakingHistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const [items, summary] = await Promise.all([
        speakingService.fetchHistory(),
        speakingService.fetchPracticeSummary().catch(() => null),
      ]);
      setHistory(items);
      setStreak(summary?.currentStreak ?? null);
      setHistoryError(null);
    } catch (error) {
      setHistoryError(
        getDataErrorMessage(error, "We couldn't load your practice history."),
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory]),
  );

  const startPractice = useCallback(
    async (prompt: SpeakingPrompt) => {
      if (!user || busyId !== null) return;
      setBusyId(prompt.id);
      setStartError(null);
      try {
        const session = await speakingService.createSession(user.id, prompt);
        router.push({ pathname: "/speaking/session", params: { sessionId: session.id } });
      } catch (error) {
        setStartError(
          isAuthenticationError(error)
            ? "Your session expired. Sign in again."
            : getDataErrorMessage(error, "We couldn't start this practice session."),
        );
      } finally {
        setBusyId(null);
      }
    },
    [busyId, user],
  );

  const today = dailyPrompt();
  const visibleCategories =
    category === "all" ? SPEAKING_CATEGORIES : [category];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <StatusBar style="dark" />
      <Text style={styles.wordmark}>VOCARA</Text>
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        entering={FadeInDown.delay(0).duration(300)}
      >
        <Text style={styles.title}>Speaking practice</Text>
        <Text style={styles.subtitle}>
          Pick a prompt and record your answer. Your coach scores it and shows
          what to improve.
        </Text>

        {streak !== null && streak > 0 && (
          <View style={styles.streakRow}>
            <Ionicons name="flame" size={15} color={colors.accent} />
            <Text style={styles.streakText}>{streak} day streak</Text>
          </View>
        )}

        <Animated.View entering={FadeInDown.delay(80).duration(420)}>
          <View style={styles.dailyCard}>
            <View style={styles.dailyTop}>
              <View style={styles.dailyBadge}>
                <Ionicons name="sunny" size={14} color={colors.accent} />
                <Text style={styles.dailyBadgeText}>Today&apos;s prompt</Text>
              </View>
              <View style={styles.difficultyChip}>
                <Text style={styles.difficultyText}>
                  {SPEAKING_DIFFICULTY_LABELS[today.difficulty]}
                </Text>
              </View>
            </View>
            <Text style={styles.dailyText}>{today.text}</Text>
            {today.tip ? <Text style={styles.dailyTip}>{today.tip}</Text> : null}
            <View style={styles.dailyBottom}>
              <Text style={styles.timeLabel}>{today.timeLimitSeconds}s limit</Text>
              <PressableScale
                onPress={() => void startPractice(today)}
                accessibilityLabel="Start today's prompt"
                disabled={busyId !== null}
                style={styles.dailyStartWrap}
              >
                <View style={styles.dailyStart}>
                  <Text style={styles.dailyStartText}>
                    {busyId === today.id ? "Starting…" : "Start practicing"}
                  </Text>
                  <Ionicons name="chevron-forward" size={15} color="#FFFFFF" />
                </View>
              </PressableScale>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(420)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <CategoryChip
              label="All"
              active={category === "all"}
              onPress={() => setCategory("all")}
            />
            {SPEAKING_CATEGORIES.map((key) => (
              <CategoryChip
                key={key}
                label={SPEAKING_CATEGORY_LABELS[key]}
                active={category === key}
                onPress={() => setCategory(key)}
              />
            ))}
          </ScrollView>
        </Animated.View>

        {startError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{startError}</Text>
          </View>
        )}

        {visibleCategories.map((selected, groupIndex) => (
          <Animated.View
            key={selected}
            entering={FadeInDown.delay(200 + groupIndex * 40).duration(360)}
          >
            {category === "all" && (
              <Text style={styles.sectionLabel}>
                {SPEAKING_CATEGORY_LABELS[selected]}
              </Text>
            )}
            <View style={styles.list}>
              {promptsForCategory(selected).map((prompt) => (
                <PromptRow
                  key={prompt.id}
                  prompt={prompt}
                  busy={busyId === prompt.id}
                  onStart={() => void startPractice(prompt)}
                />
              ))}
            </View>
          </Animated.View>
        ))}

        <Text style={styles.sectionLabel}>Recent practice</Text>
        {historyError ? (
          <PressableScale
            onPress={() => void loadHistory()}
            accessibilityLabel="Reload practice history"
            style={styles.historyCard}
          >
            <View style={styles.historyErrorRow}>
              <Text style={styles.historyErrorText}>{historyError}</Text>
              <Text style={styles.historyRetry}>Try again</Text>
            </View>
          </PressableScale>
        ) : history === null ? (
          <View style={styles.historyCard}>
            <Text style={styles.historyLoading}>Loading your practice history…</Text>
          </View>
        ) : history.length === 0 ? (
          <View style={styles.historyCard}>
            <Text style={styles.historyEmpty}>
              No practice sessions yet. Record your first answer above.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {history.map((item) => (
              <HistoryRow key={item.id} item={item} />
            ))}
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

function CategoryChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${label} prompts`}
      collapsed
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </PressableScale>
  );
}

function PromptRow({
  prompt,
  busy,
  onStart,
}: {
  prompt: SpeakingPrompt;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <PressableScale
      onPress={onStart}
      accessibilityLabel={`Practice: ${prompt.text}`}
      disabled={busy}
      style={styles.rowWrap}
    >
      <View style={styles.row}>
        <View style={styles.micBubble}>
          <Ionicons name="mic" size={18} color={colors.accent} />
        </View>
        <View style={styles.meta}>
          <View style={styles.rowTop}>
            <View style={styles.difficultyChip}>
              <Text style={styles.difficultyText}>
                {SPEAKING_DIFFICULTY_LABELS[prompt.difficulty]}
              </Text>
            </View>
            <Text style={styles.timeLabel}>{prompt.timeLimitSeconds}s</Text>
          </View>
          <Text style={styles.rowText}>{prompt.text}</Text>
          {prompt.tip ? (
            <Text style={styles.rowTip} numberOfLines={2}>
              {prompt.tip}
            </Text>
          ) : null}
        </View>
        <View style={styles.startRing}>
          {busy ? (
            <Text style={styles.startRingBusy}>…</Text>
          ) : (
            <Ionicons name="play" size={14} color="#FFFFFF" />
          )}
        </View>
      </View>
    </PressableScale>
  );
}

function HistoryRow({ item }: { item: SpeakingHistoryItem }) {
  return (
    <PressableScale
      onPress={() =>
        router.push({
          pathname: "/speaking/results",
          params: { sessionId: item.id },
        })
      }
      accessibilityLabel={`View ${item.prompt_text}`}
      style={styles.rowWrap}
    >
      <View style={styles.row}>
        <View style={styles.historyBubble}>
          <Ionicons name="chatbubbles" size={17} color={colors.accentDark} />
        </View>
        <View style={styles.meta}>
          <Text style={styles.historyText} numberOfLines={2}>
            {item.prompt_text}
          </Text>
          <Text style={styles.historyMeta}>
            {SPEAKING_CATEGORY_LABELS[item.category as SpeakingCategory] ?? item.category}
            {" · "}
            {item.summary.attemptCount}{" "}
            {item.summary.attemptCount === 1 ? "attempt" : "attempts"}
            {" · "}
            {formatHistoryDate(item.completed_at)}
          </Text>
        </View>
        <View style={styles.scoreBlock}>
          {item.summary.lastScore !== null ? (
            <Text style={styles.scoreValue}>{item.summary.lastScore}</Text>
          ) : (
            <Text style={styles.scoreValueMuted}>—</Text>
          )}
          <Text style={styles.scoreLabel}>last</Text>
        </View>
      </View>
    </PressableScale>
  );
}

function formatHistoryDate(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((startOfToday - startOfDay) / 86_400_000);
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  wordmark: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 2.4,
    color: colors.ink,
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 44,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: colors.ink,
    marginTop: 20,
  },
  subtitle: {
    fontSize: 15.5,
    lineHeight: 21.5,
    color: colors.secondary,
    marginTop: 5,
    marginBottom: 20,
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  streakText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: colors.ink,
  },
  dailyCard: {
    backgroundColor: colors.surface,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  dailyTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  dailyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dailyBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.accent,
  },
  dailyText: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: colors.ink,
    marginTop: 12,
  },
  dailyTip: {
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.secondary,
    marginTop: 8,
  },
  dailyBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    gap: 12,
  },
  timeLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
  },
  dailyStartWrap: {
    borderRadius: 24,
  },
  dailyStart: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 23,
    backgroundColor: colors.accent,
  },
  dailyStartText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "800",
  },
  difficultyChip: {
    borderRadius: 7,
    backgroundColor: "#FBF0DC",
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  difficultyText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#8A5A0E",
  },
  chipRow: {
    gap: 8,
    paddingTop: 20,
    paddingBottom: 6,
  },
  chip: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: colors.secondary,
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  errorCard: {
    backgroundColor: "#FFEFEA",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F5C9BC",
    padding: 14,
    marginTop: 18,
  },
  errorText: {
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.accentDark,
  },
  sectionLabel: {
    marginTop: 30,
    marginBottom: 12,
    fontSize: 12.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  list: {
    gap: 12,
  },
  rowWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  micBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FBEEE9",
    alignItems: "center",
    justifyContent: "center",
  },
  historyBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    flex: 1,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 5,
  },
  rowText: {
    fontSize: 15.5,
    lineHeight: 21,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  rowTip: {
    fontSize: 12.5,
    lineHeight: 17.5,
    color: colors.secondary,
    marginTop: 4,
  },
  startRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  startRingBusy: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  historyText: {
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  historyMeta: {
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.muted,
    marginTop: 4,
  },
  scoreBlock: {
    alignItems: "center",
    minWidth: 40,
  },
  scoreValue: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  scoreValueMuted: {
    fontSize: 21,
    fontWeight: "800",
    color: colors.muted,
  },
  scoreLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
  },
  historyErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  historyErrorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.error,
  },
  historyRetry: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.accentDark,
  },
  historyLoading: {
    fontSize: 13.5,
    fontWeight: "600",
    color: colors.muted,
  },
  historyEmpty: {
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.secondary,
  },
});

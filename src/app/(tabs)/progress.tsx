import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorState, LoadingState } from "@/components/ui/DataState";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { PressableScale } from "@/components/ui/PressableScale";
import { SkillBar } from "@/components/ui/SkillBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getDataErrorMessage, isAuthenticationError } from "@/lib/dataErrors";
import { useAuth } from "@/providers/AuthProvider";
import {
  fetchUserPracticeMetrics,
  toPracticeSkills,
  type UserPracticeMetrics,
} from "@/services/interviewResultService";
import { speakingService } from "@/services/speakingService";
import { colors } from "@/theme/colors";

const WEEKDAYS = ["M", "T", "W", "Th", "F", "Sa", "Su"];

function formatMinutes(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function practiceDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function mergedWeekPractice(isoDays: string[], dateDays: string[]) {
  const practiced = new Set<string>();
  for (const iso of isoDays) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    practiced.add(practiceDayKey(date));
  }
  for (const day of dateDays) {
    const date = new Date(`${day}T00:00:00`);
    if (Number.isNaN(date.getTime())) continue;
    practiced.add(practiceDayKey(date));
  }

  const now = new Date();
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7),
  );
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return practiced.has(practiceDayKey(day));
  });
}

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [metrics, setMetrics] = useState<UserPracticeMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [speakingStreak, setSpeakingStreak] = useState(0);
  const [speakingTodayMinutes, setSpeakingTodayMinutes] = useState(0);
  const [speakingBest, setSpeakingBest] = useState<number | null>(null);
  const [speakingDays, setSpeakingDays] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorTitle(null);
    setErrorMessage(null);
    setAuthExpired(false);
    try {
      setMetrics(await fetchUserPracticeMetrics());
      const [summary, history] = await Promise.all([
        speakingService.fetchPracticeSummary().catch(() => null),
        speakingService.fetchHistory().catch(() => null),
      ]);
      setSpeakingStreak(summary?.currentStreak ?? 0);
      setSpeakingTodayMinutes(Math.round((summary?.todaySeconds ?? 0) / 60));
      setSpeakingDays(summary?.practiceDays ?? []);
      const bestScores = (history ?? [])
        .map((item) => item.summary.bestScore)
        .filter((score): score is number => score !== null);
      setSpeakingBest(bestScores.length > 0 ? Math.max(...bestScores) : null);
    } catch (loadError) {
      if (isAuthenticationError(loadError)) {
        setAuthExpired(true);
        setErrorTitle("Sign in again");
        setErrorMessage("Your session expired. Sign in again to see your progress.");
      } else {
        setErrorTitle("Couldn't load your progress");
        setErrorMessage(getDataErrorMessage(loadError, "We couldn't load your progress."));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const handleReauthenticate = useCallback(() => {
    void signOut()
      .catch(() => undefined)
      .finally(() => router.replace("/login"));
  }, [signOut]);

  const readinessScore = metrics?.readinessScore ?? 0;
  const readinessChange = readinessScore - (metrics?.previousReadinessScore ?? 0);
  const sessionsCompleted = metrics?.sessionsCompleted ?? 0;
  const practiceTime = formatMinutes(Math.round((metrics?.practiceSeconds ?? 0) / 60));
  const skills = metrics ? toPracticeSkills(metrics.skills) : [];
  const weeklyPractice = metrics
    ? mergedWeekPractice(metrics.practiceCompletedAt, speakingDays)
    : [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <Text style={styles.wordmark}>VOCARA</Text>

      {loading ? (
        <LoadingState label="Loading your progress…" />
      ) : errorTitle && errorMessage ? (
        <ErrorState
          title={errorTitle}
          message={errorMessage}
          retryLabel={authExpired ? "Sign in again" : "Try again"}
          onRetry={authExpired ? handleReauthenticate : () => void load()}
        />
      ) : (
        <Animated.ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          entering={FadeInDown.delay(0).duration(300)}
        >
          <Text style={styles.title}>Progress</Text>
          <Text style={styles.subtitle}>Your interview readiness at a glance.</Text>

          <Animated.View entering={FadeInDown.delay(80).duration(420)} style={styles.hero}>
            <View style={styles.readinessRow}>
              <View>
                <Text style={styles.heroLabel}>Interview readiness</Text>
                <AnimatedNumber value={readinessScore} delay={200} style={styles.heroScore} />
                <View style={styles.heroDelta}>
                  <Ionicons
                    name={readinessChange >= 0 ? "arrow-up" : "arrow-down"}
                    size={12}
                    color={readinessChange >= 0 ? colors.success : colors.warning}
                  />
                  <Text style={[styles.heroDeltaText, readinessChange < 0 && styles.heroDeltaTextDown]}>
                    {readinessChange >= 0 ? "+" : ""}
                    {readinessChange} this week
                  </Text>
                </View>
              </View>
              <View style={styles.heroStats}>
                <View style={styles.statBlock}>
                  <Text style={styles.statValue}>{sessionsCompleted}</Text>
                  <Text style={styles.statLabel}>Sessions</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBlock}>
                  <Text style={styles.statValue}>{practiceTime}</Text>
                  <Text style={styles.statLabel}>Practice time</Text>
                </View>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(170).duration(420)} style={styles.section}>
            <SectionHeader title="Skill progress" />
            <View style={styles.skillList}>
              {skills.map((skill, i) => (
                <View key={skill.key} style={styles.skillRow}>
                  <View style={styles.skillTop}>
                    <Text style={styles.skillName}>{skill.label}</Text>
                    <Text style={styles.skillValue} accessibilityLabel={`${skill.label} ${skill.value} percent`}>
                      {skill.value}
                    </Text>
                  </View>
                  <SkillBar value={skill.value} index={i} />
                </View>
              ))}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(250).duration(420)} style={styles.section}>
            <SectionHeader title="Speaking practice" />
            <PressableScale
              onPress={() => router.push("/speaking")}
              accessibilityLabel="Open speaking practice"
              style={styles.speakingPanel}
            >
              <View style={styles.speakingRow}>
                <View style={styles.speakingStats}>
                  <View style={styles.statBlock}>
                    <Text style={styles.statValue}>{speakingStreak}</Text>
                    <Text style={styles.statLabel}>Day streak</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statBlock}>
                    <Text style={styles.statValue}>{speakingTodayMinutes}m</Text>
                    <Text style={styles.statLabel}>Today</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statBlock}>
                    <Text style={styles.statValue}>
                      {speakingBest !== null ? speakingBest : "—"}
                    </Text>
                    <Text style={styles.statLabel}>Best score</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </View>
            </PressableScale>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(320).duration(420)} style={styles.section}>
            <SectionHeader title="This week" />
            <View style={styles.weekPanel}>
              {weeklyPractice.map((done, i) => (
                <View key={WEEKDAYS[i]} style={styles.day}>
                  <View style={[styles.dayCircle, done ? styles.dayCircleDone : null]}>
                    {done ? (
                      <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                    ) : (
                      <View style={styles.dayEmptyDot} />
                    )}
                  </View>
                  <Text style={styles.dayLabel}>{WEEKDAYS[i]}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        </Animated.ScrollView>
      )}
    </View>
  );
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
  speakingPanel: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speakingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 18,
  },
  speakingStats: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
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
    color: colors.secondary,
    marginTop: 5,
    marginBottom: 26,
  },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
  },
  readinessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  heroLabel: {
    fontSize: 13.5,
    fontWeight: "600",
    color: colors.secondary,
  },
  heroScore: {
    fontSize: 54,
    fontWeight: "800",
    letterSpacing: -2,
    color: colors.ink,
    lineHeight: 60,
    includeFontPadding: false,
  },
  heroDelta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  heroDeltaText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.success,
  },
  heroDeltaTextDown: {
    color: colors.warning,
  },
  heroStats: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    alignSelf: "stretch",
  },
  statBlock: {
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600",
  },
  statDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: colors.border,
  },
  section: {
    marginTop: 32,
  },
  skillList: {
    gap: 15,
  },
  skillRow: {
    gap: 7,
  },
  skillTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  skillName: {
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.ink,
  },
  skillValue: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  weekPanel: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  day: {
    alignItems: "center",
    gap: 7,
  },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  dayCircleDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dayEmptyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.muted,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.secondary,
  },
});
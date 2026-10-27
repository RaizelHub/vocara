import { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/components/ui/AppHeader";
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
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <AppHeader subtitle="Performance Tracker" />

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
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Your Progress</Text>
            <Text style={styles.subtitle}>Track your readiness, skill growth, and consistency.</Text>
          </View>

          {/* Hero Dashboard */}
          <Animated.View entering={FadeInDown.delay(60).duration(420)} style={styles.hero}>
            <View style={styles.readinessHeroTile}>
              <Text style={styles.heroLabel}>INTERVIEW READINESS</Text>
              <View style={styles.readinessScoreRow}>
                <AnimatedNumber value={readinessScore} delay={200} style={styles.heroScore} />
                <Text style={styles.heroScorePercent}>%</Text>
              </View>
              <View
                style={[
                  styles.heroDeltaBadge,
                  readinessChange >= 0 ? styles.heroDeltaUp : styles.heroDeltaDown,
                ]}
              >
                <Ionicons
                  name={readinessChange >= 0 ? "arrow-up" : "arrow-down"}
                  size={12}
                  color={readinessChange >= 0 ? colors.success : colors.warning}
                />
                <Text
                  style={[
                    styles.heroDeltaText,
                    readinessChange < 0 && styles.heroDeltaTextDown,
                  ]}
                >
                  {readinessChange >= 0 ? "+" : ""}
                  {readinessChange} this week
                </Text>
              </View>
            </View>

            <View style={styles.heroStatsRow}>
              <View style={styles.statBox}>
                <View style={styles.statIconWrap}>
                  <Ionicons name="checkbox-outline" size={17} color={colors.accent} />
                </View>
                <Text style={styles.statValue}>{sessionsCompleted}</Text>
                <Text style={styles.statLabel}>Completed Sessions</Text>
              </View>

              <View style={styles.statBox}>
                <View style={styles.statIconWrap}>
                  <Ionicons name="time-outline" size={17} color={colors.accent} />
                </View>
                <Text style={styles.statValue}>{practiceTime}</Text>
                <Text style={styles.statLabel}>Total Practice</Text>
              </View>
            </View>
          </Animated.View>

          {/* Skill Progress */}
          {skills.length > 0 && (
            <Animated.View entering={FadeInDown.delay(140).duration(420)} style={styles.section}>
              <SectionHeader
                title="Skill Progress"
                subtitle="Evaluated across all practice responses"
              />
              <View style={styles.card}>
                <View style={styles.skillList}>
                  {skills.map((skill, i) => (
                    <View key={skill.key} style={styles.skillRow}>
                      <View style={styles.skillTop}>
                        <Text style={styles.skillName}>{skill.label}</Text>
                        <View style={styles.skillBadge}>
                          <Text
                            style={styles.skillValue}
                            accessibilityLabel={`${skill.label} ${skill.value} percent`}
                          >
                            {skill.value}%
                          </Text>
                        </View>
                      </View>
                      <SkillBar value={skill.value} index={i} height={8} />
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>
          )}

          {/* Speaking Practice */}
          <Animated.View entering={FadeInDown.delay(220).duration(420)} style={styles.section}>
            <SectionHeader
              title="Speaking Practice"
              subtitle="Daily fluency and voice practice"
              actionLabel="Practice now"
              onAction={() => router.push("/speaking")}
            />
            <PressableScale
              onPress={() => router.push("/speaking")}
              accessibilityLabel="Open speaking practice"
              activeScale={0.98}
              style={styles.speakingPanel}
            >
              <View style={styles.speakingRow}>
                <View style={styles.speakingStats}>
                  <View style={styles.miniStatBlock}>
                    <Ionicons name="flame" size={18} color={colors.accent} />
                    <Text style={styles.miniStatValue}>{speakingStreak}</Text>
                    <Text style={styles.miniStatLabel}>Day streak</Text>
                  </View>
                  <View style={styles.miniDivider} />
                  <View style={styles.miniStatBlock}>
                    <Ionicons name="stopwatch-outline" size={18} color={colors.secondary} />
                    <Text style={styles.miniStatValue}>{speakingTodayMinutes}m</Text>
                    <Text style={styles.miniStatLabel}>Today</Text>
                  </View>
                  <View style={styles.miniDivider} />
                  <View style={styles.miniStatBlock}>
                    <Ionicons name="star-outline" size={18} color="#E9A23B" />
                    <Text style={styles.miniStatValue}>
                      {speakingBest !== null ? `${speakingBest}%` : "—"}
                    </Text>
                    <Text style={styles.miniStatLabel}>Best score</Text>
                  </View>
                </View>
                <View style={styles.speakingArrowCircle}>
                  <Ionicons name="chevron-forward" size={16} color={colors.ink} />
                </View>
              </View>
            </PressableScale>
          </Animated.View>

          {/* This Week Activity */}
          <Animated.View entering={FadeInDown.delay(300).duration(420)} style={styles.section}>
            <SectionHeader
              title="Weekly Consistency"
              subtitle="Days with completed practice or speaking sessions"
            />
            <View style={styles.weekPanel}>
              {weeklyPractice.map((done, i) => (
                <View key={WEEKDAYS[i]} style={styles.day}>
                  <View style={[styles.dayCircle, done && styles.dayCircleDone]}>
                    {done ? (
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    ) : (
                      <View style={styles.dayEmptyDot} />
                    )}
                  </View>
                  <Text style={[styles.dayLabel, done && styles.dayLabelDone]}>
                    {WEEKDAYS[i]}
                  </Text>
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
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  titleBlock: {
    marginTop: 14,
    marginBottom: 22,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.7,
    color: colors.ink,
  },
  subtitle: {
    fontSize: 15,
    color: colors.secondary,
    marginTop: 4,
    lineHeight: 20,
  },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 22,
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.04,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: "0 6px 18px rgba(21, 21, 21, 0.04)",
      },
      default: {},
    }),
  },
  readinessHeroTile: {
    alignItems: "center",
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  heroLabel: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: colors.muted,
  },
  readinessScoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    marginTop: 2,
  },
  heroScore: {
    fontSize: 58,
    fontWeight: "900",
    letterSpacing: -2,
    color: colors.ink,
    lineHeight: 66,
    includeFontPadding: false,
  },
  heroScorePercent: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.secondary,
    marginLeft: 2,
  },
  heroDeltaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 4,
  },
  heroDeltaUp: {
    backgroundColor: colors.successLight,
  },
  heroDeltaDown: {
    backgroundColor: colors.warningLight,
  },
  heroDeltaText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: colors.success,
  },
  heroDeltaTextDown: {
    color: colors.warning,
  },
  heroStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 11.5,
    color: colors.secondary,
    fontWeight: "600",
    marginTop: 2,
  },
  section: {
    marginTop: 34,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.04,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 4px 14px rgba(21, 21, 21, 0.04)",
      },
      default: {},
    }),
  },
  skillList: {
    gap: 16,
  },
  skillRow: {
    gap: 8,
  },
  skillTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  skillName: {
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.ink,
  },
  skillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    backgroundColor: colors.surfaceSubtle,
  },
  skillValue: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  speakingPanel: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 18,
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.04,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 4px 14px rgba(21, 21, 21, 0.04)",
      },
      default: {},
    }),
  },
  speakingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  speakingStats: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  miniStatBlock: {
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  miniStatValue: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  miniStatLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "700",
  },
  miniDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.borderSubtle,
  },
  speakingArrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  weekPanel: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.04,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 4px 14px rgba(21, 21, 21, 0.04)",
      },
      default: {},
    }),
  },
  day: {
    alignItems: "center",
    gap: 8,
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
  },
  dayCircleDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    ...Platform.select({
      ios: {
        shadowColor: colors.accent,
        shadowOpacity: 0.3,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 2px 8px rgba(255, 90, 54, 0.3)",
      },
      default: {},
    }),
  },
  dayEmptyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dayLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.secondary,
  },
  dayLabelDone: {
    color: colors.ink,
    fontWeight: "800",
  },
});
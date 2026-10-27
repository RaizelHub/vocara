import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DailyChallenge } from "@/components/home/DailyChallenge";
import { ResumeInterview } from "@/components/interview/ResumeInterview";
import { PracticeModes } from "@/components/home/PracticeModes";
import { ReadinessHero } from "@/components/home/ReadinessHero";
import { RecentPractice } from "@/components/home/RecentPractice";
import { SkillSnapshot } from "@/components/home/SkillSnapshot";
import { AppHeader } from "@/components/ui/AppHeader";
import { ErrorState, LoadingState } from "@/components/ui/DataState";
import { PressableScale } from "@/components/ui/PressableScale";
import { dailyPrompt } from "@/data/speakingPrompts";
import { getDataErrorMessage, isAuthenticationError } from "@/lib/dataErrors";
import { useAuth } from "@/providers/AuthProvider";
import { FOCUS_AREA_LABELS } from "@/services/careerSetupService";
import {
  fetchUserPracticeMetrics,
  practiceStreakDays,
  toPracticeSkills,
  toRecentSessions,
  type UserPracticeMetrics,
} from "@/services/interviewResultService";
import { speakingService } from "@/services/speakingService";
import { colors } from "@/theme/colors";
import { SPEAKING_DIFFICULTY_LABELS } from "@/types/speaking";

function greetingForHour(hour: number) {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomeScreen() {
  const { profile, user, focusAreas, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [metrics, setMetrics] = useState<UserPracticeMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);

  const fullName =
    profile?.full_name.trim() ||
    (typeof user?.user_metadata.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "") ||
    user?.email?.split("@")[0] ||
    "there";
  const firstName = fullName.split(/\s+/)[0];
  const targetRole = profile?.target_role?.trim() || "your next role";
  const userFocusAreas = focusAreas.map((area) => FOCUS_AREA_LABELS[area]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorTitle(null);
    setErrorMessage(null);
    setAuthExpired(false);
    try {
      setMetrics(await fetchUserPracticeMetrics());
    } catch (loadError) {
      if (isAuthenticationError(loadError)) {
        setAuthExpired(true);
        setErrorTitle("Sign in again");
        setErrorMessage("Your session expired. Sign in again to see your progress.");
      } else {
        setErrorTitle("Couldn't load your practice data");
        setErrorMessage(getDataErrorMessage(loadError, "We couldn't load your practice data."));
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

  const startDailyPractice = useCallback(async () => {
    if (!user) {
      router.push("/speaking");
      return;
    }
    try {
      const session = await speakingService.createSession(user.id, dailyPrompt());
      router.push({ pathname: "/speaking/session", params: { sessionId: session.id } });
    } catch {
      router.push("/speaking");
    }
  }, [user]);

  const readinessScore = metrics?.readinessScore ?? 0;
  const readinessChange = readinessScore - (metrics?.previousReadinessScore ?? 0);
  const streak = metrics ? practiceStreakDays(metrics.practiceCompletedAt) : 0;

  const streakPill = streak > 0 ? (
    <PressableScale
      onPress={() => router.push("/progress")}
      accessibilityLabel={`${streak} day streak`}
      collapsed
      activeScale={0.92}
    >
      <View style={styles.headerStreakBadge}>
        <Ionicons name="flame" size={15} color={colors.accent} />
        <Text style={styles.headerStreakText}>{streak}d</Text>
      </View>
    </PressableScale>
  ) : (
    <PressableScale
      onPress={() => router.push("/interview/quick")}
      accessibilityLabel="Quick practice"
      collapsed
      activeScale={0.92}
    >
      <View style={styles.headerActionBadge}>
        <Ionicons name="flash-outline" size={14} color={colors.accentDark} />
        <Text style={styles.headerActionText}>Quick</Text>
      </View>
    </PressableScale>
  );

  const header = (
    <><AppHeader subtitle="AI Interview Coach" rightAction={streakPill} /><ResumeInterview /></>
  );

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
        {header}
        <LoadingState label="Loading your practice space…" />
      </View>
    );
  }

  if (errorTitle && errorMessage) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
        {header}
        <ErrorState
          title={errorTitle}
          message={errorMessage}
          retryLabel={authExpired ? "Sign in again" : "Try again"}
          onRetry={authExpired ? handleReauthenticate : () => void load()}
        />
      </View>
    );
  }

  const heroEnter = FadeInDown.delay(60).duration(420);
  const modesEnter = FadeInDown.delay(140).duration(420);
  const challengeEnter = FadeInDown.delay(220).duration(420);
  const skillsEnter = FadeInDown.delay(300).duration(420);
  const recentEnter = FadeInDown.delay(380).duration(420);

  const skills = metrics ? toPracticeSkills(metrics.skills) : [];
  const sessions = metrics ? toRecentSessions(metrics.recentSessions) : [];
  const todayPrompt = dailyPrompt();

  const formattedDate = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      {header}

      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        entering={FadeInDown.delay(0).duration(300)}
      >
        <View style={styles.greetingBlock}>
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>{formattedDate}</Text>
          </View>
          <Text style={styles.greeting}>
            {greetingForHour(new Date().getHours())}, {firstName}
          </Text>
          <Text style={styles.greetingTagline}>Ready for your next interview simulation?</Text>
        </View>

        <Animated.View entering={heroEnter}>
          <ReadinessHero
            score={readinessScore}
            change={readinessChange}
            targetRole={targetRole}
            focusAreas={userFocusAreas}
            onStart={() => router.push("/interview/setup")}
          />
        </Animated.View>

        <Animated.View entering={modesEnter} style={styles.section}>
          <PracticeModes />
        </Animated.View>

        <Animated.View entering={challengeEnter} style={styles.section}>
          <DailyChallenge
            question={todayPrompt.text}
            support={todayPrompt.tip ?? "Record a spoken answer and get instant coaching."}
            difficulty={SPEAKING_DIFFICULTY_LABELS[todayPrompt.difficulty]}
            onStart={() => void startDailyPractice()}
          />
        </Animated.View>

        {skills.length > 0 && (
          <Animated.View entering={skillsEnter} style={styles.section}>
            <SkillSnapshot skills={skills} />
          </Animated.View>
        )}

        <Animated.View entering={recentEnter} style={styles.section}>
          <RecentPractice sessions={sessions} />
        </Animated.View>
      </Animated.ScrollView>
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
  greetingBlock: {
    marginTop: 18,
    marginBottom: 20,
  },
  dateBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  dateBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  greeting: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.7,
    color: colors.ink,
  },
  greetingTagline: {
    fontSize: 15.5,
    color: colors.secondary,
    marginTop: 4,
    lineHeight: 21,
  },
  section: {
    marginTop: 34,
  },
  headerStreakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accentLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },
  headerStreakText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: colors.accentDark,
  },
  headerActionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  headerActionText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.ink,
  },
});

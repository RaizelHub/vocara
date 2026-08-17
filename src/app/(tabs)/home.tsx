import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DailyChallenge } from "@/components/home/DailyChallenge";
import { PracticeModes } from "@/components/home/PracticeModes";
import { ReadinessHero } from "@/components/home/ReadinessHero";
import { RecentPractice } from "@/components/home/RecentPractice";
import { SkillSnapshot } from "@/components/home/SkillSnapshot";
import { ErrorState, LoadingState } from "@/components/ui/DataState";
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

  const header = (
    <View style={styles.header}>
      <Text style={styles.wordmark}>VOCARA</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        {header}
        <LoadingState label="Loading your practice space…" />
      </View>
    );
  }

  if (errorTitle && errorMessage) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
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

  const heroEnter = FadeInDown.delay(80).duration(420);
  const modesEnter = FadeInDown.delay(170).duration(420);
  const challengeEnter = FadeInDown.delay(250).duration(420);
  const skillsEnter = FadeInDown.delay(320).duration(420);
  const recentEnter = FadeInDown.delay(390).duration(420);

  const skills = metrics ? toPracticeSkills(metrics.skills) : [];
  const sessions = metrics ? toRecentSessions(metrics.recentSessions) : [];
  const todayPrompt = dailyPrompt();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {header}

      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        entering={FadeInDown.delay(0).duration(300)}
      >
        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>{greetingForHour(new Date().getHours())}, {firstName}</Text>
          <Text style={styles.greetingTagline}>Ready for your next interview?</Text>
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

        {streak > 0 && (
          <View style={styles.streakRow}>
            <Ionicons name="flame" size={16} color={colors.accent} />
            <Text style={styles.streakText}>
              {streak} day streak
            </Text>
          </View>
        )}

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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  wordmark: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 2.4,
    color: colors.ink,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 44,
  },
  greetingBlock: {
    marginTop: 24,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: -0.7,
    color: colors.ink,
  },
  greetingTagline: {
    fontSize: 16,
    color: colors.secondary,
    marginTop: 5,
  },
  section: {
    marginTop: 32,
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 26,
  },
  streakText: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.ink,
  },
});
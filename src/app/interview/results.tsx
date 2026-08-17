import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnswerReviewItem } from "@/components/results/AnswerReviewItem";
import { FeedbackSection } from "@/components/results/FeedbackSection";
import { PracticeRecommendation } from "@/components/results/PracticeRecommendation";
import { ProgressUpdate } from "@/components/results/ProgressUpdate";
import { ResultHero } from "@/components/results/ResultHero";
import { ResultSummary } from "@/components/results/ResultSummary";
import { ShareResultModal } from "@/components/results/ShareResultModal";
import { SkillScores } from "@/components/results/SkillScores";
import { ErrorState, LoadingState } from "@/components/ui/DataState";
import { PressableScale } from "@/components/ui/PressableScale";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { InterviewAnswerFeedback, InterviewResult } from "@/data/mockInterviewResult";
import { getDataErrorMessage, isAuthenticationError } from "@/lib/dataErrors";
import { useAuth } from "@/providers/AuthProvider";
import {
  fetchInterviewResult,
  isResultNotFoundError,
  isResultNotReadyError,
  toInterviewResult,
} from "@/services/interviewResultService";
import { getInterviewSession } from "@/state/session";
import { colors } from "@/theme/colors";

export default function InterviewResultsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const { signOut } = useAuth();
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [shareVisible, setShareVisible] = useState(false);

  const sessionId =
    typeof params.id === "string" && params.id.length > 0
      ? params.id
      : getInterviewSession()?.id;

  const load = useCallback(async () => {
    setLoading(true);
    setErrorTitle(null);
    setErrorMessage(null);
    setAuthExpired(false);
    try {
      const payload = await fetchInterviewResult(sessionId ?? "");
      setResult(toInterviewResult(payload));
    } catch (loadError) {
      if (isAuthenticationError(loadError)) {
        setAuthExpired(true);
        setErrorTitle("Sign in again");
        setErrorMessage("Your session expired. Sign in again to see this result.");
      } else if (isResultNotReadyError(loadError)) {
        setErrorTitle("Feedback still on its way");
        setErrorMessage("Your feedback is still being prepared. Give it a few more seconds and try again.");
      } else if (!sessionId || isResultNotFoundError(loadError)) {
        setErrorTitle("Session not found");
        setErrorMessage("We couldn't find that interview session. Start a new interview to see results.");
      } else {
        setErrorTitle("Couldn't load your result");
        setErrorMessage(getDataErrorMessage(loadError, "We couldn't load your interview result."));
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const handleReauthenticate = useCallback(() => {
    void signOut()
      .catch(() => undefined)
      .finally(() => router.replace("/login" as Href));
  }, [signOut]);

  const retryAnswer = (answer: InterviewAnswerFeedback) => {
    router.push({
      pathname: "/interview/retry",
      params: { question: answer.question },
    } as Href);
  };

  const practiceBehavioral = () => {
    router.push({
      pathname: "/interview/setup",
      params: { type: "behavioral" },
    });
  };

  const practiceAgain = () => {
    if (result?.interviewTypeKey === "job_specific") {
      router.push("/interview/job" as Href);
      return;
    }
    router.push({
      pathname: "/interview/setup",
      params: { type: result?.interviewTypeKey },
    });
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <StatusBar style="dark" />
        <LoadingState label="Loading your feedback…" />
      </View>
    );
  }

  if (errorTitle && errorMessage) {
    return (
      <View style={styles.screen}>
        <StatusBar style="dark" />
        <ErrorState
          title={errorTitle}
          message={errorMessage}
          retryLabel={authExpired ? "Sign in again" : "Try again"}
          onRetry={authExpired ? handleReauthenticate : () => void load()}
        />
      </View>
    );
  }

  if (!result) return <View style={styles.screen} />;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 36 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Text style={styles.wordmark}>VOCARA</Text>
          <PressableScale
            onPress={() => setShareVisible(true)}
            accessibilityLabel="Share interview result"
            collapsed
          >
            <View style={styles.shareIcon}>
              <Ionicons name="share-outline" size={19} color={colors.secondary} />
            </View>
          </PressableScale>
        </View>

        <Animated.View entering={FadeInDown.duration(360)} style={styles.intro}>
          <Text style={styles.eyebrow}>Interview complete</Text>
          <Text style={styles.headline}>You handled that well.</Text>
          <Text style={styles.support}>
            {"Here's where you stood out and where your next improvement can come from."}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).duration(380)}>
          <ResultHero score={result.score} previousScore={result.previousScore} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(130).duration(380)} style={styles.section}>
          <ResultSummary label={result.performanceLabel} summary={result.summary} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(190).duration(380)} style={styles.section}>
          <SkillScores skills={result.skills} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).duration(380)} style={styles.section}>
          <FeedbackSection title="What worked" items={result.strengths} variant="strength" />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(310).duration(380)} style={styles.section}>
          <FeedbackSection title="Your next focus" items={result.focusAreas} variant="focus" />
        </Animated.View>

        <View style={styles.section}>
          <SectionHeader title="Review your answers" />
          <Text style={styles.sectionSupport}>
            Tap a question to see your transcript, delivery metrics, and a stronger version.
          </Text>
          <View style={styles.answerList}>
            {result.answers.map((answer, index) => (
              <AnswerReviewItem
                key={answer.id}
                answer={answer}
                first={index === 0}
                expanded={expandedId === answer.id}
                strongest={answer.id === result.strongestAnswerId}
                retryCandidate={answer.id === result.retryAnswerId}
                onToggle={() =>
                  setExpandedId((current) => (current === answer.id ? null : answer.id))
                }
                onRetry={() => retryAnswer(answer)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <PracticeRecommendation onPractice={practiceBehavioral} />
        </View>

        <View style={styles.section}>
          <ProgressUpdate progress={result.progress} />
        </View>

        <View style={styles.section}>
          <SessionDetails result={result} />
        </View>

        <View style={styles.actions}>
          <PressableScale
            onPress={practiceAgain}
            accessibilityLabel="Practice again"
            style={styles.primaryPress}
          >
            <Text style={styles.primary}>Practice again</Text>
          </PressableScale>

          <PressableScale
            onPress={() => router.replace("/home")}
            accessibilityLabel="Back to home"
            style={styles.secondaryPress}
          >
            <Text style={styles.secondary}>Back to home</Text>
          </PressableScale>

          <PressableScale
            onPress={() => setShareVisible(true)}
            accessibilityLabel="Share interview result"
            collapsed
            style={styles.sharePress}
          >
            <View style={styles.shareAction}>
              <Ionicons name="share-outline" size={16} color={colors.accent} />
              <Text style={styles.shareText}>Share result</Text>
            </View>
          </PressableScale>
        </View>
      </ScrollView>

      <ShareResultModal
        visible={shareVisible}
        result={result}
        onClose={() => setShareVisible(false)}
      />
    </View>
  );
}

function SessionDetails({ result }: { result: InterviewResult }) {
  return (
    <View>
      <SectionHeader title="Session summary" />
      <View style={styles.details}>
        <View style={styles.quickStats}>
          <QuickStat value={String(result.answers.length)} label="Questions" />
          <QuickStat value={`${result.durationMinutes} min`} label="Duration" />
          <QuickStat value={String(result.score)} label="Score" />
        </View>
        <View style={styles.detailsDivider} />
        <DetailRow label="Date" value={result.completedAt} />
        <DetailRow label="Interview type" value={result.interviewType} />
        <DetailRow label="Difficulty" value={result.difficulty} />
        <DetailRow label="Role" value={result.role} />
      </View>
    </View>
  );
}

function QuickStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.quickStat}>
      <Text style={styles.quickValue}>{value}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
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
  },
  topBar: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wordmark: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 2.5,
    color: colors.ink,
  },
  shareIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  intro: {
    marginTop: 24,
    marginBottom: 22,
  },
  eyebrow: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.accent,
  },
  headline: {
    marginTop: 8,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.9,
    color: colors.ink,
  },
  support: {
    marginTop: 9,
    maxWidth: 350,
    fontSize: 14.5,
    lineHeight: 21.5,
    color: colors.secondary,
  },
  section: {
    marginTop: 34,
  },
  sectionSupport: {
    marginTop: -6,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 19,
    color: colors.secondary,
  },
  answerList: {
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  details: {
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  quickStats: {
    flexDirection: "row",
  },
  quickStat: {
    flex: 1,
    alignItems: "center",
  },
  quickValue: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  quickLabel: {
    marginTop: 3,
    fontSize: 10.5,
    color: colors.muted,
  },
  detailsDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 15,
  },
  detailRow: {
    minHeight: 35,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  detailValue: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "right",
  },
  actions: {
    marginTop: 38,
  },
  primaryPress: {
    marginBottom: 11,
  },
  primary: {
    height: 58,
    lineHeight: 58,
    includeFontPadding: false,
    borderRadius: 29,
    backgroundColor: colors.accent,
    color: "#FFFFFF",
    textAlign: "center",
    fontSize: 16.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  secondaryPress: {
    marginBottom: 16,
  },
  secondary: {
    height: 56,
    lineHeight: 56,
    includeFontPadding: false,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.ink,
    textAlign: "center",
    fontSize: 15.5,
    fontWeight: "800",
  },
  sharePress: {
    alignSelf: "center",
  },
  shareAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
  },
  shareText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.accent,
  },
});

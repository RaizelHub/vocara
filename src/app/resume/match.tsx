import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type Href } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LiveWaveform } from "@/components/interview/LiveWaveform";
import { BackButton } from "@/components/ui/BackButton";
import { PressableScale } from "@/components/ui/PressableScale";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { colors } from "@/theme/colors";
import { getResumeErrorMessage, resumeService } from "@/services/resumeService";
import {
  getJobErrorMessage,
  jobService,
} from "@/services/jobService";
import type { JobDescription } from "@/types/job";
import {
  getResumeMatchLabel,
  MATCH_STATUS_LABELS,
  type MatchStatus,
  type ResumeMatch,
} from "@/types/resume";

const COMPARE_STAGES = [
  "Reading your resume and the job…",
  "Mapping your skills to the role…",
  "Scoring experience and fit…",
];

export default function ResumeMatchScreen() {
  const insets = useSafeAreaInsets();
  const { resumeId, jobId } = useLocalSearchParams<{ resumeId?: string; jobId?: string }>();

  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [needAnalysis, setNeedAnalysis] = useState(false);
  const [job, setJob] = useState<JobDescription | null>(null);
  const [match, setMatch] = useState<ResumeMatch | null>(null);

  const load = useCallback(async () => {
    if (!resumeId || !jobId) {
      setError("We couldn't load this comparison.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setNeedAnalysis(false);
    try {
      const [jobRow, storedMatch] = await Promise.all([
        jobService.fetchJobDescription(jobId),
        resumeService.fetchResumeMatch({ resumeId, jobDescriptionId: jobId }),
      ]);
      setJob(jobRow);
      if (!storedMatch) {
        setError(null);
      }
      setMatch(storedMatch);
    } catch (loadError) {
      setError(getJobErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [resumeId, jobId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!comparing) return;
    const interval = setInterval(() => {
      setStage((s) => Math.min(s + 1, COMPARE_STAGES.length - 1));
    }, 720);
    return () => clearInterval(interval);
  }, [comparing]);

  async function compare() {
    if (!resumeId || !jobId || comparing) return;
    setComparing(true);
    setError(null);
    setNeedAnalysis(false);
    setStage(0);
    try {
      const result = await resumeService.compareResumeJob({
        resumeId,
        jobDescriptionId: jobId,
      });
      await delay(500);
      setMatch(result.match);
    } catch (compareError) {
      const message = getResumeErrorMessage(compareError);
      setError(message);
      setNeedAnalysis(message.includes("Analyze"));
    } finally {
      setComparing(false);
    }
  }

  const score = match?.overallMatchScore ?? 0;
  const scoreLabel = match ? getResumeMatchLabel(score) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Resume vs job</Text>
        <Text style={styles.subtitle}>
          {job?.title ?? "How well does your resume match this role?"}
        </Text>

        {loading && <Text style={styles.stateText}>Loading comparison…</Text>}

        {!loading && error && !match && (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton
              label={needAnalysis ? "Go analyze" : "Try again"}
              onPress={() => {
                if (needAnalysis) {
                  router.push("/interview/job" as Href);
                } else {
                  void compare();
                }
              }}
              disabled={comparing}
            />
          </View>
        )}

        {!loading && !error && !match && (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>
              This job hasn&apos;t been compared with your resume yet.
            </Text>
            <PrimaryButton
              label="Compare now"
              onPress={() => void compare()}
              disabled={comparing}
            />
          </View>
        )}

        {match && scoreLabel && (
          <Animated.View entering={FadeInDown.duration(320)}>
            <View
              style={[
                styles.scoreCard,
                scoreLabel.colorKey === "strong" && styles.scoreCardStrong,
                scoreLabel.colorKey === "partial" && styles.scoreCardPartial,
                scoreLabel.colorKey === "weak" && styles.scoreCardWeak,
              ]}
            >
              <Text style={styles.scoreValue}>{score}</Text>
              <Text style={styles.scoreLabel}>{scoreLabel.label}</Text>
              <View style={styles.scoreRow}>
                {match.skillMatchScore != null && (
                  <Text style={styles.scoreRowText}>Skills {match.skillMatchScore}%</Text>
                )}
                {match.experienceAlignmentScore != null && (
                  <Text style={styles.scoreRowText}>
                    Experience {match.experienceAlignmentScore}%
                  </Text>
                )}
              </View>
            </View>

            {match.summary && (
              <>
                <Text style={styles.sectionLabel}>Summary</Text>
                <Text style={styles.summaryText}>{match.summary}</Text>
              </>
            )}

            {match.matchingSkills.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Skills that match</Text>
                <View style={styles.chipWrap}>
                  {match.matchingSkills.map((skill) => (
                    <View key={skill.name} style={styles.chip}>
                      <Text style={styles.chipText}>{skill.name}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {match.missingRequirements.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>What the job wants</Text>
                <View style={styles.cardList}>
                  {match.missingRequirements.map((requirement) => (
                    <View key={requirement.requirement} style={styles.reqRow}>
                      <StatusDot status={requirement.status} />
                      <View style={styles.reqInfo}>
                        <Text style={styles.reqText}>{requirement.requirement}</Text>
                        {requirement.evidence && (
                          <Text style={styles.reqEvidence}>{requirement.evidence}</Text>
                        )}
                      </View>
                      <Text style={styles.reqStatus}>
                        {MATCH_STATUS_LABELS[requirement.status]}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {match.transferableStrengths.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Transferable strengths</Text>
                <View style={styles.cardList}>
                  {match.transferableStrengths.map((item) => (
                    <View key={item.strength} style={styles.strengthCard}>
                      <Text style={styles.strengthTitle}>{item.strength}</Text>
                      {item.evidence && (
                        <Text style={styles.strengthEvidence}>{item.evidence}</Text>
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}

            {match.interviewRisks.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>What to prepare for</Text>
                <View style={styles.cardList}>
                  {match.interviewRisks.map((item) => (
                    <View key={item.risk} style={styles.riskCard}>
                      <Text style={styles.riskTitle}>{item.risk}</Text>
                      <Text style={styles.riskPrep}>{item.preparation}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {match.recommendedFocusAreas.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Focus areas for practice</Text>
                <View style={styles.chipWrap}>
                  {match.recommendedFocusAreas.map((area) => (
                    <View key={area} style={styles.chip}>
                      <Text style={styles.chipText}>{area}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <View style={styles.ctaWrap}>
              <PrimaryButton
                label="Build personalized interview"
                onPress={() =>
                  router.push({
                    pathname: "/resume/personalized",
                    params: { resumeId, jobId },
                  } as Href)
                }
              />
            </View>
            <View style={styles.secondaryRow}>
              <PressableScale
                onPress={() => void compare()}
                disabled={comparing}
                accessibilityLabel="Re-run comparison"
                style={styles.secondaryButton}
              >
                <Ionicons name="refresh" size={15} color={colors.accentDark} />
                <Text style={styles.secondaryLabel}>Re-run comparison</Text>
              </PressableScale>
            </View>
            {error && <Text style={styles.errorText}>{error}</Text>}
          </Animated.View>
        )}
      </ScrollView>

      {comparing && (
        <View style={styles.compareOverlay}>
          <LiveWaveform active barCount={26} height={52} intensity={0.9} />
          <Animated.Text
            key={`stage-${stage}`}
            entering={FadeInDown.duration(300)}
            style={styles.stageText}
          >
            {COMPARE_STAGES[stage]}
          </Animated.Text>
        </View>
      )}
    </View>
  );
}

function StatusDot({ status }: { status: MatchStatus }) {
  const color =
    status === "strong_match"
      ? colors.success
      : status === "transferable"
        ? colors.warning
        : status === "partial_match"
          ? colors.warning
          : colors.error;
  return <View style={[styles.statusDot, { backgroundColor: color }]} />;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.7,
    color: colors.ink,
  },
  subtitle: {
    fontSize: 15.5,
    lineHeight: 22,
    color: colors.secondary,
    marginTop: 5,
    marginBottom: 4,
  },
  stateText: {
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.secondary,
  },
  stateCard: {
    marginTop: 26,
    gap: 16,
  },
  scoreCard: {
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    marginTop: 18,
  },
  scoreCardStrong: {
    backgroundColor: "#E7F5EE",
  },
  scoreCardPartial: {
    backgroundColor: "#FDF1DF",
  },
  scoreCardWeak: {
    backgroundColor: "#FBEEE9",
  },
  scoreValue: {
    fontSize: 52,
    fontWeight: "900",
    letterSpacing: -2,
    color: colors.ink,
  },
  scoreLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
    marginTop: 2,
  },
  scoreRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 10,
  },
  scoreRowText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.secondary,
  },
  sectionLabel: {
    marginTop: 26,
    marginBottom: 12,
    fontSize: 12.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 22.5,
    color: colors.ink,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: "#FBEEE9",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accentDark,
  },
  cardList: {
    gap: 10,
  },
  reqRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  reqInfo: {
    flex: 1,
  },
  reqText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  reqEvidence: {
    fontSize: 12.5,
    lineHeight: 17.5,
    color: colors.secondary,
    marginTop: 3,
  },
  reqStatus: {
    fontSize: 11.5,
    fontWeight: "800",
    color: colors.muted,
  },
  strengthCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 15,
  },
  strengthTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.ink,
  },
  strengthEvidence: {
    fontSize: 13,
    lineHeight: 18.5,
    color: colors.secondary,
    marginTop: 4,
  },
  riskCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 15,
  },
  riskTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.ink,
  },
  riskPrep: {
    fontSize: 13,
    lineHeight: 18.5,
    color: colors.secondary,
    marginTop: 4,
  },
  ctaWrap: {
    marginTop: 32,
    marginBottom: 12,
  },
  secondaryRow: {
    flexDirection: "row",
    marginBottom: 20,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 13,
  },
  secondaryLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.accentDark,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 12,
  },
  compareOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.room,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 26,
  },
  stageText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#E7E6E0",
    textAlign: "center",
  },
});
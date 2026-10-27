import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
import { router, useLocalSearchParams, type Href } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LiveWaveform } from "@/components/interview/LiveWaveform";
import { BackButton } from "@/components/ui/BackButton";
import { PressableScale } from "@/components/ui/PressableScale";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { colors } from "@/theme/colors";
import { useAuth } from "@/providers/AuthProvider";
import { interviewSessionService } from "@/services/interviewSessionService";
import {
  getJobErrorMessage,
  JobServiceError,
  jobService,
} from "@/services/jobService";
import { getJobInterviewErrorMessage, jobInterviewService } from "@/services/jobInterviewService";
import { startInterviewSession } from "@/state/session";
import type { Difficulty, InterviewerStyle } from "@/types/interview";
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_MODE_LABELS,
  QUESTION_COUNT_OPTIONS,
  SENIORITY_DIFFICULTY,
  type DifficultyMode,
  type GeneratedJobInterview,
  type JobAnalysis,
} from "@/types/job";

const STYLE_LABELS: Record<InterviewerStyle, string> = {
  supportive: "Supportive",
  balanced: "Balanced",
  challenging: "Challenging",
};

const GENERATION_STAGES = [
  "Mapping your job to interview questions…",
  "Writing questions an interviewer would really ask…",
  "Keeping the right balance and difficulty…",
];

export default function JobPreviewScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);

  const [questionCount, setQuestionCount] = useState<number>(8);
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>("match");
  const [interviewerStyle, setInterviewerStyle] = useState<InterviewerStyle>("balanced");

  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [needsReanalysis, setNeedsReanalysis] = useState(false);
  const [refreshingAnalysis, setRefreshingAnalysis] = useState(false);
  const [generated, setGenerated] = useState<GeneratedJobInterview | null>(null);
  const [starting, setStarting] = useState(false);
  const generationRequestId = useRef<string | null>(null);
  const previewSessionId = useRef<string | null>(null);
  const startedSessionId = useRef<string | null>(null);

  const sessionDifficulty = useCallback(() => {
    const base =
      SENIORITY_DIFFICULTY[analysis?.seniorityLevel ?? "mid"] ?? ("intermediate" as Difficulty);
    return adjustDifficulty(base, difficultyMode);
  }, [analysis?.seniorityLevel, difficultyMode]);

  const load = useCallback(async () => {
    if (!jobId) {
      setLoadError("We couldn't load this job.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const storedAnalysis = await jobService.fetchJobAnalysis(jobId);
      if (!storedAnalysis) {
        setLoadError("This job needs an analysis before building an interview.");
      }
      setAnalysis(storedAnalysis);
    } catch (loadError) {
      setLoadError(getJobErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!generating) return;
    const interval = setInterval(() => {
      setStage((s) => Math.min(s + 1, GENERATION_STAGES.length - 1));
    }, 700);
    return () => clearInterval(interval);
  }, [generating]);

  useEffect(() => {
    return () => {
      const sessionId = previewSessionId.current;
      if (sessionId && sessionId !== startedSessionId.current) {
        void interviewSessionService.abandon(sessionId).catch(() => undefined);
      }
    };
  }, []);

  async function generate(regenerate = false) {
    if (!jobId || generating || starting) return;
    if (Platform.OS === "web") {
      setGenerationError(
        "Voice interviews currently require the Vocara app on iOS or Android.",
      );
      return;
    }
    const requestId =
      regenerate || !generationRequestId.current
        ? randomUUID()
        : generationRequestId.current;
    generationRequestId.current = requestId;
    setGenerationError(null);
    setNeedsReanalysis(false);
    setStage(0);
    setGenerating(true);
    try {
      const result = await jobInterviewService.generateInterview({
        requestId,
        jobDescriptionId: jobId,
        questionCount,
        difficultyMode,
        interviewerStyle,
        sessionDifficulty: sessionDifficulty(),
      });
      await delay(900);
      const previousSessionId = previewSessionId.current;
      if (previousSessionId && previousSessionId !== result.session.id) {
        await interviewSessionService.abandon(previousSessionId).catch(() => undefined);
      }
      previewSessionId.current = result.session.id;
      setGenerated(result);
    } catch (error) {
      setGenerationError(getJobInterviewErrorMessage(error));
      setNeedsReanalysis(
        error instanceof JobServiceError && error.code === "job_analysis_required",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function refreshAnalysis() {
    if (!jobId || refreshingAnalysis) return;
    setRefreshingAnalysis(true);
    setGenerationError(null);
    try {
      await jobService.analyzeJob(jobId);
      const refreshed = await jobService.fetchJobAnalysis(jobId);
      if (!refreshed) throw new Error("The refreshed analysis is unavailable.");
      setAnalysis(refreshed);
      setNeedsReanalysis(false);
      generationRequestId.current = null;
    } catch (error) {
      setGenerationError(getJobErrorMessage(error));
    } finally {
      setRefreshingAnalysis(false);
    }
  }

  async function startInterview() {
    if (!generated || starting || !user) return;
    setStarting(true);
    setGenerationError(null);
    try {
      const nextSession = startInterviewSession({
        id: generated.session.id,
        role: generated.session.role,
        type: "job_specific",
        difficulty: generated.session.difficulty,
        interviewerStyle: generated.session.interviewerStyle,
        length: "standard",
        totalQuestions: generated.questions.length,
        questions: generated.questions.map((question) => question.questionText),
        questionIds: generated.questions.map((question) => question.id),
      });
      await interviewSessionService.ensureCreated(nextSession, user.id);
      startedSessionId.current = generated.session.id;
      router.replace({ pathname: "/interview/session", params: { id: nextSession.id } } as Href);
    } catch (error) {
      setGenerationError(
        getJobInterviewErrorMessage(error),
      );
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <ScreenHeader />
        <Text style={styles.centerText}>Loading job analysis…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>
          {generated ? "Your interview is ready" : "Build your interview"}
        </Text>
        <Text style={styles.subtitle}>
          {generated
            ? "Review the questions, then start when you're ready."
            : "Tune the interview, then generate questions tailored to this job."}
        </Text>

        {loadError && (
          <View style={styles.loadErrorCard}>
            <Text style={styles.errorText}>{loadError}</Text>
            <PrimaryButton label="Try again" onPress={() => void load()} />
          </View>
        )}

        {!loadError && !generated && (
          <Animated.View entering={FadeInDown.duration(320)}>
            <Text style={styles.sectionLabel}>Number of questions</Text>
            <Segmented
              options={QUESTION_COUNT_OPTIONS.map(String)}
              value={String(questionCount)}
              onChange={(label) => setQuestionCount(Number(label))}
            />

            <Text style={styles.sectionLabel}>Compared to the role</Text>
            <View style={styles.typeList}>
              {(Object.keys(DIFFICULTY_MODE_LABELS) as DifficultyMode[]).map((mode) => {
                const selected = mode === difficultyMode;
                const difficultyOf = computeDifficultyOf(mode, analysis);
                return (
                  <PressableScale
                    key={mode}
                    onPress={() => setDifficultyMode(mode)}
                    accessibilityLabel={DIFFICULTY_MODE_LABELS[mode]}
                    style={styles.typeRowWrap}
                  >
                    <View style={[styles.typeRow, selected && styles.rowSelected]}>
                      <View style={styles.typeText}>
                        <Text style={[styles.typeTitle, selected && styles.typeTitleSelected]}>
                          {DIFFICULTY_MODE_LABELS[mode]}
                        </Text>
                        <Text style={styles.typeDescription}>
                          {mode === "match"
                            ? `Matches the seniority level of this job (${DIFFICULTY_LABELS[difficultyOf]}).`
                            : mode === "easier"
                              ? `One step below what this role usually gets (${DIFFICULTY_LABELS[difficultyOf]}).`
                              : `One step above what this role usually gets (${DIFFICULTY_LABELS[difficultyOf]}).`}
                        </Text>
                      </View>
                      <View style={[styles.radio, selected && styles.radioOn]}>
                        {selected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                      </View>
                    </View>
                  </PressableScale>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>Interviewer style</Text>
            <Segmented
              options={["Supportive", "Balanced", "Challenging"]}
              value={STYLE_LABELS[interviewerStyle]}
              onChange={(label) => {
                const next = (Object.keys(STYLE_LABELS) as InterviewerStyle[]).find(
                  (value) => STYLE_LABELS[value] === label,
                );
                if (next) setInterviewerStyle(next);
              }}
            />

            <View style={styles.ctaWrap}>
              <PrimaryButton
                label={
                  refreshingAnalysis
                    ? "Refreshing analysis…"
                    : needsReanalysis
                      ? "Refresh job analysis"
                      : "Generate interview"
                }
                onPress={() =>
                  needsReanalysis ? void refreshAnalysis() : void generate()
                }
                disabled={generating || refreshingAnalysis}
              />
              {generationError && <Text style={styles.errorText}>{generationError}</Text>}
            </View>
          </Animated.View>
        )}

        {generated && (
          <Animated.View entering={FadeInDown.duration(320)}>
            <View style={styles.heroCard}>
              <Text style={styles.heroRole}>{generated.session.role}</Text>
              <View style={styles.heroChips}>
                <HeroChip
                  icon="speedometer-outline"
                  label={DIFFICULTY_LABELS[generated.session.difficulty]}
                />
                <HeroChip
                  icon="person-outline"
                  label={STYLE_LABELS[generated.session.interviewerStyle]}
                />
                <HeroChip icon="list-outline" label={`${generated.questions.length} questions`} />
              </View>
            </View>

            <Text style={styles.sectionLabel}>Questions</Text>
            <View style={styles.questionList}>
              {generated.questions.map((question) => (
                <View key={question.id} style={styles.questionCard}>
                  <View style={styles.questionHeader}>
                    <View style={styles.questionBadge}>
                      <Text style={styles.questionBadgeText}>{question.questionNumber}</Text>
                    </View>
                    <View style={styles.questionMeta}>
                      <Text style={styles.questionType}>{question.questionType}</Text>
                      <Text style={styles.questionDifficulty}>
                        {question.difficulty}
                        {question.focusArea ? ` · ${question.focusArea}` : ""}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.questionText}>{question.questionText}</Text>
                  <Text style={styles.questionReason}>{question.reason}</Text>
                </View>
              ))}
            </View>

            <View style={styles.ctaWrap}>
              <PrimaryButton
                label="Start interview"
                onPress={startInterview}
                disabled={starting}
              />
              {generationError && <Text style={styles.errorText}>{generationError}</Text>}
            </View>
            <View style={styles.secondaryRow}>
              <PressableScale
                onPress={() => void generate(true)}
                disabled={generating || starting}
                accessibilityLabel="Regenerate questions"
                style={styles.secondaryButton}
              >
                <Ionicons name="refresh" size={15} color={colors.accentDark} />
                <Text style={styles.secondaryLabel}>Regenerate</Text>
              </PressableScale>
              <PressableScale
                onPress={() => {
                  const sessionId = previewSessionId.current;
                  previewSessionId.current = null;
                  if (sessionId) {
                    void interviewSessionService.abandon(sessionId).catch(() => undefined);
                  }
                  setGenerated(null);
                  setGenerationError(null);
                  setNeedsReanalysis(false);
                  generationRequestId.current = null;
                }}
                disabled={generating || starting}
                accessibilityLabel="Edit settings"
                style={styles.secondaryButton}
              >
                <Ionicons name="options-outline" size={15} color={colors.accentDark} />
                <Text style={styles.secondaryLabel}>Edit settings</Text>
              </PressableScale>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {generating && (
        <View style={styles.generateOverlay}>
          <LiveWaveform active barCount={26} height={52} intensity={0.9} />
          <Animated.Text
            key={`stage-${stage}`}
            entering={FadeInDown.duration(300)}
            style={styles.stageText}
          >
            {GENERATION_STAGES[stage]}
          </Animated.Text>
        </View>
      )}
    </View>
  );
}

function ScreenHeader() {
  return (
    <View style={styles.header}>
      <BackButton onPress={() => router.back()} />
    </View>
  );
}

function HeroChip({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.heroChip}>
      <Ionicons name={icon} size={12} color={colors.accentDark} />
      <Text style={styles.heroChipText}>{label}</Text>
    </View>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (label: string) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <PressableScale
            key={option}
            onPress={() => onChange(option)}
            accessibilityLabel={option}
            style={[styles.segmentWrap, selected && styles.segSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {option}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

function computeDifficultyOf(mode: DifficultyMode, analysis: JobAnalysis | null): Difficulty {
  const base =
    SENIORITY_DIFFICULTY[analysis?.seniorityLevel ?? "mid"] ?? ("intermediate" as Difficulty);
  return adjustDifficulty(base, mode);
}

function adjustDifficulty(base: Difficulty, mode: DifficultyMode): Difficulty {
  const order: Difficulty[] = ["beginner", "intermediate", "advanced"];
  const index = order.indexOf(base);
  if (mode === "easier") return order[Math.max(0, index - 1)];
  if (mode === "harder") return order[Math.min(order.length - 1, index + 1)];
  return base;
}

async function delay(milliseconds: number) {
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
  centerText: {
    fontSize: 14.5,
    color: colors.secondary,
    paddingHorizontal: 20,
    marginTop: 24,
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
  sectionLabel: {
    marginTop: 26,
    marginBottom: 12,
    fontSize: 12.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 4,
    gap: 4,
    flexWrap: "wrap",
  },
  segmentWrap: {
    flexGrow: 1,
    flexBasis: "20%",
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.secondary,
    textAlign: "center",
  },
  segmentTextSelected: {
    color: "#FFFFFF",
  },
  segSelected: {
    backgroundColor: colors.accent,
    borderRadius: 10,
  },
  typeList: {
    gap: 10,
  },
  typeRowWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  rowSelected: {
    borderColor: colors.accent,
    backgroundColor: "#FBEEE9",
  },
  typeText: {
    flex: 1,
  },
  typeTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
  },
  typeTitleSelected: {
    color: colors.ink,
  },
  typeDescription: {
    fontSize: 13,
    lineHeight: 18.5,
    color: colors.secondary,
    marginTop: 3,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  ctaWrap: {
    marginTop: 30,
    marginBottom: 10,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 12,
  },
  loadErrorCard: {
    gap: 16,
    marginTop: 18,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 18,
    marginTop: 18,
  },
  heroRole: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  heroChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FBEEE9",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroChipText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.accentDark,
  },
  questionList: {
    gap: 12,
  },
  questionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
  },
  questionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  questionBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  questionBadgeText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  questionMeta: {
    flex: 1,
  },
  questionType: {
    fontSize: 12.5,
    fontWeight: "800",
    textTransform: "capitalize",
    color: colors.accentDark,
  },
  questionDifficulty: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "capitalize",
    marginTop: 1,
  },
  questionText: {
    fontSize: 15,
    lineHeight: 21.5,
    fontWeight: "600",
    color: colors.ink,
  },
  questionReason: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
    marginTop: 8,
  },
  secondaryRow: {
    flexDirection: "row",
    gap: 10,
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
  generateOverlay: {
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

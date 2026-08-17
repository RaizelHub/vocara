import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  Alert,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AttemptFeedbackCard } from "@/components/speaking/AttemptFeedbackCard";
import { LiveWaveform } from "@/components/interview/LiveWaveform";
import { PressableScale } from "@/components/ui/PressableScale";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { getRecorderErrorMessage, useAnswerRecorder } from "@/hooks/useAnswerRecorder";
import { isAuthenticationError } from "@/lib/dataErrors";
import { useAuth } from "@/providers/AuthProvider";
import {
  AudioUploadError,
  audioUploadRequiresAuthentication,
  canRetryAudioUpload,
  audioService,
  getAudioUploadErrorMessage,
  type UploadedAnswerAudio,
} from "@/services/audioService";
import {
  canRetrySpeakingStep,
  getSpeakingStepMessage,
  SpeakingStepError,
  speakingService,
  speakingStepRequiresAuthentication,
  speakingStepRequiresReRecord,
} from "@/services/speakingService";
import { colors } from "@/theme/colors";
import {
  SPEAKING_CATEGORY_LABELS,
  SPEAKING_DIFFICULTY_LABELS,
  type SpeakingAttemptRecord,
  type SpeakingAttemptResult,
  type SpeakingEvaluationResult,
  type SpeakingSessionPayload,
} from "@/types/speaking";

const MAX_ATTEMPTS_PER_SESSION = 10;

type Phase = "loading" | "ready" | "recording" | "processing" | "feedback";
type ProcessingStage = "upload" | "transcription" | "evaluation";
type SessionSummary = SpeakingSessionPayload["session"];

type Failure = {
  stage: "upload" | "transcription" | "evaluation" | "reserve";
  message: string;
  retryable: boolean;
  reRecord?: boolean;
  requiresAuth?: boolean;
  code?: string;
};

type SessionState = {
  phase: Phase;
  session: SessionSummary | null;
  attempts: SpeakingAttemptResult[];
  currentAttempt: SpeakingAttemptRecord | null;
  evaluation: SpeakingEvaluationResult | null;
  stage: ProcessingStage | null;
  failure: Failure | null;
  limitSeconds: number;
};

type SessionAction =
  | { type: "loaded"; session: SessionSummary; attempts: SpeakingAttemptResult[] }
  | { type: "ready"; attempt: SpeakingAttemptRecord | null; limitSeconds: number }
  | { type: "recording" }
  | { type: "processing"; stage: ProcessingStage }
  | { type: "attached"; attempt: SpeakingAttemptRecord }
  | { type: "feedback"; evaluation: SpeakingEvaluationResult; attempts: SpeakingAttemptResult[] }
  | { type: "failure"; failure: Failure }
  | { type: "clear-failure" };

function initialState(): SessionState {
  return {
    phase: "loading",
    session: null,
    attempts: [],
    currentAttempt: null,
    evaluation: null,
    stage: null,
    failure: null,
    limitSeconds: 90,
  };
}

function reducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "loaded":
      return { ...state, phase: "ready", session: action.session, attempts: action.attempts };
    case "ready":
      return {
        ...state,
        phase: "ready",
        currentAttempt: action.attempt,
        evaluation: null,
        failure: null,
        limitSeconds: action.limitSeconds,
      };
    case "recording":
      return { ...state, phase: "recording", failure: null };
    case "processing":
      return { ...state, phase: "processing", stage: action.stage, failure: null };
    case "attached":
      return { ...state, currentAttempt: action.attempt };
    case "feedback":
      return {
        ...state,
        phase: "feedback",
        evaluation: action.evaluation,
        attempts: action.attempts,
        failure: null,
        stage: null,
      };
    case "failure":
      return { ...state, phase: "ready", failure: action.failure };
    case "clear-failure":
      return { ...state, failure: null };
    default:
      return state;
  }
}

function failureFor(error: unknown, stage: Failure["stage"], code?: string): Failure {
  if (error instanceof AudioUploadError) {
    return {
      stage,
      message: getAudioUploadErrorMessage(error),
      retryable: canRetryAudioUpload(error),
      reRecord: ["path_conflict"].includes(error.code),
      requiresAuth: audioUploadRequiresAuthentication(error) || isAuthenticationError(error),
      code: error.code,
    };
  }
  if (error instanceof SpeakingStepError) {
    return {
      stage,
      message: getSpeakingStepMessage(error),
      retryable: canRetrySpeakingStep(error),
      reRecord: speakingStepRequiresReRecord(error),
      requiresAuth: speakingStepRequiresAuthentication(error) || isAuthenticationError(error),
      code: error.code,
    };
  }
  return {
    stage,
    message: isAuthenticationError(error)
      ? "Your session expired. Sign in again before retrying."
      : "Something went wrong while processing your recording.",
    retryable: true,
    requiresAuth: isAuthenticationError(error),
    code,
  };
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function SpeakingSessionScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ sessionId: string }>();
  const recorder = useAnswerRecorder();
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const busyRef = useRef(false);

  const loadSession = useCallback(async () => {
    if (!params.sessionId) {
      router.replace("/speaking");
      return;
    }
    try {
      const payload = await speakingService.fetchSession(params.sessionId);
      if (payload.session.status === "completed") {
        router.replace({
          pathname: "/speaking/results",
          params: { sessionId: payload.session.id },
        });
        return;
      }
      const attempts = payload.attempts;
      const last = attempts.at(-1);
      if (last && last.evaluationStatus === "completed") {
        dispatch({ type: "loaded", session: payload.session, attempts });
        dispatch({
          type: "feedback",
          evaluation: evaluationFromAttempt(last),
          attempts,
        });
        return;
      }
      if (
        last &&
        last.transcriptionStatus !== "completed" &&
        last.attemptId
      ) {
        await speakingService.closeSession(payload.session.id, "abandoned").catch(() => undefined);
      }
      dispatch({ type: "loaded", session: payload.session, attempts });
      dispatch({ type: "ready", attempt: null, limitSeconds: payload.session.timeLimitSeconds });
    } catch (error) {
      dispatch({
        type: "failure",
        failure: {
          stage: "reserve",
          message: isAuthenticationError(error)
            ? "Your session expired. Sign in again."
            : "We couldn't load this practice session.",
          retryable: !isAuthenticationError(error),
          requiresAuth: isAuthenticationError(error),
        },
      });
    }
  }, [params.sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const finishSession = useCallback(
    async (status: "completed" | "abandoned", next: () => void) => {
      const session = stateRef.current.session;
      if (session) {
        await speakingService.closeSession(session.id, status).catch(() => undefined);
      }
      next();
    },
    [],
  );

  const handleBack = useCallback(() => {
    const session = stateRef.current.session;
    if (!session) {
      router.replace("/speaking");
      return true;
    }
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Leave this practice session?")) {
        void finishSession("abandoned", () => router.replace("/speaking"));
      }
      return true;
    }
    void new Promise<boolean>((resolve) => {
      Alert.alert(
        "Leave this practice?",
        "Your progress so far is saved. You can finish a new session anytime.",
        [
          { text: "Keep practicing", style: "cancel", onPress: () => resolve(false) },
          {
            text: "Leave",
            style: "destructive",
            onPress: () => {
              void finishSession("abandoned", () => {
                resolve(true);
                router.replace("/speaking");
              });
            },
          },
        ],
      );
    });
    return true;
  }, [finishSession]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", handleBack);
    return () => subscription.remove();
  }, [handleBack]);

  const startRecording = useCallback(async () => {
    const session = stateRef.current.session;
    if (!session || busyRef.current) return;
    busyRef.current = true;
    try {
      await recorder.discardRecording();
      dispatch({ type: "recording" });
      await recorder.startRecording();
    } catch (error) {
      dispatch({
        type: "failure",
        failure: {
          stage: "reserve",
          message: getRecorderErrorMessage(error),
          retryable: true,
          requiresAuth: isAuthenticationError(error),
        },
      });
    } finally {
      busyRef.current = false;
    }
  }, [recorder]);

  const runPipeline = useCallback(async () => {
    const session = stateRef.current.session;
    const recording = recorder.recording;
    if (!session || !recording || busyRef.current || !user) return;
    busyRef.current = true;
    let attempt: SpeakingAttemptRecord | null = null;
    try {
      dispatch({ type: "processing", stage: "upload" });
      attempt = await speakingService.reserveAttempt(session.id, user.id);
      const path = audioService.createSpeakingAttemptPath(user.id, session.id, attempt.id);
      const uploaded = await audioService.uploadSpeakingAudio({
        localUri: recording.uri,
        audioPath: path,
      });
      await speakerAttach(attempt, uploaded, recording.durationSeconds);

      dispatch({ type: "processing", stage: "transcription" });
      await speakingService.transcribeAttempt(attempt.id);

      dispatch({ type: "processing", stage: "evaluation" });
      const evaluation = await speakingService.evaluateAttempt(attempt.id);

      const payload = await speakingService.fetchSession(session.id);
      const attempts = payload.attempts;
      const last = attempts.at(-1);
      const finalEvaluation =
        last && last.evaluationStatus === "completed" && last.score !== null
          ? evaluationFromAttempt(last)
          : evaluation;
      dispatch({ type: "feedback", evaluation: finalEvaluation, attempts });
    } catch (error) {
      dispatch({
        type: "failure",
        failure: failureFor(error, attempt ? "transcription" : "upload"),
      });
    } finally {
      busyRef.current = false;
    }
  }, [recorder.recording, user]);

  const retryCurrent = useCallback(() => {
    dispatch({ type: "clear-failure" });
    void runPipeline();
  }, [runPipeline]);

  const reRecord = useCallback(() => {
    dispatch({ type: "clear-failure" });
    void recorder.discardRecording();
    dispatch({ type: "ready", attempt: null, limitSeconds: stateRef.current.limitSeconds });
  }, [recorder]);

  const practiceAgain = useCallback(async () => {
    const session = stateRef.current.session;
    const attemptCount = stateRef.current.attempts.length;
    if (!session || !user) return;
    if (attemptCount >= MAX_ATTEMPTS_PER_SESSION) {
      await finishSession("completed", () =>
        router.replace({
          pathname: "/speaking/results",
          params: { sessionId: session.id },
        }),
      );
      return;
    }
    try {
      const attempt = await speakingService.reserveAttempt(session.id, user.id);
      dispatch({ type: "ready", attempt, limitSeconds: session.timeLimitSeconds });
    } catch (error) {
      if (error instanceof Error && /SPEAKING_ATTEMPT_LIMIT/.test(error.message)) {
        await finishSession("completed", () =>
          router.replace({
            pathname: "/speaking/results",
            params: { sessionId: session.id },
          }),
        );
        return;
      }
      dispatch({
        type: "failure",
        failure: failureFor(error, "reserve"),
      });
    }
  }, [finishSession, user]);

  const finishToResults = useCallback(() => {
    const session = stateRef.current.session;
    if (!session) return;
    void finishSession("completed", () =>
      router.replace({
        pathname: "/speaking/results",
        params: { sessionId: session.id },
      }),
    );
  }, [finishSession]);

  const limitSeconds = state.limitSeconds;
  const remaining = Math.max(0, limitSeconds - recorder.durationSeconds);
  const wrapUpHint = recorder.isRecording && remaining <= 10 && remaining > 0;
  const seconds = recorder.durationSeconds;

  const renderHeader = (title: string) => (
    <View style={styles.header}>
      <PressableScale onPress={() => handleBack()} accessibilityLabel="Leave practice">
        <Ionicons name="chevron-back" size={24} color={colors.ink} />
      </PressableScale>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (state.phase === "loading") {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        {renderHeader("Speaking practice")}
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Preparing your prompt…</Text>
        </View>
      </View>
    );
  }

  if (state.failure?.requiresAuth) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        {renderHeader("Speaking practice")}
        <View style={styles.centered}>
          <Text style={styles.failureTitle}>Sign in again</Text>
          <Text style={styles.failureMessage}>{state.failure.message}</Text>
          <View style={styles.failureAction}>
            <PrimaryButton label="Back to home" onPress={() => router.replace("/(tabs)/home")} />
          </View>
        </View>
      </View>
    );
  }

  const session = state.session;

  if (!session) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        {renderHeader("Speaking practice")}
        <View style={styles.centered}>
          <Text style={styles.failureTitle}>Session unavailable</Text>
          <Text style={styles.failureMessage}>We could not find this practice session.</Text>
          <View style={styles.failureAction}>
            <PrimaryButton label="Browse prompts" onPress={() => router.replace("/speaking")} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <StatusBar style="dark" />
      {renderHeader("Speaking practice")}

      {state.phase === "recording" && (
        <View style={styles.recordingWrap}>
          <View style={styles.recordingRow}>
            <View style={styles.dot} />
            <Text style={styles.recLabel}>Recording</Text>
          </View>
          <Text style={styles.timer}>{formatTime(seconds)}</Text>
          <View style={styles.limitRow}>
            <Text style={[styles.limitText, remaining <= 10 && styles.limitTextWarn]}>
              {remaining > 0 ? `${remaining}s left` : "Time limit reached"}
            </Text>
          </View>
          <LiveWaveform active barCount={22} height={44} intensity={1.1} />
          {wrapUpHint && <Text style={styles.hint}>Try wrapping up your answer.</Text>}
          <View style={styles.controlsRow}>
            <PressableScale
              onPress={() => void recorder.discardRecording().then(reRecord)}
              accessibilityLabel="Restart recording"
              style={styles.ghostWrap}
            >
              <Text style={styles.ghost}>Restart</Text>
            </PressableScale>
            <PressableScale
              onPress={() => void recorder.stopRecording().then(() => void runPipeline())}
              accessibilityLabel="Finish recording"
              style={styles.primaryWrap}
            >
              <Text style={styles.primary}>Finish answer</Text>
            </PressableScale>
          </View>
        </View>
      )}

      {(state.phase === "ready" || state.phase === "processing") && (
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
            {session.promptTip ? (
              <View style={styles.tipRow}>
                <Ionicons name="bulb-outline" size={15} color={colors.warning} />
                <Text style={styles.tipText}>{session.promptTip}</Text>
              </View>
            ) : null}
            <Text style={styles.limitHint}>
              Aim for under {session.timeLimitSeconds} seconds.
            </Text>
          </View>

          {state.failure && (
            <View style={styles.failureCard}>
              <Text style={styles.failureTitleSmall}>{failureStageTitle(state.failure.stage)}</Text>
              <Text style={styles.failureMessage}>{state.failure.message}</Text>
              <View style={styles.failureActions}>
                {state.failure.reRecord ? (
                  <View style={styles.failureActionRow}>
                    <PressableScale onPress={reRecord} style={styles.failureGhostWrap}>
                      <Text style={styles.failureGhost}>Record again</Text>
                    </PressableScale>
                    <PressableScale onPress={finishToResults} style={styles.failurePrimaryWrap}>
                      <Text style={styles.failurePrimary}>Finish practice</Text>
                    </PressableScale>
                  </View>
                ) : state.failure.retryable ? (
                  <View style={styles.failureActionRow}>
                    <PressableScale onPress={finishToResults} style={styles.failureGhostWrap}>
                      <Text style={styles.failureGhost}>Finish practice</Text>
                    </PressableScale>
                    <PressableScale onPress={retryCurrent} style={styles.failurePrimaryWrap}>
                      <Text style={styles.failurePrimary}>Try again</Text>
                    </PressableScale>
                  </View>
                ) : (
                  <PrimaryButton label="Finish practice" onPress={finishToResults} />
                )}
              </View>
            </View>
          )}

          {state.phase === "processing" && (
            <View style={styles.processingWrap}>
              <LiveWaveform active barCount={20} height={34} intensity={0.5} />
              <Text style={styles.processingLabel}>
                {processingLabel(state.stage)}
              </Text>
              {state.attempts.length > 0 && (
                <Text style={styles.processingNote}>
                  Attempt {state.attempts.length + 1} of {MAX_ATTEMPTS_PER_SESSION}
                </Text>
              )}
            </View>
          )}

          {state.phase === "ready" && (
            <View style={styles.primaryWrap}>
              <PrimaryButton
                label={state.currentAttempt ? "Start attempt" : "Start recording"}
                onPress={() => void startRecording()}
              />
              {state.attempts.length > 0 && (
                <PressableScale onPress={finishToResults} accessibilityLabel="Finish practice">
                  <Text style={styles.finishLink}>Finish practice</Text>
                </PressableScale>
              )}
            </View>
          )}
        </Animated.ScrollView>
      )}

      {state.phase === "feedback" && state.evaluation && (
        <Animated.ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          entering={FadeInDown.delay(0).duration(320)}
        >
          <View style={styles.completeBadge}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.completeText}>Attempt evaluated</Text>
          </View>
          <AttemptFeedbackCard
            attempt={attemptFromEvaluation(state.evaluation, state.attempts)}
            previousScore={previousScore(state.attempts)}
          />
          <View style={styles.actionsBlock}>
            {state.attempts.length < MAX_ATTEMPTS_PER_SESSION ? (
              <PrimaryButton label="Practice again" onPress={() => void practiceAgain()} />
            ) : (
              <PrimaryButton label="Finish practice" onPress={finishToResults} />
            )}
            <PressableScale onPress={finishToResults} accessibilityLabel="Finish practice">
              <Text style={styles.finishLink}>Finish practice</Text>
            </PressableScale>
          </View>
        </Animated.ScrollView>
      )}
    </View>
  );
}

function evaluationFromAttempt(attempt: SpeakingAttemptResult): SpeakingEvaluationResult {
  return {
    attemptId: attempt.attemptId,
    overallScore: attempt.score ?? 0,
    scores: attempt.scores ?? {
      clarity: 0,
      fluency: 0,
      grammar: 0,
      vocabulary: 0,
      structure: 0,
      conciseness: 0,
    },
    summary: attempt.summary ?? "",
    strengths: attempt.strengths,
    improvements: attempt.improvements,
    grammarCorrections: attempt.grammarCorrections,
    naturalPhrasing: attempt.naturalPhrasing,
    betterVersion: attempt.betterVersion ?? "",
    fillerWords: attempt.fillerWords,
    feedbackStatus: "completed",
  };
}

function attemptFromEvaluation(
  evaluation: SpeakingEvaluationResult,
  attempts: SpeakingAttemptResult[],
): SpeakingAttemptResult {
  const stored = attempts.find((entry) => entry.attemptId === evaluation.attemptId);
  if (stored) return stored;
  return {
    attemptNumber: attempts.length + 1,
    attemptId: evaluation.attemptId,
    transcript: null,
    durationSeconds: null,
    wordCount: null,
    speakingPace: null,
    transcriptionStatus: "completed",
    evaluationStatus: "completed",
    score: evaluation.overallScore,
    scores: evaluation.scores,
    summary: evaluation.summary,
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
    grammarCorrections: evaluation.grammarCorrections,
    naturalPhrasing: evaluation.naturalPhrasing,
    betterVersion: evaluation.betterVersion,
    fillerWords: evaluation.fillerWords,
  };
}

function previousScore(attempts: SpeakingAttemptResult[]) {
  const evaluated = attempts.filter(
    (entry) => entry.evaluationStatus === "completed" && entry.score !== null,
  );
  const last = evaluated.at(-1);
  return last?.score ?? null;
}

function failureStageTitle(stage: Failure["stage"]) {
  switch (stage) {
    case "upload":
      return "Couldn't upload your recording";
    case "transcription":
      return "Couldn't create the transcript";
    case "evaluation":
      return "Couldn't generate feedback";
    default:
      return "Something went wrong";
  }
}

function processingLabel(stage: ProcessingStage | null) {
  switch (stage) {
    case "upload":
      return "Uploading your recording…";
    case "transcription":
      return "Creating your transcript…";
    case "evaluation":
      return "Coaching your answer…";
    default:
      return "Processing your recording…";
  }
}

async function speakerAttach(
  attempt: SpeakingAttemptRecord,
  uploaded: UploadedAnswerAudio,
  durationSeconds: number,
) {
  await speakingService.attachAudio({
    attemptId: attempt.id,
    audioPath: uploaded.path,
    durationSeconds,
    mimeType: uploaded.mimeType,
    sizeBytes: uploaded.sizeBytes,
  });
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
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 44,
  },
  loadingText: {
    fontSize: 15.5,
    fontWeight: "700",
    color: colors.secondary,
  },
  failureTitle: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
    textAlign: "center",
  },
  failureTitleSmall: {
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  failureMessage: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.secondary,
    textAlign: "center",
  },
  failureAction: {
    alignSelf: "stretch",
    marginTop: 24,
  },
  promptCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginTop: 14,
  },
  promptTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
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
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: colors.ink,
  },
  tipRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    marginTop: 14,
  },
  tipText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.secondary,
  },
  limitHint: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
  },
  recordingWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 44,
  },
  recordingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.accent,
  },
  recLabel: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.muted,
  },
  timer: {
    textAlign: "center",
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1,
    color: colors.ink,
    marginTop: 10,
    marginBottom: 4,
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  limitRow: {
    alignItems: "center",
    marginBottom: 12,
  },
  limitText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
  limitTextWarn: {
    color: colors.warning,
  },
  hint: {
    textAlign: "center",
    fontSize: 13.5,
    fontWeight: "600",
    color: colors.warning,
    marginTop: 12,
    marginBottom: -4,
  },
  controlsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
  },
  ghostWrap: {
    flex: 1,
  },
  ghost: {
    textAlign: "center",
    height: 56,
    lineHeight: 56,
    includeFontPadding: false,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.secondary,
    fontSize: 15.5,
    fontWeight: "800",
  },
  primaryWrap: {
    flex: 2,
  },
  primary: {
    textAlign: "center",
    height: 56,
    lineHeight: 56,
    includeFontPadding: false,
    borderRadius: 28,
    backgroundColor: colors.accent,
    color: "#FFFFFF",
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  processingWrap: {
    alignItems: "center",
    gap: 14,
    marginTop: 34,
  },
  processingLabel: {
    fontSize: 15.5,
    fontWeight: "800",
    color: colors.ink,
  },
  processingNote: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  failureCard: {
    backgroundColor: "#FFEFEA",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F5C9BC",
    padding: 16,
    marginTop: 18,
    gap: 6,
  },
  failureActions: {
    marginTop: 8,
  },
  failureActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  failureGhostWrap: {
    flex: 1,
  },
  failureGhost: {
    textAlign: "center",
    height: 48,
    lineHeight: 48,
    includeFontPadding: false,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F5C9BC",
    color: colors.accentDark,
    fontSize: 14.5,
    fontWeight: "800",
  },
  failurePrimaryWrap: {
    flex: 1,
  },
  failurePrimary: {
    textAlign: "center",
    height: 48,
    lineHeight: 48,
    includeFontPadding: false,
    borderRadius: 24,
    backgroundColor: colors.accent,
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "800",
  },
  completeBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    marginBottom: 14,
  },
  completeText: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.success,
  },
  actionsBlock: {
    marginTop: 26,
    gap: 12,
  },
  finishLink: {
    textAlign: "center",
    fontSize: 15,
    fontWeight: "800",
    color: colors.accent,
    paddingVertical: 8,
  },
});
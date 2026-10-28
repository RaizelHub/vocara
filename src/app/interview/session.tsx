import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  BackHandler,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeIn, FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InterviewExitModal } from "@/components/interview/InterviewExitModal";
import { AnswerFeedback } from "@/components/interview/AnswerFeedback";
import { InterviewProgress } from "@/components/interview/InterviewProgress";
import { InterviewerVoice } from "@/components/interview/InterviewerVoice";
import { LiveWaveform } from "@/components/interview/LiveWaveform";
import { MicrophonePermissionState } from "@/components/interview/MicrophonePermissionState";
import { ProcessingAnswer } from "@/components/interview/ProcessingAnswer";
import { QuestionCard } from "@/components/interview/QuestionCard";
import { RecordedAnswer } from "@/components/interview/RecordedAnswer";
import { RecordingControls } from "@/components/interview/RecordingControls";
import { ThinkTimer } from "@/components/interview/ThinkTimer";
import { TranscriptPreview } from "@/components/interview/TranscriptPreview";
import { PressableScale } from "@/components/ui/PressableScale";
import { ErrorState, LoadingState } from "@/components/ui/DataState";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { planInterviewRecovery, recoverySession, type InterviewRecovery } from "@/lib/interviewRecovery";
import {
  getRecorderErrorMessage,
  MicrophonePermissionError,
  useAnswerRecorder,
} from "@/hooks/useAnswerRecorder";
import { getDataErrorMessage, isAuthenticationError } from "@/lib/dataErrors";
import { createVerifiedAudioUpload } from "@/lib/verifiedAudioUpload";
import { useAuth } from "@/providers/AuthProvider";
import {
  audioUploadRequiresAuthentication,
  canRetryAudioUpload,
  audioService,
  getAudioUploadErrorMessage,
} from "@/services/audioService";
import {
  canRetryEvaluation,
  EvaluationError,
  evaluationRequiresAuthentication,
  evaluationService,
  getEvaluationErrorMessage,
  type AnswerEvaluationResult,
} from "@/services/evaluationService";
import {
  canRetryFinalization,
  FinalizationError,
  finalizationRequiresAuthentication,
  finalizationService,
  getFinalizationErrorMessage,
} from "@/services/finalizationService";
import { interviewAnswerService } from "@/services/interviewAnswerService";
import { interviewSessionService } from "@/services/interviewSessionService";
import {
  canRetryTranscription,
  getTranscriptionErrorMessage,
  transcriptionService,
  TranscriptionError,
  transcriptionRequiresAuthentication,
  type TranscriptionResult,
} from "@/services/transcriptionService";
import { getInterviewSession, resetInterviewSession } from "@/state/session";
import { colors } from "@/theme/colors";
import type { InterviewAnswerRecord } from "@/types/database";
import {
  THINK_SECONDS,
  WRAP_UP_AFTER_SECONDS,
  type SessionState,
  type InterviewSession,
} from "@/types/interview";

const SERVICE_CONFIGURATION_ERRORS = new Set(["EVALUATION_NOT_CONFIGURED", "GROQ_MODEL_UNAVAILABLE", "GROQ_BUDGET_LIMIT"]);

type FailureStage =
  | "permission"
  | "recording"
  | "upload"
  | "transcription"
  | "evaluation"
  | "finalization"
  | "completion";

type RoomFailure = {
  stage: FailureStage;
  message: string;
  canAskAgain?: boolean;
  retryable?: boolean;
  requiresAuth?: boolean;
  code?: string;
};

type RoomState = {
  phase: SessionState;
  index: number;
  countdown: number | null;
  answer: InterviewAnswerRecord | null;
  audioPath: string | null;
  transcript: TranscriptionResult | null;
  evaluation: AnswerEvaluationResult | null;
  failure: RoomFailure | null;
};

type RoomAction =
  | {
      type: "transition";
      phase: SessionState;
      values?: Partial<Omit<RoomState, "phase">>;
    }
  | { type: "countdown"; value: number | null }
  | { type: "next" };

function createInitialState(index = 0): RoomState {
  return {
    phase: "question",
    index,
    countdown: null,
    answer: null,
    audioPath: null,
    transcript: null,
    evaluation: null,
    failure: null,
  };
}

function roomReducer(state: RoomState, action: RoomAction): RoomState {
  if (action.type === "transition") {
    return { ...state, ...action.values, phase: action.phase };
  }
  if (action.type === "countdown") {
    return { ...state, countdown: action.value };
  }
  return createInitialState(state.index + 1);
}

function evaluationFailureFor(error: unknown): RoomFailure {
  const dailyLimit = error instanceof EvaluationError && error.code === "daily_limit_reached";
  return {
    stage: "evaluation",
    message: dailyLimit
      ? "You've reached today's feedback limit. Your answers are saved — come back tomorrow."
      : getEvaluationErrorMessage(error),
    retryable: canRetryEvaluation(error),
    requiresAuth: evaluationRequiresAuthentication(error) || isAuthenticationError(error),
    code: error instanceof EvaluationError ? error.code : undefined,
  };
}

function finalizationFailureFor(error: unknown): RoomFailure {
  const dailyLimit = error instanceof FinalizationError && error.code === "daily_limit_reached";
  return {
    stage: "finalization",
    message: dailyLimit
      ? "You've reached today's limit for finalizing interviews. Your answers are saved — come back tomorrow."
      : getFinalizationErrorMessage(error),
    retryable: canRetryFinalization(error),
    requiresAuth: finalizationRequiresAuthentication(error) || isAuthenticationError(error),
    code: dailyLimit ? "daily_limit_reached" : undefined,
  };
}

export default function InterviewSessionScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const sessionId = id ?? getInterviewSession()?.id;
  const [data, setData] = useState<InterviewRecovery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    let resumed = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const saved = await interviewSessionService.recover(sessionId);
        if (!active) return;
        if (!saved) throw new Error('No saved interview was found. Return home to start one.');
        const plan = planInterviewRecovery(saved);
        if (plan.kind === 'completed') {
          router.replace({ pathname: '/interview/results', params: { id: saved.session.id } });
          return;
        }
        if (!resumed) {
          await interviewSessionService.resume(saved.session.id);
          resumed = true;
        }
        if (!active) return;
        setData(saved);
        setError(null);
        if (plan.kind === 'waiting') {
          setReady(false);
          setWaiting(plan.message);
          timer = setTimeout(() => void load(), 5000);
        } else {
          setWaiting(null);
          setReady(true);
        }
      } catch (e) {
        if (active) {
          setReady(false);
          setWaiting(null);
          setError(e instanceof Error ? e.message : 'Could not restore your interview. Check your connection and retry.');
        }
      }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [sessionId, retry]);
  const plan = data ? planInterviewRecovery(data) : null;
  if (ready && data && (!sessionId || data.session.id === sessionId) && plan?.kind === 'room') {
    return <InterviewRoom key={data.session.id} session={recoverySession(data)} initialState={plan.state} />;
  }
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
    {error ? <ErrorState title="Resume interview" message={error} onRetry={() => { setError(null); setRetry(n => n + 1); }} />
      : <LoadingState label={waiting ?? 'Restoring saved interview…'} />}
    <PrimaryButton label="Back to home" onPress={() => router.replace('/home')} />
  </View>;
}

function InterviewRoom({ session, initialState }: { session: InterviewSession; initialState: RoomState }) {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [state, dispatch] = useReducer(roomReducer, initialState);
  const [exitVisible, setExitVisible] = useState(false);
  const operationInFlight = useRef(false);
  const screenGeneration = useRef(0);
  const uploadAbortController = useRef<AbortController | null>(null);
  const uploadVerifiedAudio = useRef(createVerifiedAudioUpload(audioService.uploadAnswerAudio));
  const attachmentAttempts = useRef(new Set<string>());
  const {
    recording,
    error: recorderError,
    isRecording,
    durationSeconds,
    startRecording,
    stopRecording,
    discardRecording,
  } = useAnswerRecorder();

  useEffect(() => {
    if (!session) router.replace("/interview/setup");
  }, [session]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setExitVisible(true);
      return true;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    return () => {
      screenGeneration.current += 1;
      uploadAbortController.current?.abort();
    };
  }, []);

  const handleStartRecording = useCallback(async () => {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    dispatch({
      type: "transition",
      phase: "requesting_permission",
      values: { countdown: null, failure: null, transcript: null, audioPath: null },
    });

    try {
      await startRecording();
      dispatch({ type: "transition", phase: "recording", values: { failure: null } });
    } catch (error) {
      const permissionError = error instanceof MicrophonePermissionError;
      dispatch({
        type: "transition",
        phase: "error",
        values: {
          failure: {
            stage: permissionError ? "permission" : "recording",
            message: getRecorderErrorMessage(error),
            canAskAgain: permissionError ? error.canAskAgain : undefined,
          },
        },
      });
    } finally {
      operationInFlight.current = false;
    }
  }, [startRecording]);

  useEffect(() => {
    if (state.phase !== "thinking" || state.countdown === null) return;
    if (state.countdown <= 0) {
      const timer = setTimeout(() => void handleStartRecording(), 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(
      () => dispatch({ type: "countdown", value: state.countdown! - 1 }),
      1000,
    );
    return () => clearTimeout(timer);
  }, [handleStartRecording, state.countdown, state.phase]);

  useEffect(() => {
    if (state.phase === "recording" && recording && !isRecording) {
      dispatch({ type: "transition", phase: "recorded", values: { failure: null } });
    }
  }, [isRecording, recording, state.phase]);

  useEffect(() => {
    if (state.phase !== "recording" || !recorderError || recording) return;
    dispatch({
      type: "transition",
      phase: "error",
      values: {
        failure: { stage: "recording", message: recorderError },
      },
    });
  }, [recorderError, recording, state.phase]);

  useEffect(() => {
    if (state.phase !== "transcribed") return;
    const timer = setTimeout(
      () => dispatch({ type: "transition", phase: "summary" }),
      450,
    );
    return () => clearTimeout(timer);
  }, [state.phase]);

  const handleFinishAnswer = useCallback(async () => {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    try {
      await stopRecording();
      dispatch({ type: "transition", phase: "recorded", values: { failure: null } });
    } catch (error) {
      dispatch({
        type: "transition",
        phase: "error",
        values: {
          failure: { stage: "recording", message: getRecorderErrorMessage(error) },
        },
      });
    } finally {
      operationInFlight.current = false;
    }
  }, [stopRecording]);

  const handleRecordAgain = useCallback(async () => {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    const fallbackPhase: SessionState | null = recording || state.phase === "recording"
      ? "recorded"
      : state.transcript
        ? "summary"
        : null;
    dispatch({
      type: "transition",
      phase: "requesting_permission",
      values: { countdown: null, failure: null },
    });

    try {
      const abandonedAudioPath =
        state.audioPath && state.audioPath !== state.answer?.audio_path
          ? state.audioPath
          : null;
      if (state.phase === "recording" || isRecording) await stopRecording();
      await startRecording();
      if (abandonedAudioPath && !attachmentAttempts.current.has(abandonedAudioPath)) {
        void audioService.deleteAnswerAudio(abandonedAudioPath).catch(() => undefined);
      }
      dispatch({
        type: "transition",
        phase: "recording",
        values: { failure: null, transcript: null, audioPath: null },
      });
    } catch (error) {
      const permissionError = error instanceof MicrophonePermissionError;
      const failure: RoomFailure = {
        stage: permissionError ? "permission" : "recording",
        message: getRecorderErrorMessage(error),
        canAskAgain: permissionError ? error.canAskAgain : undefined,
      };
      dispatch(
        fallbackPhase
          ? {
              type: "transition",
              phase: fallbackPhase,
              values: { failure },
            }
          : {
              type: "transition",
              phase: "error",
              values: { failure },
            },
      );
    } finally {
      operationInFlight.current = false;
    }
  }, [isRecording, recording, startRecording, state.answer, state.audioPath, state.phase, state.transcript, stopRecording]);

  const processRecordedAnswer = useCallback(async () => {
    if (operationInFlight.current || !recording || !session || !user) return;
    operationInFlight.current = true;
    const expectedScreenGeneration = screenGeneration.current;
    const uploadController = new AbortController();
    uploadAbortController.current = uploadController;
    let answer = state.answer;
    let audioPath = state.audioPath;
    let attached = false;
    let evaluating = false;

    dispatch({ type: "transition", phase: "uploading", values: { failure: null } });

    try {
      await interviewSessionService.ensureCreated(session, user.id);
      answer ??= await interviewAnswerService.reserve({
        sessionId: session.id,
        questionId: session.questionIds[state.index],
        userId: user.id,
      });
      audioPath ??= audioService.createAnswerPath(user.id, session.id, answer.id);
      dispatch({
        type: "transition",
        phase: "uploading",
        values: { answer, audioPath },
      });

      const previousRemotePath = answer.audio_path;
      const uploaded = await uploadVerifiedAudio.current({
        localUri: recording.uri,
        audioPath,
        signal: uploadController.signal,
      });
      if (
        uploadController.signal.aborted ||
        screenGeneration.current !== expectedScreenGeneration
      ) {
        // An earlier attach response may have been lost after the server saved it.
        // Only remove an upload that this room has never attempted to attach.
        if (!attachmentAttempts.current.has(uploaded.path)) {
          await audioService.deleteAnswerAudio(uploaded.path).catch(() => undefined);
        }
        return;
      }
      attachmentAttempts.current.add(uploaded.path);
      answer = await interviewAnswerService.attachAudio({
        answerId: answer.id,
        audioPath: uploaded.path,
        durationSeconds: recording.durationSeconds,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
      });
      attached = true;
      if (screenGeneration.current !== expectedScreenGeneration) return;
      dispatch({
        type: "transition",
        phase: "transcribing",
        values: { answer, audioPath, failure: null },
      });

      await discardRecording().catch(() => undefined);
      if (previousRemotePath && previousRemotePath !== audioPath) {
        void audioService.deleteAnswerAudio(previousRemotePath).catch(() => undefined);
      }

      const transcript = await transcriptionService.transcribe(answer.id);
      if (screenGeneration.current !== expectedScreenGeneration) return;
      evaluating = true;
      dispatch({
        type: "transition",
        phase: "evaluating",
        values: { answer, transcript, failure: null },
      });
      const evaluation = await evaluationService.evaluateAnswer(answer.id);
      if (screenGeneration.current === expectedScreenGeneration) {
        dispatch({
          type: "transition",
          phase: "transcribed",
          values: { answer, transcript, evaluation, failure: null },
        });
      }
    } catch (error) {
      if (screenGeneration.current !== expectedScreenGeneration) return;
      dispatch({
        type: "transition",
        phase: "error",
        values: {
          answer,
          audioPath,
          failure: attached
            ? evaluating
              ? evaluationFailureFor(error)
              : {
                  stage: "transcription",
                  message: getTranscriptionErrorMessage(error),
                code: error instanceof TranscriptionError ? error.code : undefined,
                  retryable: canRetryTranscription(error),
                  requiresAuth:
                    transcriptionRequiresAuthentication(error) || isAuthenticationError(error),
                }
            : {
                stage: "upload",
                message: getAudioUploadErrorMessage(error),
                retryable: canRetryAudioUpload(error),
                requiresAuth:
                  audioUploadRequiresAuthentication(error) || isAuthenticationError(error),
              },
        },
      });
    } finally {
      if (uploadAbortController.current === uploadController) {
        uploadAbortController.current = null;
      }
      operationInFlight.current = false;
    }
  }, [discardRecording, recording, session, state.answer, state.audioPath, state.index, user]);

  const retryTranscription = useCallback(async () => {
    if (operationInFlight.current || !state.answer) return;
    operationInFlight.current = true;
    const expectedScreenGeneration = screenGeneration.current;
    dispatch({ type: "transition", phase: "transcribing", values: { failure: null } });
    let transcript: TranscriptionResult | null = null;
    try {
      transcript = await transcriptionService.transcribe(state.answer.id);
      if (screenGeneration.current !== expectedScreenGeneration) return;
      dispatch({
        type: "transition",
        phase: "evaluating",
        values: { transcript, failure: null },
      });
      const evaluation = await evaluationService.evaluateAnswer(state.answer.id);
      if (screenGeneration.current !== expectedScreenGeneration) return;
      dispatch({
        type: "transition",
        phase: "transcribed",
        values: { transcript, evaluation, failure: null },
      });
    } catch (error) {
      if (screenGeneration.current !== expectedScreenGeneration) return;
      dispatch({
        type: "transition",
        phase: "error",
        values: {
          failure: transcript
            ? evaluationFailureFor(error)
            : {
                stage: "transcription",
                message: getTranscriptionErrorMessage(error),
                code: error instanceof TranscriptionError ? error.code : undefined,
                retryable: canRetryTranscription(error),
                requiresAuth:
                  transcriptionRequiresAuthentication(error) || isAuthenticationError(error),
              },
        },
      });
    } finally {
      operationInFlight.current = false;
    }
  }, [state.answer]);

  const retryEvaluation = useCallback(async () => {
    if (operationInFlight.current || !state.answer || !state.transcript) return;
    operationInFlight.current = true;
    const expectedScreenGeneration = screenGeneration.current;
    dispatch({ type: "transition", phase: "evaluating", values: { failure: null } });
    try {
      const evaluation = await evaluationService.evaluateAnswer(state.answer.id);
      if (screenGeneration.current !== expectedScreenGeneration) return;
      dispatch({
        type: "transition",
        phase: "transcribed",
        values: { evaluation, failure: null },
      });
    } catch (error) {
      if (screenGeneration.current !== expectedScreenGeneration) return;
      dispatch({
        type: "transition",
        phase: "error",
        values: { failure: evaluationFailureFor(error) },
      });
    } finally {
      operationInFlight.current = false;
    }
  }, [state.answer, state.transcript]);

  const handleNext = useCallback(async () => {
    if (!session || operationInFlight.current) return;
    operationInFlight.current = true;
    const expectedScreenGeneration = screenGeneration.current;
    await discardRecording().catch(() => undefined);
    try {
      if (screenGeneration.current !== expectedScreenGeneration) return;
      if (state.index + 1 >= session.totalQuestions) {
        dispatch({ type: "transition", phase: "finalizing", values: { failure: null } });
        try {
          const result = await finalizationService.finalizeInterview(session.id);
          if (screenGeneration.current !== expectedScreenGeneration) return;
          router.replace({
            pathname: "/interview/results",
            params: { id: result.sessionId },
          } as Href);
          return;
        } catch (error) {
          if (screenGeneration.current !== expectedScreenGeneration) return;
          if (error instanceof FinalizationError && error.code === "already_finalized") {
            router.replace({
              pathname: "/interview/results",
              params: { id: session.id },
            } as Href);
            return;
          }
          dispatch({
            type: "transition",
            phase: "error",
            values: { failure: finalizationFailureFor(error) },
          });
          return;
        }
      }
      if (screenGeneration.current !== expectedScreenGeneration) return;
      dispatch({ type: "next" });
    } catch (error) {
      if (screenGeneration.current !== expectedScreenGeneration) return;
      dispatch({
        type: "transition",
        phase: "error",
        values: {
          failure: {
            stage: "completion",
            message: getDataErrorMessage(
              error,
              "Your answer is saved, but we couldn't finish the interview. Please try again.",
            ),
            requiresAuth: isAuthenticationError(error),
          },
        },
      });
    } finally {
      operationInFlight.current = false;
    }
  }, [discardRecording, session, state.index]);

  const retryFinalization = useCallback(async () => {
    if (operationInFlight.current || !session) return;
    operationInFlight.current = true;
    const expectedScreenGeneration = screenGeneration.current;
    dispatch({ type: "transition", phase: "finalizing", values: { failure: null } });
    try {
      const result = await finalizationService.finalizeInterview(session.id);
      if (screenGeneration.current !== expectedScreenGeneration) return;
      router.replace({
        pathname: "/interview/results",
        params: { id: result.sessionId },
      } as Href);
    } catch (error) {
      if (screenGeneration.current !== expectedScreenGeneration) return;
      if (error instanceof FinalizationError && error.code === "already_finalized") {
        router.replace({
          pathname: "/interview/results",
          params: { id: session.id },
        } as Href);
        return;
      }
      dispatch({
        type: "transition",
        phase: "error",
        values: { failure: finalizationFailureFor(error) },
      });
    } finally {
      operationInFlight.current = false;
    }
  }, [session]);

  const handleLeave = useCallback(() => {
    screenGeneration.current += 1;
    uploadAbortController.current?.abort();
    setExitVisible(false);
    resetInterviewSession();
    router.replace("/home");
  }, []);

  const handleReauthenticate = useCallback(() => {
    screenGeneration.current += 1;
    uploadAbortController.current?.abort();
    void signOut()
      .catch(() => undefined)
      .finally(() => router.replace("/login" as Href));
  }, [signOut]);

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings()
      .catch(() => undefined)
      .finally(() => {
        dispatch({
          type: "transition",
          phase: "question",
          values: { failure: null },
        });
      });
  }, []);

  if (!session) return <View style={styles.screen} />;

  const question = session.questions[state.index] ?? "Tell me about yourself.";
  const isLast = state.index + 1 >= session.totalQuestions;
  const wrapUpHint = durationSeconds >= WRAP_UP_AFTER_SECONDS;
  const compactQuestion = [
    "recorded",
    "uploading",
    "transcribing",
    "evaluating",
    "transcribed",
    "summary",
    "finalizing",
    "error",
  ].includes(state.phase);

  const interviewerStatus = getInterviewerStatus(state.phase);
  const interviewerIntensity: 0 | 1 | 2 =
    state.phase === "recording"
      ? 2
      : ["uploading", "transcribing", "evaluating", "finalizing", "transcribed"].includes(
          state.phase,
        )
        ? 0
        : 1;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.wordmark}>VOCARA</Text>
        <Text style={styles.counter}>
          Question {state.index + 1} of {session.totalQuestions}
        </Text>
        <PressableScale onPress={() => setExitVisible(true)} accessibilityLabel="Exit interview">
          <Text style={styles.exit}>Exit</Text>
        </PressableScale>
      </View>

      <View style={styles.progressWrap}>
        <InterviewProgress total={session.totalQuestions} current={state.index + 1} />
      </View>

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View key={`voice-${state.phase}`} entering={FadeIn.duration(280)}>
          <InterviewerVoice intensity={interviewerIntensity} statusLabel={interviewerStatus} />
        </Animated.View>

        {!compactQuestion ? (
          <Animated.View
            key={`q-${state.index}`}
            entering={FadeInDown.duration(320)}
            exiting={FadeOutUp.duration(200)}
            style={styles.questionWrap}
          >
            <QuestionCard question={question} />
          </Animated.View>
        ) : (
          <View style={styles.questionWrap}>
            <Text style={styles.summaryQuestion} numberOfLines={2}>
              {question}
            </Text>
          </View>
        )}
      </ScrollView>

      <ScrollView
        style={styles.controlsScroll}
        contentContainerStyle={[styles.controls, { paddingBottom: insets.bottom + 18 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {state.phase === "question" && (
          <ThinkTimer
            countdown={null}
            onStartAnswering={() => void handleStartRecording()}
            onAskForTime={() => {
              dispatch({
                type: "transition",
                phase: "thinking",
                values: { countdown: THINK_SECONDS },
              });
            }}
          />
        )}

        {state.phase === "thinking" && (
          <ThinkTimer
            countdown={state.countdown}
            onStartAnswering={() => void handleStartRecording()}
            onAskForTime={() => undefined}
          />
        )}

        {state.phase === "requesting_permission" && (
          <View style={styles.requestingWrap}>
            <LiveWaveform active barCount={20} height={36} intensity={0.45} barWidth={3} />
            <Text style={styles.requestingLabel}>Preparing microphone…</Text>
          </View>
        )}

        {state.phase === "recording" && (
          <RecordingControls
            seconds={durationSeconds}
            wrapUpHint={wrapUpHint}
            onFinish={() => void handleFinishAnswer()}
            onRestart={() => void handleRecordAgain()}
          />
        )}

        {state.phase === "recorded" && recording && (
          <Animated.View entering={FadeIn.duration(240)}>
            <RecordedAnswer
              uri={recording.uri}
              durationSeconds={recording.durationSeconds}
              onUseAnswer={() => void processRecordedAnswer()}
              onRecordAgain={() => void handleRecordAgain()}
              errorMessage={state.failure?.message}
            />
          </Animated.View>
        )}

        {state.phase === "uploading" && <ProcessingAnswer stage="uploading" />}
        {state.phase === "transcribing" && <ProcessingAnswer stage="transcribing" />}
        {state.phase === "evaluating" && <ProcessingAnswer stage="evaluating" />}
        {state.phase === "finalizing" && <ProcessingAnswer stage="finalizing" />}
        {state.phase === "transcribed" && <ProcessingAnswer stage="ready" />}

        {state.phase === "error" && state.failure?.stage === "permission" && (
          <MicrophonePermissionState
            canAskAgain={state.failure.canAskAgain ?? false}
            onAllow={() => void handleStartRecording()}
            onOpenSettings={handleOpenSettings}
            onNotNow={() => {
              dispatch({
                type: "transition",
                phase: "question",
                values: { failure: null },
              });
            }}
          />
        )}

        {state.phase === "error" && state.failure?.stage !== "permission" && state.failure && (
          <AnswerErrorState
            failure={state.failure}
            onPrimary={
              state.failure.requiresAuth
                ? handleReauthenticate
                : (state.failure.code === "answer_retry_exhausted" || SERVICE_CONFIGURATION_ERRORS.has(state.failure.code ?? ""))
                  ? handleLeave
                : state.failure.stage === "upload"
                ? state.failure.retryable === false
                  ? () => void handleRecordAgain()
                  : () => void processRecordedAnswer()
                : state.failure.stage === "transcription"
                  ? state.failure.retryable === false
                    ? () => void handleRecordAgain()
                    : () => void retryTranscription()
                  : state.failure.stage === "evaluation"
                    ? state.failure.code === "daily_limit_reached"
                      ? handleLeave
                      : state.failure.retryable === false
                        ? () => void handleRecordAgain()
                        : () => void retryEvaluation()
                    : state.failure.stage === "finalization"
                      ? state.failure.code === "daily_limit_reached" ||
                        state.failure.retryable === false
                        ? handleLeave
                        : () => void retryFinalization()
                      : state.failure.stage === "completion"
                        ? () => void handleNext()
                        : () => void handleRecordAgain()
            }
            onRecordAgain={
              (state.failure.code === "answer_retry_exhausted" || SERVICE_CONFIGURATION_ERRORS.has(state.failure.code ?? "")) ||
              state.failure.stage === "completion" ||
              state.failure.stage === "finalization" ||
              state.failure.code === "daily_limit_reached" ||
              state.failure.retryable === false ||
              state.failure.requiresAuth
                ? undefined
                : () => void handleRecordAgain()
            }
          />
        )}

        {state.phase === "summary" && state.transcript && (
          <View>
            <TranscriptPreview
              transcript={state.transcript.transcript}
              durationSeconds={state.transcript.durationSeconds}
              wordCount={state.transcript.wordCount}
              speakingPace={state.transcript.speakingPace}
              isLast={isLast}
              onNext={() => void handleNext()}
              onRecordAgain={() => void handleRecordAgain()}
              errorMessage={state.failure?.message}
            />
            {state.evaluation && <AnswerFeedback evaluation={state.evaluation} />}
          </View>
        )}
      </ScrollView>

      <InterviewExitModal
        visible={exitVisible}
        onClose={() => setExitVisible(false)}
        onLeave={handleLeave}
      />
    </View>
  );
}

function AnswerErrorState({
  failure,
  onPrimary,
  onRecordAgain,
}: {
  failure: RoomFailure;
  onPrimary: () => void;
  onRecordAgain?: () => void;
}) {
  const upload = failure.stage === "upload";
  const transcription = failure.stage === "transcription";
  const evaluation = failure.stage === "evaluation";
  const finalization = failure.stage === "finalization";
  const dailyLimit = failure.code === "daily_limit_reached";
  const title = failure.requiresAuth
    ? "Sign in again"
    : upload
    ? "Couldn't upload your answer"
    : transcription
      ? "Transcript unavailable"
      : evaluation
        ? dailyLimit
          ? "Daily limit reached"
          : "Feedback unavailable"
        : finalization
          ? "Couldn't finish interview"
          : failure.stage === "completion"
            ? "Couldn't finish interview"
            : "Recorder unavailable";
  const primaryLabel = failure.requiresAuth
    ? "Return to sign in"
    : (failure.code === "answer_retry_exhausted" || SERVICE_CONFIGURATION_ERRORS.has(failure.code ?? ""))
      ? "Back to home"
    : upload
    ? failure.retryable === false
      ? "Record again"
      : "Try upload again"
    : transcription
      ? failure.retryable === false
        ? "Record again"
        : "Retry transcription"
      : evaluation
        ? dailyLimit
          ? "Back to home"
          : failure.retryable === false
            ? "Record again"
            : "Retry feedback"
        : finalization
          ? dailyLimit || failure.retryable === false
            ? "Back to home"
            : "Try again"
          : failure.stage === "completion"
            ? "Try again"
            : "Try again";

  return (
    <View style={styles.errorCard}>
      <View style={styles.errorIcon}>
        <Ionicons name="cloud-offline-outline" size={23} color={colors.warning} />
      </View>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorMessage}>{failure.message}</Text>
      <PressableScale onPress={onPrimary} accessibilityLabel={primaryLabel} style={styles.retryWrap}>
        <Text style={styles.retryLabel}>{primaryLabel}</Text>
      </PressableScale>
      {onRecordAgain && (
        <PressableScale onPress={onRecordAgain} accessibilityLabel="Record again" collapsed>
          <Text style={styles.recordAgainLabel}>Record again</Text>
        </PressableScale>
      )}
    </View>
  );
}

function getInterviewerStatus(phase: SessionState) {
  if (phase === "recording") return "Listening";
  if (phase === "recorded") return "Answer recorded";
  if (phase === "requesting_permission") return "Preparing microphone…";
  if (phase === "uploading") return "Saving your answer…";
  if (phase === "transcribing") return "Creating transcript…";
  if (phase === "evaluating") return "Creating your feedback…";
  if (phase === "finalizing") return "Building your summary…";
  if (phase === "transcribed" || phase === "summary") return "Answer ready";
  if (phase === "error") return "Ready when you are";
  return "Asking question…";
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.room,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 4,
    marginBottom: 14,
  },
  wordmark: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2.4,
    color: "#8C8A82",
  },
  counter: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#B9B8B0",
    fontVariant: ["tabular-nums"],
  },
  exit: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.accent,
  },
  progressWrap: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  bodyScroll: {
    flex: 1,
  },
  body: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  questionWrap: {
    marginTop: 30,
    marginBottom: 8,
  },
  summaryQuestion: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "700",
    color: "#8C8A82",
    textAlign: "center",
    marginTop: 20,
  },
  controlsScroll: {
    maxHeight: "68%",
  },
  controls: {
    paddingHorizontal: 24,
  },
  requestingWrap: {
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  requestingLabel: {
    color: "#B9B8B0",
    fontSize: 15,
    fontWeight: "700",
  },
  errorCard: {
    alignItems: "center",
    backgroundColor: colors.roomCard,
    borderWidth: 1,
    borderColor: colors.roomLine,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 23,
  },
  errorIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(233, 162, 59, 0.13)",
    marginBottom: 13,
  },
  errorTitle: {
    color: "#F6F5F0",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  errorMessage: {
    color: "#B9B8B0",
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 7,
  },
  retryWrap: {
    alignSelf: "stretch",
    marginTop: 18,
  },
  retryLabel: {
    height: 52,
    lineHeight: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
    includeFontPadding: false,
  },
  recordAgainLabel: {
    color: "#B9B8B0",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 15,
  },
});

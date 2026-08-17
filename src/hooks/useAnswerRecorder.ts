import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from "expo-audio";
import { File } from "expo-file-system";

import { MAX_RECORDING_SECONDS } from "@/types/interview";

const RECORDER_POLL_INTERVAL_MS = 200;

const SPEECH_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  directory: "cache",
  numberOfChannels: 1,
  bitRate: 64_000,
};

export type MicrophonePermissionState =
  | "unknown"
  | "granted"
  | "denied"
  | "blocked";

export type AnswerRecording = {
  uri: string;
  durationMillis: number;
  durationSeconds: number;
  sizeBytes: number;
};

export class MicrophonePermissionError extends Error {
  canAskAgain: boolean;

  constructor(canAskAgain: boolean) {
    super("Microphone permission was not granted.");
    this.name = "MicrophonePermissionError";
    this.canAskAgain = canAskAgain;
  }
}

class RecorderOperationCancelledError extends Error {
  constructor() {
    super("The recording operation was cancelled.");
    this.name = "RecorderOperationCancelledError";
  }
}

export function useAnswerRecorder() {
  const audioRecorder = useAudioRecorder(SPEECH_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(
    audioRecorder,
    RECORDER_POLL_INTERVAL_MS,
  );
  const [permission, setPermission] = useState<MicrophonePermissionState>("unknown");
  const [recording, setRecording] = useState<AnswerRecording | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const recordingRef = useRef<AnswerRecording | null>(null);
  const activeUri = useRef<string | null>(null);
  const observedRecording = useRef(false);
  const maxObservedDurationMillis = useRef(0);
  const recordingStartedAt = useRef<number | null>(null);
  const generation = useRef(0);
  const operationTail = useRef<Promise<void>>(Promise.resolve());

  const enqueue = useCallback(<T,>(work: () => Promise<T>) => {
    const result = operationTail.current.catch(() => undefined).then(work);
    operationTail.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);

  const applyRecording = useCallback((next: AnswerRecording | null) => {
    recordingRef.current = next;
    if (mounted.current) setRecording(next);
  }, []);

  const ensureCurrent = useCallback((expectedGeneration: number, requireActive = true) => {
    if (
      !mounted.current ||
      generation.current !== expectedGeneration ||
      (requireActive && AppState.currentState !== "active")
    ) {
      throw new RecorderOperationCancelledError();
    }
  }, []);

  const ensurePermission = useCallback(async (expectedGeneration: number) => {
    let response = await getRecordingPermissionsAsync();
    ensureCurrent(expectedGeneration);

    if (!response.granted && response.canAskAgain) {
      response = await requestRecordingPermissionsAsync();
      ensureCurrent(expectedGeneration);
    }

    if (response.granted) {
      if (mounted.current) setPermission("granted");
      return;
    }

    if (mounted.current) setPermission(response.canAskAgain ? "denied" : "blocked");
    throw new MicrophonePermissionError(response.canAskAgain);
  }, [ensureCurrent]);

  const finalizeRecording = useCallback((): Promise<AnswerRecording> => {
    const expectedGeneration = generation.current;
    return enqueue(async () => {
      ensureCurrent(expectedGeneration, false);
      const statusBeforeStop = audioRecorder.getStatus();
      const uriBeforeStop = activeUri.current ?? audioRecorder.uri ?? statusBeforeStop.url;
      const elapsedMillis = recordingStartedAt.current
        ? Date.now() - recordingStartedAt.current
        : 0;
      maxObservedDurationMillis.current = Math.max(
        maxObservedDurationMillis.current,
        statusBeforeStop.durationMillis,
        audioRecorder.currentTime * 1000,
        elapsedMillis,
      );

      if (
        statusBeforeStop.isRecording ||
        statusBeforeStop.canRecord ||
        audioRecorder.isRecording
      ) {
        await audioRecorder.stop();
      }
      ensureCurrent(expectedGeneration, false);

      const status = audioRecorder.getStatus();
      const uri = uriBeforeStop ?? audioRecorder.uri ?? status.url;
      if (!uri) throw new Error("The recorder did not create an audio file.");

      const file = new File(uri);
      if (!file.exists || file.size <= 0) {
        throw new Error("The recorded audio file is empty or unavailable.");
      }

      const durationMillis = Math.min(
        MAX_RECORDING_SECONDS * 1000,
        Math.max(
          maxObservedDurationMillis.current,
          status.durationMillis,
          audioRecorder.currentTime * 1000,
        ),
      );
      const result: AnswerRecording = {
        uri,
        durationMillis,
        durationSeconds: Math.max(1, Math.round(durationMillis / 1000)),
        sizeBytes: file.size,
      };

      observedRecording.current = false;
      recordingStartedAt.current = null;
      activeUri.current = uri;
      applyRecording(result);
      await setPlaybackAudioMode();
      return result;
    }).catch((recordingError) => {
      if (!(recordingError instanceof RecorderOperationCancelledError) && mounted.current) {
        setError(getRecorderErrorMessage(recordingError));
      }
      throw recordingError;
    });
  }, [applyRecording, audioRecorder, enqueue, ensureCurrent]);

  const discardRecording = useCallback(() => {
    const expectedGeneration = ++generation.current;
    return enqueue(async () => {
      if (!mounted.current) return;

      const uri = recordingRef.current?.uri ?? activeUri.current;
      try {
        if (audioRecorder.isRecording || audioRecorder.getStatus().canRecord) {
          await audioRecorder.stop();
        }
      } catch {
        // stop() also resets a prepared Android recorder when start failed.
      }

      if (!mounted.current || generation.current !== expectedGeneration) return;
      deleteLocalFile(uri);
      activeUri.current = null;
      observedRecording.current = false;
      maxObservedDurationMillis.current = 0;
      recordingStartedAt.current = null;
      applyRecording(null);
      setError(null);
      await setPlaybackAudioMode();
    });
  }, [applyRecording, audioRecorder, enqueue]);

  const startRecording = useCallback(() => {
    const expectedGeneration = ++generation.current;
    const previousRecording = recordingRef.current;
    const previousUri = previousRecording?.uri ?? activeUri.current;

    return enqueue(async () => {
      if (Platform.OS === "web") {
        throw new Error("Voice recording is currently available on iOS and Android.");
      }

      if (mounted.current) setError(null);
      await ensurePermission(expectedGeneration);

      try {
        await setAudioModeAsync({
          allowsRecording: true,
          allowsBackgroundRecording: false,
          shouldPlayInBackground: false,
          playsInSilentMode: true,
          interruptionMode: "doNotMix",
        });
        ensureCurrent(expectedGeneration);
        await audioRecorder.prepareToRecordAsync(SPEECH_RECORDING_OPTIONS);
        ensureCurrent(expectedGeneration);

        const nextUri = audioRecorder.uri ?? audioRecorder.getStatus().url;
        audioRecorder.record({ forDuration: MAX_RECORDING_SECONDS });
        activeUri.current = nextUri;
        observedRecording.current = false;
        maxObservedDurationMillis.current = 0;
        recordingStartedAt.current = Date.now();
        applyRecording(null);
        if (previousUri !== nextUri) deleteLocalFile(previousUri);
      } catch (recordingError) {
        if (mounted.current) {
          const failedUri = audioRecorder.uri;
          try {
            if (audioRecorder.getStatus().canRecord || audioRecorder.isRecording) {
              await audioRecorder.stop();
            }
          } catch {
            // Native stop still resets Android's prepared MediaRecorder in finally.
          }
          if (failedUri !== previousUri) deleteLocalFile(failedUri);
          activeUri.current = previousUri;
          if (generation.current === expectedGeneration) {
            setError(getRecorderErrorMessage(recordingError));
          }
        }
        await setPlaybackAudioMode().catch(() => undefined);
        throw recordingError;
      }
    });
  }, [applyRecording, audioRecorder, enqueue, ensureCurrent, ensurePermission]);

  useEffect(() => {
    maxObservedDurationMillis.current = Math.max(
      maxObservedDurationMillis.current,
      recorderState.durationMillis,
    );

    if (recorderState.isRecording) {
      observedRecording.current = true;
      return;
    }

    if (!observedRecording.current) return;
    void finalizeRecording().catch(() => undefined);
  }, [finalizeRecording, recorderState.durationMillis, recorderState.isRecording]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "background") return;
      const status = audioRecorder.getStatus();
      if (
        observedRecording.current ||
        recordingStartedAt.current !== null ||
        status.isRecording
      ) {
        void finalizeRecording().catch(() => undefined);
      } else {
        generation.current += 1;
      }
    });
    return () => subscription.remove();
  }, [audioRecorder, finalizeRecording]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      deleteLocalFile(recordingRef.current?.uri ?? activeUri.current);
      void setPlaybackAudioMode();
    };
  }, []);

  const durationMillis = recording?.durationMillis ?? recorderState.durationMillis;

  return {
    permission,
    recording,
    error,
    isRecording: recorderState.isRecording,
    durationMillis,
    durationSeconds:
      recording?.durationSeconds ??
      Math.min(MAX_RECORDING_SECONDS, Math.floor(durationMillis / 1000)),
    startRecording,
    stopRecording: finalizeRecording,
    discardRecording,
  };
}

async function setPlaybackAudioMode() {
  await setAudioModeAsync({
    allowsRecording: false,
    allowsBackgroundRecording: false,
    shouldPlayInBackground: false,
    playsInSilentMode: true,
    interruptionMode: "mixWithOthers",
  });
}

function deleteLocalFile(uri?: string | null) {
  if (!uri || Platform.OS === "web") return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup is best-effort and must never block another answer.
  }
}

export function getRecorderErrorMessage(error: unknown) {
  if (error instanceof MicrophonePermissionError) {
    return "Microphone access is needed to record your answer.";
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("currently available on ios and android")) {
    return "Voice recording is currently available on iOS and Android.";
  }
  if (message.includes("busy") || message.includes("prepare")) {
    return "Your microphone is busy. Close other recording apps and try again.";
  }
  if (error instanceof RecorderOperationCancelledError) {
    return "Recording stopped because Vocara left the foreground.";
  }
  return "We couldn't start the recorder. Please try again.";
}

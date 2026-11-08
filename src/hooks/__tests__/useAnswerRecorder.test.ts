/* eslint-disable react-hooks/globals, react-hooks/immutability */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { File } from "expo-file-system";
import { useAnswerRecorder, MicrophonePermissionError } from "../useAnswerRecorder";

// Set up hoisted mocks for modules
const {
  mockAppState,
  mockAudioRecorder,
  mockRecorderState,
  mockSetAudioModeAsync,
  mockGetPermissionsAsync,
  mockRequestPermissionsAsync,
  mockFileInstances,
  appStateListeners,
} = vi.hoisted(() => {
  const listeners: ((state: string) => void)[] = [];
  const fileInstances: any[] = [];

  const recorder = {
    uri: "file:///mock/recording.m4a",
    currentTime: 2.5,
    isRecording: false,
    getStatus: vi.fn(() => ({
      canRecord: false,
      isRecording: false,
      durationMillis: 2500,
      url: "file:///mock/recording.m4a",
    })),
    prepareToRecordAsync: vi.fn().mockResolvedValue(undefined),
    record: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
  };

  const recorderState = {
    canRecord: false,
    isRecording: false,
    durationMillis: 0,
    mediaServicesDidReset: false,
    url: "file:///mock/recording.m4a",
  };

  return {
    appStateListeners: listeners,
    mockFileInstances: fileInstances,
    mockAppState: {
      currentState: "active",
      addEventListener: vi.fn((_event: string, handler: (state: string) => void) => {
        listeners.push(handler);
        return {
          remove: vi.fn(() => {
            const index = listeners.indexOf(handler);
            if (index >= 0) listeners.splice(index, 1);
          }),
        };
      }),
    },
    mockAudioRecorder: recorder,
    mockRecorderState: recorderState,
    mockSetAudioModeAsync: vi.fn().mockResolvedValue(undefined),
    mockGetPermissionsAsync: vi.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
    mockRequestPermissionsAsync: vi.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
  };
});

// Mock react-native
vi.mock("react-native", () => ({
  AppState: mockAppState,
  Platform: { OS: "ios" },
}));

// Mock expo-audio
vi.mock("expo-audio", () => ({
  RecordingPresets: {
    HIGH_QUALITY: { extension: ".m4a" },
  },
  useAudioRecorder: () => mockAudioRecorder,
  useAudioRecorderState: () => mockRecorderState,
  setAudioModeAsync: mockSetAudioModeAsync,
  getRecordingPermissionsAsync: mockGetPermissionsAsync,
  requestRecordingPermissionsAsync: mockRequestPermissionsAsync,
}));

// Mock expo-file-system
vi.mock("expo-file-system", () => {
  class MockFile {
    static defaultSize = 2048;
    static defaultExists = true;

    uri: string;
    exists = MockFile.defaultExists;
    size = MockFile.defaultSize;
    delete = vi.fn();

    constructor(uri: string) {
      this.uri = uri;
      mockFileInstances.push(this);
    }
  }

  return { File: MockFile };
});

// Lightweight React Hook Test Harness
let hookIndex = 0;
let stateStore: any[] = [];
let stateSetters: any[] = [];
let refStore: any[] = [];
let effectStore: { idx: number; effect: () => void | (() => void); deps?: any[] }[] = [];
let cleanups: Record<number, (() => void) | undefined> = {};
let prevDeps: Record<number, any[] | undefined> = {};

vi.mock("react", () => ({
  useState: (initial: any) => {
    const idx = hookIndex++;
    if (stateStore[idx] === undefined) {
      stateStore[idx] = typeof initial === "function" ? initial() : initial;
    }
    if (!stateSetters[idx]) {
      stateSetters[idx] = (next: any) => {
        stateStore[idx] = typeof next === "function" ? next(stateStore[idx]) : next;
      };
    }
    return [stateStore[idx], stateSetters[idx]];
  },
  useRef: (initial: any) => {
    const idx = hookIndex++;
    if (!refStore[idx]) {
      refStore[idx] = { current: initial };
    }
    return refStore[idx];
  },
  useCallback: (fn: any) => fn,
  useEffect: (effect: () => void | (() => void), deps?: any[]) => {
    const idx = hookIndex++;
    effectStore.push({ idx, effect, deps });
  },
}));

function useRecorderHarness() {
  hookIndex = 0;
  effectStore = [];
  const hookResult = useAnswerRecorder();

  // Run effects
  for (const { idx, effect, deps } of effectStore) {
    const oldDeps = prevDeps[idx];
    const hasChanged =
      !oldDeps || !deps || deps.some((dep, i) => !Object.is(dep, oldDeps[i]));
    if (hasChanged) {
      if (typeof cleanups[idx] === "function") {
        cleanups[idx]!();
      }
      const cleanup = effect();
      if (typeof cleanup === "function") {
        cleanups[idx] = cleanup;
      }
      prevDeps[idx] = deps;
    }
  }

  const unmount = async () => {
    const cleanupFns = Object.values(cleanups).filter(
      (c): c is () => void => typeof c === "function",
    );
    // Execute cleanups in reverse order (standard React unmount order)
    for (let i = cleanupFns.length - 1; i >= 0; i--) {
      cleanupFns[i]();
    }
    // Allow microtasks from async unmount cleanup to settle
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  return { result: hookResult, unmount };
}

describe("useAnswerRecorder reliability and lifecycle", () => {
  beforeEach(() => {
    hookIndex = 0;
    stateStore = [];
    stateSetters = [];
    refStore = [];
    effectStore = [];
    cleanups = {};
    prevDeps = {};
    appStateListeners.length = 0;
    mockFileInstances.length = 0;

    (File as any).defaultSize = 2048;
    (File as any).defaultExists = true;

    mockAppState.currentState = "active";
    mockAudioRecorder.isRecording = false;
    mockAudioRecorder.uri = "file:///mock/recording.m4a";
    mockAudioRecorder.currentTime = 2.5;
    mockAudioRecorder.getStatus.mockReturnValue({
      canRecord: false,
      isRecording: false,
      durationMillis: 2500,
      url: "file:///mock/recording.m4a",
    });
    mockAudioRecorder.prepareToRecordAsync.mockReset().mockResolvedValue(undefined);
    mockAudioRecorder.record.mockReset();
    mockAudioRecorder.stop.mockReset().mockImplementation(async () => {
      mockAudioRecorder.isRecording = false;
    });

    mockRecorderState.isRecording = false;
    mockRecorderState.durationMillis = 0;

    mockSetAudioModeAsync.mockReset().mockResolvedValue(undefined);
    mockGetPermissionsAsync.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
    mockRequestPermissionsAsync.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
  });

  it("stops native audio recorder and releases microphone on unmount while recording", async () => {
    const { result, unmount } = useRecorderHarness();

    // Start recording
    await result.startRecording();
    expect(mockSetAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsRecording: true, interruptionMode: "doNotMix" }),
    );
    expect(mockAudioRecorder.record).toHaveBeenCalled();

    // Simulate recorder is now active in native
    mockAudioRecorder.isRecording = true;
    mockAudioRecorder.getStatus.mockReturnValue({
      canRecord: true,
      isRecording: true,
      durationMillis: 3000,
      url: "file:///mock/recording.m4a",
    });

    // User leaves interview or navigates away -> component unmounts
    await unmount();

    // Verify audioRecorder.stop was called to release native microphone hardware
    expect(mockAudioRecorder.stop).toHaveBeenCalled();

    // Verify file cleanup was executed
    expect(mockFileInstances.length).toBeGreaterThan(0);
    const lastFile = mockFileInstances[mockFileInstances.length - 1];
    expect(lastFile.delete).toHaveBeenCalled();

    // Verify playback audio mode is restored to release recording session
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowsRecording: false, interruptionMode: "mixWithOthers" }),
    );
  });

  it("handles unmount cleanup gracefully even when audioRecorder.stop throws", async () => {
    const { result, unmount } = useRecorderHarness();

    await result.startRecording();
    mockAudioRecorder.isRecording = true;
    mockAudioRecorder.stop.mockRejectedValueOnce(new Error("Native recorder already reset"));

    // Should not throw or crash unmount
    await expect(unmount()).resolves.not.toThrow();

    // Audio mode is still restored to playback
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowsRecording: false, interruptionMode: "mixWithOthers" }),
    );
  });

  it("completes successful recording start and stop lifecycle", async () => {
    const { result } = useRecorderHarness();

    // 1. Start recording
    await result.startRecording();
    expect(mockAudioRecorder.prepareToRecordAsync).toHaveBeenCalled();
    expect(mockAudioRecorder.record).toHaveBeenCalledWith({ forDuration: 120 });

    // 2. Simulate native recording active
    mockAudioRecorder.isRecording = true;
    mockAudioRecorder.getStatus.mockReturnValue({
      canRecord: true,
      isRecording: true,
      durationMillis: 4000,
      url: "file:///mock/recording.m4a",
    });

    // 3. Stop recording
    mockAudioRecorder.stop.mockImplementationOnce(async () => {
      mockAudioRecorder.isRecording = false;
      mockAudioRecorder.getStatus.mockReturnValue({
        canRecord: false,
        isRecording: false,
        durationMillis: 4200,
        url: "file:///mock/recording.m4a",
      });
    });

    const recorded = await result.stopRecording();
    expect(mockAudioRecorder.stop).toHaveBeenCalled();
    expect(recorded).toEqual({
      uri: "file:///mock/recording.m4a",
      durationMillis: 4200,
      durationSeconds: 4,
      sizeBytes: 2048,
    });

    // Audio mode restored
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowsRecording: false }),
    );
  });

  it("prevents duplicate recording initialization when already recording", async () => {
    const { result } = useRecorderHarness();

    await result.startRecording();
    expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1);

    // Simulate recorder is actively recording
    mockAudioRecorder.isRecording = true;
    mockAudioRecorder.getStatus.mockReturnValue({
      canRecord: true,
      isRecording: true,
      durationMillis: 1000,
      url: "file:///mock/recording.m4a",
    });

    // Call startRecording again while recording
    await result.startRecording();

    // Record should not have been called a second time
    expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1);
    expect(mockAudioRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
  });

  it("gracefully handles microphone permission denied", async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: true });
    mockRequestPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: true });

    const { result } = useRecorderHarness();

    await expect(result.startRecording()).rejects.toThrow(MicrophonePermissionError);
    expect(mockAudioRecorder.record).not.toHaveBeenCalled();

    // Playback mode preserved/restored
    expect(mockSetAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsRecording: false }),
    );
  });

  it("finalizes recording safely when app is backgrounded", async () => {
    const { result } = useRecorderHarness();

    await result.startRecording();
    mockAudioRecorder.isRecording = true;
    mockAudioRecorder.getStatus.mockReturnValue({
      canRecord: true,
      isRecording: true,
      durationMillis: 5000,
      url: "file:///mock/recording.m4a",
    });

    // Simulate app going to background
    expect(appStateListeners.length).toBeGreaterThan(0);
    const backgroundListener = appStateListeners[0];

    // Trigger background event
    backgroundListener("background");

    // Allow background finalize microtasks to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockAudioRecorder.stop).toHaveBeenCalled();
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowsRecording: false }),
    );
  });

  it("cleans up native recorder and resets audio mode when start recording fails", async () => {
    mockAudioRecorder.prepareToRecordAsync.mockRejectedValueOnce(
      new Error("Audio recorder is busy"),
    );

    const { result } = useRecorderHarness();

    await expect(result.startRecording()).rejects.toThrow("busy");

    // Audio mode is reset to playback
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowsRecording: false }),
    );
  });

  it("resets audio mode to playback when finalizeRecording fails with empty file", async () => {
    const { result } = useRecorderHarness();

    await result.startRecording();
    mockAudioRecorder.isRecording = true;
    mockAudioRecorder.getStatus.mockReturnValue({
      canRecord: true,
      isRecording: true,
      durationMillis: 2000,
      url: "file:///mock/recording.m4a",
    });

    // When stopped, next files created will have size 0
    (File as any).defaultSize = 0;

    await expect(result.stopRecording()).rejects.toThrow(
      "The recorded audio file is empty or unavailable.",
    );

    // Audio mode should still be restored to playback despite failure
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowsRecording: false }),
    );
  });

  it("discardRecording stops active recorder, deletes audio file, and restores audio mode", async () => {
    const { result } = useRecorderHarness();

    await result.startRecording();
    mockAudioRecorder.isRecording = true;
    mockAudioRecorder.getStatus.mockReturnValue({
      canRecord: true,
      isRecording: true,
      durationMillis: 2000,
      url: "file:///mock/recording.m4a",
    });

    await result.discardRecording();

    expect(mockAudioRecorder.stop).toHaveBeenCalled();
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowsRecording: false }),
    );
  });
});

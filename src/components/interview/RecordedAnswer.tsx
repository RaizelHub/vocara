import { StyleSheet, Text, View } from "react-native";

import { AudioPlayback } from "@/components/interview/AudioPlayback";
import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";

type RecordedAnswerProps = {
  uri: string;
  durationSeconds: number;
  errorMessage?: string;
  busy?: boolean;
  onUseAnswer: () => void;
  onRecordAgain: () => void;
};

export function RecordedAnswer({
  uri,
  durationSeconds,
  errorMessage,
  busy,
  onUseAnswer,
  onRecordAgain,
}: RecordedAnswerProps) {
  return (
    <View>
      <Text style={styles.eyebrow}>Answer recorded</Text>
      <Text style={styles.duration}>{formatTime(durationSeconds)}</Text>
      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
      <AudioPlayback uri={uri} />
      <PressableScale
        onPress={onUseAnswer}
        disabled={busy}
        accessibilityLabel="Use this answer"
        style={styles.primaryWrap}
      >
        <Text style={[styles.primary, busy && styles.disabled]}>
          {busy ? "Preparing…" : "Use this answer"}
        </Text>
      </PressableScale>
      <PressableScale
        onPress={onRecordAgain}
        disabled={busy}
        accessibilityLabel="Record answer again"
        collapsed
      >
        <Text style={styles.secondary}>Record again</Text>
      </PressableScale>
    </View>
  );
}

function formatTime(totalSeconds: number) {
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(
    totalSeconds % 60,
  ).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  eyebrow: {
    color: "#F6F5F0",
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  duration: {
    color: "#B9B8B0",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 6,
    fontVariant: ["tabular-nums"],
  },
  error: {
    color: colors.warning,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 9,
  },
  primaryWrap: {
    marginTop: 18,
  },
  primary: {
    height: 56,
    lineHeight: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    color: "#FFFFFF",
    fontSize: 15.5,
    fontWeight: "800",
    textAlign: "center",
    includeFontPadding: false,
  },
  disabled: {
    opacity: 0.6,
  },
  secondary: {
    color: "#B9B8B0",
    fontSize: 14.5,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 16,
  },
});

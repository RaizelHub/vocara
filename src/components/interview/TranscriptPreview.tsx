import { StyleSheet, Text, View } from "react-native";

import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";

type TranscriptPreviewProps = {
  transcript: string;
  durationSeconds: number;
  wordCount: number;
  speakingPace: number;
  errorMessage?: string;
  isLast: boolean;
  onNext: () => void;
  onRecordAgain: () => void;
};

export function TranscriptPreview({
  transcript,
  durationSeconds,
  wordCount,
  speakingPace,
  errorMessage,
  isLast,
  onNext,
  onRecordAgain,
}: TranscriptPreviewProps) {
  return (
    <View>
      <Text style={styles.title}>Answer captured</Text>
      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
      <View style={styles.transcriptCard}>
        <Text style={styles.cardLabel}>Transcript</Text>
        <Text style={styles.transcript}>“{transcript}”</Text>
      </View>
      <View style={styles.metrics}>
        <Metric label="Duration" value={formatTime(durationSeconds)} />
        <Metric label="Words" value={String(wordCount)} />
        <Metric label="Speaking pace" value={`${speakingPace} wpm`} />
      </View>
      <PressableScale
        onPress={onNext}
        accessibilityLabel={isLast ? "Finish interview" : "Next question"}
        style={styles.primaryWrap}
      >
        <Text style={styles.primary}>{isLast ? "Finish interview" : "Next question"}</Text>
      </PressableScale>
      <PressableScale
        onPress={onRecordAgain}
        accessibilityLabel="Retry recording"
        collapsed
      >
        <Text style={styles.secondary}>Transcript looks wrong? Record again</Text>
      </PressableScale>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function formatTime(totalSeconds: number) {
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(
    totalSeconds % 60,
  ).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: "#F6F5F0",
    textAlign: "center",
    marginBottom: 16,
  },
  error: {
    color: colors.warning,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    marginTop: -7,
    marginBottom: 13,
  },
  transcriptCard: {
    backgroundColor: colors.roomCard,
    borderWidth: 1,
    borderColor: colors.roomLine,
    borderRadius: 18,
    padding: 17,
  },
  cardLabel: {
    color: "#8C8A82",
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  transcript: {
    color: "#E7E6E0",
    fontSize: 14.5,
    lineHeight: 22,
  },
  metrics: {
    marginTop: 12,
    backgroundColor: colors.roomCard,
    borderWidth: 1,
    borderColor: colors.roomLine,
    borderRadius: 18,
    paddingHorizontal: 16,
  },
  metricRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricLabel: {
    color: "#B9B8B0",
    fontSize: 13.5,
    fontWeight: "600",
  },
  metricValue: {
    color: "#F6F5F0",
    fontSize: 13.5,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
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
  secondary: {
    color: "#B9B8B0",
    fontSize: 13.5,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 15,
  },
});

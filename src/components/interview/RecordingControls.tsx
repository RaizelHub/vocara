import { StyleSheet, Text, View } from "react-native";
import { PressableScale } from "@/components/ui/PressableScale";
import { LiveWaveform } from "@/components/interview/LiveWaveform";
import { colors } from "@/theme/colors";

export type RecordingControlsProps = {
  seconds: number;
  wrapUpHint: boolean;
  onFinish: () => void;
  onRestart: () => void;
};

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The recording moment: live waveform, real timer, large controls.
 */
export function RecordingControls({ seconds, wrapUpHint, onFinish, onRestart }: RecordingControlsProps) {
  return (
    <View>
      <View style={styles.recordingRow}>
        <View style={styles.dot} accessibilityElementsHidden />
        <Text style={styles.recLabel}>Recording</Text>
      </View>
      <Text
        style={styles.timer}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Recording time ${formatTime(seconds)}`}
      >
        {formatTime(seconds)}
      </Text>

      <LiveWaveform active barCount={22} height={44} intensity={1.2} />

      {wrapUpHint && <Text style={styles.hint}>Try wrapping up your answer.</Text>}

      <View style={styles.row}>
        <PressableScale onPress={onRestart} accessibilityLabel="Restart answer" style={styles.ghostWrap}>
          <Text style={styles.ghost}>Restart</Text>
        </PressableScale>
        <PressableScale onPress={onFinish} accessibilityLabel="Finish answer" style={styles.primaryWrap}>
          <Text style={styles.primary}>Finish answer</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    color: "#B9B8B0",
  },
  timer: {
    textAlign: "center",
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1,
    color: "#F6F5F0",
    marginTop: 10,
    marginBottom: 12,
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  hint: {
    textAlign: "center",
    fontSize: 13.5,
    fontWeight: "600",
    color: colors.warning,
    marginTop: 12,
    marginBottom: -4,
  },
  row: {
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
    borderColor: "#3A3832",
    color: "#B9B8B0",
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
});
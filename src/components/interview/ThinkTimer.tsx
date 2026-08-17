import { StyleSheet, Text } from "react-native";
import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";
import { THINK_SECONDS } from "@/types/interview";

export type ThinkTimerProps = {
  /** Remaining seconds, or null before the countdown starts. */
  countdown: number | null;
  onStartAnswering: () => void;
  onAskForTime: () => void;
};

/**
 * The calm before speaking: an immediate start, or a gentle 15-second
 * countdown with a way out at any moment.
 */
export function ThinkTimer({ countdown, onStartAnswering, onAskForTime }: ThinkTimerProps) {
  if (countdown !== null) {
    return (
      <PressableScale onPress={onStartAnswering} accessibilityLabel="Start now" style={styles.nowWrap}>
        <Text style={styles.counter} accessibilityLiveRegion="polite">
          {countdown}
        </Text>
        <Text style={styles.nowLabel}>Start now</Text>
      </PressableScale>
    );
  }

  return (
    <>
      <PressableScale onPress={onStartAnswering} accessibilityLabel="Start answering" style={styles.ctaWrap}>
        <Text style={styles.cta}>Start answering</Text>
      </PressableScale>
      <PressableScale onPress={onAskForTime} accessibilityLabel="Give me 15 seconds" collapsed>
        <Text style={styles.secondary}>Give me {THINK_SECONDS} seconds</Text>
      </PressableScale>
    </>
  );
}

const styles = StyleSheet.create({
  ctaWrap: {
    marginBottom: 14,
    alignSelf: "stretch",
  },
  cta: {
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accent,
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.3,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  secondary: {
    color: "#B9B8B0",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  nowWrap: {
    alignItems: "center",
  },
  counter: {
    fontSize: 64,
    fontWeight: "800",
    letterSpacing: -1.5,
    color: "#F6F5F0",
    lineHeight: 72,
    includeFontPadding: false,
    fontVariant: ["tabular-nums"],
  },
  nowLabel: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.accent,
    marginTop: 4,
  },
});
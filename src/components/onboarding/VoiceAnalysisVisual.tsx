import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";

import { CountUpValue } from "./CountUpValue";
import { Waveform } from "./Waveform";
import { colors } from "@/theme/colors";

export type VoiceAnalysisVisualProps = {
  active: boolean;
  reducedMotion?: boolean;
};

const SCORES = [
  { label: "Clarity", value: 86 },
  { label: "Confidence", value: 78 },
  { label: "Structure", value: 91 },
  { label: "Grammar", value: 88 },
];

function ScoreChip({
  score,
  index,
  active,
  reducedMotion,
}: {
  score: (typeof SCORES)[number];
  index: number;
  active: boolean;
  reducedMotion: boolean;
}) {
  const appear = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    appear.value = withDelay(
      reducedMotion ? 0 : 180 + index * 130,
      withSpring(1, { damping: 16, stiffness: 150 })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ translateY: (1 - appear.value) * 22 }],
  }));

  return (
    <Animated.View style={[styles.chip, style]}>
      <Text style={styles.chipLabel}>{score.label}</Text>
      <CountUpValue
        value={score.value}
        active={active}
        delay={reducedMotion ? 0 : 380 + index * 140}
        duration={1200}
        reducedMotion={reducedMotion}
        style={styles.chipValue}
      />
    </Animated.View>
  );
}

/**
 * A voice waveform with a lightweight evaluation panel. Scores count in
 * with a short stagger — analytic, but dressed like a coaching session,
 * not a business dashboard.
 */
export function VoiceAnalysisVisual({
  active,
  reducedMotion = false,
}: VoiceAnalysisVisualProps) {
  return (
    <View style={styles.container}>
      <Waveform
        barCount={26}
        barWidth={4}
        gap={4}
        maxHeight={92}
        accentEvery={2}
        active={active}
        reducedMotion={reducedMotion}
      />
      <View style={styles.grid}>
        {SCORES.map((score, index) => (
          <ScoreChip
            key={score.label}
            score={score}
            index={index}
            active={active}
            reducedMotion={reducedMotion}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 340,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 24,
  },
  chip: {
    flexGrow: 1,
    flexBasis: "46%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 2,
  },
  chipValue: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
});
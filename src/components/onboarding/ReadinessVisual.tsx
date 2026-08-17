import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { CountUpValue } from "./CountUpValue";
import { colors } from "@/theme/colors";

export type ReadinessVisualProps = {
  active: boolean;
  reducedMotion?: boolean;
};

const READINESS = 84;
const IMPROVEMENT = 12;
const STREAK = 6;

/**
 * The closing moment: a confident interview-readiness score, a slim fill
 * bar, this month's change, and a streak line.
 */
export function ReadinessVisual({
  active,
  reducedMotion = false,
}: ReadinessVisualProps) {
  const fill = useSharedValue(0);
  const showMeta = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    fill.value = withDelay(
      reducedMotion ? 0 : 240,
      withSpring(READINESS / 100, { damping: 22, stiffness: 120 })
    );
    showMeta.value = withDelay(
      reducedMotion ? 0 : 500,
      withTiming(1, { duration: reducedMotion ? 150 : 520 })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion]);

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: fill.value }],
  }));

  const metaStyle = useAnimatedStyle(() => ({
    opacity: showMeta.value,
    transform: [{ translateY: (1 - showMeta.value) * 14 }],
  }));

  return (
    <View style={styles.container}>
      <CountUpValue
        value={READINESS}
        active={active}
        delay={reducedMotion ? 0 : 200}
        duration={1700}
        reducedMotion={reducedMotion}
        style={styles.score}
      />

      <Text style={styles.label}>Interview readiness</Text>

      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, fillStyle]} />
      </View>

      <Animated.View style={[styles.meta, metaStyle]}>
        <View style={styles.improvementChip}>
          <Text style={styles.improvementText}>+{IMPROVEMENT} this month</Text>
        </View>
        <View style={styles.streakRow}>
          <Text style={styles.streakGlyph}>🔥</Text>
          <Text style={styles.streakText}>{STREAK} day streak</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
  },
  score: {
    fontSize: 74,
    fontWeight: "800",
    letterSpacing: -2,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  label: {
    marginTop: -6,
    fontSize: 13.5,
    fontWeight: "600",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: colors.secondary,
  },
  barTrack: {
    marginTop: 18,
    width: 200,
    maxWidth: "80%",
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    height: "100%",
    borderRadius: 3,
    backgroundColor: colors.accent,
    transformOrigin: "left",
  },
  meta: {
    alignItems: "center",
    marginTop: 20,
    gap: 12,
  },
  improvementChip: {
    backgroundColor: "#FFE9E1",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  improvementText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.accentDark,
    letterSpacing: 0.2,
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  streakGlyph: {
    fontSize: 15,
  },
  streakText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.secondary,
    letterSpacing: 0.3,
  },
});
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/theme/colors";

export type SkillBarProps = {
  /** 0–100 round skill score */
  value: number;
  index?: number;
};

/**
 * A thin voice-inspired indicator: a rounded bar that fills from 0 → value
 * once on mount, slightly staggered per row.
 */
export function SkillBar({ value, index = 0 }: SkillBarProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      index * 90,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: value }}
      style={styles.track}
    >
      <Animated.View style={[styles.fill, { width: `${value}%` }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: colors.accent,
    transformOrigin: "left",
  },
});
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";

import { colors } from "@/theme/colors";

export type SkillBarProps = {
  /** 0–100 round skill score */
  value: number;
  index?: number;
  height?: number;
  barColor?: string;
};

/**
 * Voice-inspired skill indicator: a smooth rounded pill bar that fills
 * from 0 → value on mount with fluid spring dynamics.
 */
export function SkillBar({
  value,
  index = 0,
  height = 7,
  barColor = colors.accent,
}: SkillBarProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      index * 70,
      withSpring(1, { damping: 18, stiffness: 140 }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  const radius = Math.round(height / 2);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: value }}
      style={[styles.track, { height, borderRadius: radius }]}
    >
      <Animated.View
        style={[
          styles.fill,
          { width: `${Math.min(100, Math.max(0, value))}%`, borderRadius: radius, backgroundColor: barColor },
          fillStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: colors.borderSubtle,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    transformOrigin: "left",
  },
});
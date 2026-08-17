import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { colors } from "@/theme/colors";

export type OnboardingProgressProps = {
  count: number;
  current: number;
  onSelect: (index: number) => void;
};

const INACTIVE_WIDTH = 18;
const ACTIVE_WIDTH = 44;
const HEIGHT = 5;

function Segment({
  index,
  current,
  onSelect,
}: {
  index: number;
  current: number;
  onSelect: (index: number) => void;
}) {
  const focus = useSharedValue(index === current ? 1 : 0);

  useEffect(() => {
    focus.value = withSpring(index === current ? 1 : 0, {
      damping: 20,
      stiffness: 300,
    });
  }, [current, index, focus]);

  const style = useAnimatedStyle(() => ({
    width: INACTIVE_WIDTH + (ACTIVE_WIDTH - INACTIVE_WIDTH) * focus.value,
    backgroundColor: interpolateColor(
      focus.value,
      [0, 1],
      [colors.border, colors.accent]
    ),
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Step ${index + 1}`}
      hitSlop={8}
      onPress={() => onSelect(index)}
      style={styles.hit}
    >
      <Animated.View style={[styles.segment, style]} />
    </Pressable>
  );
}

/**
 * Custom progress indicator: four short horizontal pills. The active pill
 * stretches out smoothly; inactive ones sit quiet at border tone.
 */
export function OnboardingProgress({
  count,
  current,
  onSelect,
}: OnboardingProgressProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }, (_, index) => (
        <Segment key={index} index={index} current={current} onSelect={onSelect} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  hit: {
    paddingVertical: 8,
  },
  segment: {
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
  },
});
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { colors } from "@/theme/colors";

export type SetupProgressProps = {
  count: number;
  current: number;
};

const DONE_WIDTH = 34;
const CURRENT_WIDTH = 42;
const FUTURE_WIDTH = 20;
const HEIGHT = 6;

type SegmentState = "future" | "done" | "current";

function Segment({ state }: { state: SegmentState }) {
  const target = state === "current" ? 2 : state === "done" ? 1 : 0;
  const focus = useSharedValue(target);

  useEffect(() => {
    focus.value = withSpring(target, {
      damping: 18,
      stiffness: 240,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const style = useAnimatedStyle(() => ({
    width: interpolate(
      focus.value,
      [0, 1, 2],
      [FUTURE_WIDTH, DONE_WIDTH, CURRENT_WIDTH],
      Extrapolation.CLAMP
    ),
    backgroundColor: interpolateColor(
      focus.value,
      [0, 1, 2],
      [colors.border, colors.accent, colors.accentDark]
    ),
  }));

  return <Animated.View style={[styles.segment, style]} />;
}

/**
 * The setup flow's pace: four horizontal pills. Completed stages sit solid
 * coral, the current one is emphasized (longer, deeper), the future stays
 * quiet. Springs keep the morphs smooth.
 */
export function SetupProgress({ count, current }: SetupProgressProps) {
  return (
    <View
      style={styles.row}
      accessibilityLabel={`Setup step ${current + 1} of ${count}`}
    >
      {Array.from({ length: count }, (_, index) => (
        <Segment
          key={index}
          state={index < current ? "done" : index === current ? "current" : "future"}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  segment: {
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
  },
});
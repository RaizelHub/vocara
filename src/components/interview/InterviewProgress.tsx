import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/theme/colors";

export type InterviewProgressProps = {
  total: number;
  current: number;
};

/**
 * A thin beat-by-beat progress strip: one segment per question, filling
 * coral as the interview moves forward.
 */
export function InterviewProgress({ total, current }: InterviewProgressProps) {
  return (
    <View style={styles.track} accessibilityLabel={`Question ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <Segment key={i} filled={i < current} />
      ))}
    </View>
  );
}

function Segment({ filled }: { filled: boolean }) {
  const p = useSharedValue(filled ? 1 : 0);

  useEffect(() => {
    p.value = withTiming(filled ? 1 : 0, { duration: 420 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filled]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [colors.roomLine, colors.accent]),
  }));

  return <Animated.View style={[styles.segment, style]} />;
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    gap: 5,
    height: 4,
  },
  segment: {
    flex: 1,
    borderRadius: 2,
    height: "100%",
  },
});
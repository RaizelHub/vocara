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

export type ProgressLineProps = {
  /** Delay before the fill starts moving, in ms. */
  delay?: number;
  /** How long the fill takes, in ms. */
  duration?: number;
  reducedMotion?: boolean;
};

/**
 * Understated loading line: a thin coral fill that gradually crosses a
 * hairline track. Sits quietly near the bottom of the splash screen.
 */
export function ProgressLine({
  delay = 1550,
  duration = 1450,
  reducedMotion = false,
}: ProgressLineProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    const speed = reducedMotion ? 0.45 : 1;
    progress.value = withDelay(
      delay,
      withTiming(1, {
        duration: duration * speed,
        easing: reducedMotion ? Easing.linear : Easing.inOut(Easing.quad),
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay, duration, reducedMotion]);

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 132,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: {
    width: "100%",
    height: "100%",
    borderRadius: 2,
    backgroundColor: colors.accent,
    transformOrigin: "left",
  },
});
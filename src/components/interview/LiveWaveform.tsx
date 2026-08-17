import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/theme/colors";

export type LiveWaveformProps = {
  /** When true, bars breathe in an organic loop; otherwise they rest. */
  active?: boolean;
  /** Higher values make bars sway more. */
  intensity?: number;
  /** Live/bar (animation) color; rest bars use `idleColor`. */
  color?: string;
  idleColor?: string;
  barCount?: number;
  height?: number;
  barWidth?: number;
  gap?: number;
};

/**
 * An organic voice waveform: independent bars with per-bar speeds, each
 * ebbing between a rest state and an individual peak while `active`.
 */
export function LiveWaveform({
  active = false,
  intensity = 1,
  color = colors.accent,
  idleColor = colors.roomLine,
  barCount = 24,
  height = 48,
  barWidth = 4,
  gap = 3,
}: LiveWaveformProps) {
  const bars = useMemo(() => {
    return Array.from({ length: barCount }, (_, i) => {
      const wave = Math.sin((i / barCount) * Math.PI * 2);
      const idle = height * (0.14 + 0.1 * (0.5 + 0.5 * wave));
      const peak = height * (0.34 + 0.5 * ((i * 7) % 10) / 10) * Math.min(1, 0.55 + intensity);
      const duration = 640 + ((i * 137) % 320);
      return { key: i, idle, peak, duration };
    });
  }, [barCount, height, intensity]);

  return (
    <View style={[styles.row, { height, gap }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
{bars.map((bar) => (
        <Bar key={bar.key} bar={bar} active={active} color={color} idleColor={idleColor} barWidth={barWidth} />
      ))}
    </View>
  );
}

function Bar({
  bar,
  active,
  color,
  idleColor,
  barWidth,
}: {
  bar: { key: number; idle: number; peak: number; duration: number };
  active: boolean;
  color: string;
  idleColor: string;
  barWidth: number;
}) {
  const h = useSharedValue(bar.idle);

  useEffect(() => {
    if (active) {
      h.value = withRepeat(
        withSequence(
          withTiming(bar.peak, { duration: bar.duration, easing: Easing.inOut(Easing.sin) }),
          withTiming(bar.idle, { duration: bar.duration * 0.85, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      h.value = withTiming(bar.idle, { duration: 240, easing: Easing.out(Easing.cubic) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const style = useAnimatedStyle(() => ({
    height: h.value,
    backgroundColor: active ? color : idleColor,
  }));

  return <Animated.View style={[styles.bar, { width: barWidth }, style]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  bar: {
    borderRadius: 999,
    marginHorizontal: 1,
  },
});
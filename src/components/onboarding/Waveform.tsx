import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/theme/colors";

export type WaveformProps = {
  barCount?: number;
  barWidth?: number;
  gap?: number;
  /** Height of the tallest bar in px. */
  maxHeight?: number;
  color?: string;
  /** When > 0, every nth bar is painted with the accent. */
  accentEvery?: number;
  accentColor?: string;
  active?: boolean;
  reducedMotion?: boolean;
};

type BarSpec = {
  weight: number;
  freq: number;
  phase: number;
};

/**
 * Deterministic (non-random) bar design so the shape is stable across
 * renders: a gentle weight envelope peaking near the center.
 */
function buildBars(count: number): BarSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const x = count === 1 ? 0.5 : i / (count - 1);
    const envelope = Math.max(0, Math.cos((x - 0.5) * Math.PI));
    const jitter = 0.35 * Math.sin(i * 4.7) + 0.1 * Math.sin(i * 13.3);
    return {
      weight: 0.24 + 0.8 * envelope + jitter,
      freq: 0.9 + 1.4 * Math.abs(Math.sin(i * 4.3977)),
      phase: (i * 0.5874) % 1,
    };
  });
}

type BarProps = {
  bar: BarSpec;
  barWidth: number;
  maxHeight: number;
  color: string;
  time: SharedValue<number>;
  intro: SharedValue<number>;
};

function Bar({ bar, barWidth, maxHeight, color, time, intro }: BarProps) {
  const style = useAnimatedStyle(() => {
    const t = (time.value * bar.freq + bar.phase) % 1;
    const pulse = Math.pow((Math.sin(t * Math.PI * 2) + 1) / 2, 0.8);
    const height = Math.max(
      3,
      maxHeight * bar.weight * (0.5 + 0.5 * pulse) * (0.35 + 0.65 * intro.value)
    );
    return { height };
  });

  return (
    <Animated.View
      style={[
        styles.bar,
        { width: barWidth, borderRadius: barWidth / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

/**
 * A voice-inspired waveform row. Bars oscillate forever on the UI thread
 * with their own frequency/phase; `intro` scales how loud they get, so the
 * row can fade in and out of an idle state.
 */
export function Waveform({
  barCount = 16,
  barWidth = 4,
  gap = 6,
  maxHeight = 84,
  color = colors.ink,
  accentEvery = 0,
  accentColor = colors.accent,
  active = false,
  reducedMotion = false,
}: WaveformProps) {
  const bars = useMemo(() => buildBars(barCount), [barCount]);
  const time = useSharedValue(0);
  const intro = useSharedValue(reducedMotion ? 0.55 : 0.3);

  useEffect(() => {
    if (active && !reducedMotion) {
      time.value = withRepeat(
        withTiming(1, { duration: 2200, easing: Easing.linear }),
        -1,
        false
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion]);

  useEffect(() => {
    intro.value = withDelay(
      active ? 160 : 0,
      withTiming(active ? 1 : 0.32, {
        duration: reducedMotion ? 300 : 1100,
        easing: Easing.out(Easing.cubic),
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion]);

  return (
    <View style={[styles.row, { gap }]}>
      {bars.map((bar, index) => (
        <Bar
          key={index}
          bar={bar}
          barWidth={barWidth}
          maxHeight={maxHeight}
          time={time}
          intro={intro}
          color={accentEvery > 0 && index % accentEvery === 0 ? accentColor : color}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  bar: {
    height: 1,
  },
});
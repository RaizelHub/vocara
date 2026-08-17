import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export type WaveBarProps = {
  /** Bar width in px. */
  width: number;
  /** Height the bar settles at when the waveform is quiet. */
  restHeight: number;
  /** Extra height the bar gains at full energy. */
  amplitude: number;
  /** Duration of one full oscillation in ms. */
  period: number;
  /** Phase offset in turns (0..1). */
  phase: number;
  /** Entrance stagger delay in ms. */
  delay: number;
  color: string;
  /** Shared energy level (0 = quiet, 1 = full). Driven by Waveform. */
  energy: SharedValue<number>;
  reducedMotion?: boolean;
};

const ENTRANCE_SPRING = { damping: 22, stiffness: 190, mass: 0.75 };

/**
 * A single rounded waveform bar. It springs in on mount, then oscillates
 * around its resting height indefinitely. `energy` controls how wide the
 * oscillation grows, so the waveform can "warm up" over time.
 */
export function WaveBar({
  width,
  restHeight,
  amplitude,
  period,
  phase,
  delay,
  color,
  energy,
  reducedMotion = false,
}: WaveBarProps) {
  const progress = useSharedValue(reducedMotion ? 0.25 : 0);
  const appear = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      appear.value = 1;
      return;
    }

    appear.value = withDelay(delay, withSpring(1, ENTRANCE_SPRING));
    progress.value = withRepeat(
      withTiming(1, { duration: period, easing: Easing.linear }),
      -1,
      false
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    const t = (progress.value + phase) % 1;
    // Single cycle of a sine, shaped so a bar briefly peaks then relaxes.
    const wave = (Math.sin(t * Math.PI * 2) + 1) / 2;
    const shape = 0.3 + 0.7 * Math.pow(wave, 1.3);

    return {
      height: (restHeight + amplitude * shape * energy.value) * appear.value,
      opacity: appear.value,
    };
  });

  return (
    <Animated.View
      style={[
        styles.bar,
        { width, borderRadius: width / 2, backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 1,
  },
});
import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/theme/colors";

export type InterviewerVoiceProps = {
  /** 0 = silent, 1 = asking a question, 2 = listening to the answer. */
  intensity?: 0 | 1 | 2;
  statusLabel?: string;
};

const BAR_COUNT = 26;
const RING = 132;
const CTX = RING / 2;
const BAR_HEIGHT = 24;

/**
 * The VOCARA interviewer's identity: an organic radial voice field made
 * of thin waveform bars. It rests while the candidate reads the question,
 * waves while "asking", and responds stronger while "listening".
 */
export function InterviewerVoice({ intensity = 0, statusLabel }: InterviewerVoiceProps) {
  const bars = useMemo(() => {
    const step = 360 / BAR_COUNT;
    return Array.from({ length: BAR_COUNT }, (_, i) => ({
      key: i,
      rotate: `${Math.round(i * step)}deg`,
      rest: 0.3 + ((i * 5) % 6) / 18,
      peak: 1.05 + ((i * 7) % 9) / 18,
      duration: 640 + ((i * 11) % 360),
    }));
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.field} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.core}>
          <Text style={styles.mark}>VOCARA</Text>
        </View>
        {bars.map((bar) => (
          <RadialBar key={bar.key} bar={bar} intensity={intensity} />
        ))}
      </View>
      <Text style={styles.name}>VOCARA Interviewer</Text>
      {statusLabel ? <Text style={styles.status}>{statusLabel}</Text> : null}
    </View>
  );
}

function RadialBar({
  bar,
  intensity,
}: {
  bar: { key: number; rotate: string; rest: number; peak: number; duration: number };
  intensity: number;
}) {
  const s = useSharedValue(bar.rest);

  useEffect(() => {
    if (intensity === 0) {
      s.value = withTiming(bar.rest, { duration: 300, easing: Easing.out(Easing.cubic) });
      return;
    }
    const pacing = intensity === 2 ? 1.25 : 0.8;
    s.value = withRepeat(
      withSequence(
        withTiming(bar.peak, { duration: Math.round(bar.duration * pacing), easing: Easing.inOut(Easing.sin) }),
        withTiming(bar.rest, { duration: Math.round(bar.duration * 0.85 * pacing), easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intensity]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: s.value }],
    backgroundColor: intensity === 0 ? "#3A3832" : colors.accent,
  }));

  return (
    <View pointerEvents="none" style={[styles.bar, { transform: [{ rotate: bar.rotate }] }]}>
      <Animated.View style={[styles.inner, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  field: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  core: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1,
    borderColor: "#2E2C27",
    backgroundColor: "#1F1E1A",
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#8C8A82",
  },
  bar: {
    position: "absolute",
    left: CTX - 1.5,
    top: CTX - BAR_HEIGHT / 2,
    width: 3,
    height: BAR_HEIGHT,
    alignItems: "center",
  },
  inner: {
    width: 3,
    height: BAR_HEIGHT,
    borderRadius: 2,
  },
  name: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: "#B9B8B0",
  },
  status: {
    marginTop: 6,
    fontSize: 13.5,
    color: "#8C8A82",
  },
});
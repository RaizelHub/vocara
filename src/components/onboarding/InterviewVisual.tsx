import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { Waveform } from "./Waveform";
import { colors } from "@/theme/colors";

export type InterviewVisualProps = {
  active: boolean;
  reducedMotion?: boolean;
};

const QUESTIONS = [
  "Tell me about a project you're proud of.",
  "How do you handle a disagreement with a teammate?",
  "Where do you see yourself in two years?",
];

function FadingQuestion({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (text === shown) return;
    const timer = setTimeout(() => {
      opacity.value = withSequence(
        withTiming(0, { duration: 200 }, () => {
          opacity.value = 0;
        }),
        withTiming(1, { duration: 260 })
      );
      setShown(text);
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Text style={[styles.question, style]} numberOfLines={2}>
      “{shown}”
    </Animated.Text>
  );
}

/**
 * A live interview moment: an interviewer question floats in a quiet
 * bubble with a recording waveform and a "Listening" status below it.
 */
export function InterviewVisual({
  active,
  reducedMotion = false,
}: InterviewVisualProps) {
  const [questionIndex, setQuestionIndex] = useState(0);

  useEffect(() => {
    if (!active || reducedMotion) return;
    const timer = setInterval(() => {
      setQuestionIndex((i) => (i + 1) % QUESTIONS.length);
    }, 4800);
    return () => clearInterval(timer);
  }, [active, reducedMotion]);

  const entrance = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    entrance.value = withDelay(
      reducedMotion ? 0 : 120,
      withTiming(1, {
        duration: reducedMotion ? 150 : 560,
        easing: Easing.out(Easing.cubic),
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion]);

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (1 - entrance.value) * 22 },
      { scale: 0.96 + 0.04 * entrance.value },
    ],
  }));

  const statusStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.bubble, bubbleStyle]}>
        <Text style={styles.caption}>INTERVIEWER</Text>
        <FadingQuestion text={QUESTIONS[questionIndex]} />
      </Animated.View>

      <Animated.View style={[styles.statusRow, statusStyle]}>
        <View style={styles.pulseDot} />
        <Text style={styles.statusText}>Listening…</Text>
      </Animated.View>

      <Waveform
        barCount={18}
        barWidth={4.5}
        gap={5}
        maxHeight={44}
        accentEvery={7}
        active={active}
        reducedMotion={reducedMotion}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 340,
  },
  bubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  caption: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.8,
    color: colors.muted,
    marginBottom: 8,
  },
  question: {
    fontSize: 17.5,
    lineHeight: 24,
    fontWeight: "600",
    color: colors.ink,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.accent,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.4,
    color: colors.secondary,
  },
});
import { useEffect } from "react";
import type { ReactNode } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/theme/colors";

export type OnboardingSlideProps = {
  active: boolean;
  reducedMotion?: boolean;
  visual?: ReactNode;
  /** Headline lines; a coral period is appended to the last line. */
  headline: string[];
  copy?: string;
};

/**
 * One onboarding stage. The visual, headline and copy enter with the same
 * restrained choreography every time the slide becomes active.
 */
export function OnboardingSlide({
  active,
  reducedMotion = false,
  visual,
  headline,
  copy,
}: OnboardingSlideProps) {
  const { width } = useWindowDimensions();
  const headlineSize = Math.min(44, Math.max(31, Math.round(width * 0.105)));

  const intro = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    intro.value = 0;
    intro.value = withTiming(1, {
      duration: reducedMotion ? 200 : 620,
      easing: Easing.out(Easing.cubic),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion]);

  const textStyle = useAnimatedStyle(() => ({
    opacity: intro.value,
    transform: [{ translateY: (1 - intro.value) * 20 }],
  }));

  const copyStyle = useAnimatedStyle(() => ({
    opacity: intro.value,
    transform: [{ translateY: (1 - intro.value) * 14 }],
  }));

  return (
    <View style={styles.container}>
      {visual != null && <View style={styles.visual}>{visual}</View>}
      <Animated.Text
        style={[
          styles.headline,
          { fontSize: headlineSize, lineHeight: Math.round(headlineSize * 1.1) },
          textStyle,
        ]}
      >
        {headline.map((line, index) => (
          <Text key={index}>
            {line}
            {index === headline.length - 1 && (
              <Text style={styles.accentPeriod}>.</Text>
            )}
            {index < headline.length - 1 && "\n"}
          </Text>
        ))}
      </Animated.Text>
      {copy != null && (
        <Animated.Text style={[styles.copy, copyStyle]}>{copy}</Animated.Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  visual: {
    marginBottom: 34,
  },
  headline: {
    color: colors.ink,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  accentPeriod: {
    color: colors.accent,
  },
  copy: {
    marginTop: 14,
    fontSize: 16.5,
    lineHeight: 24,
    color: colors.secondary,
    fontWeight: "400",
    maxWidth: 340,
  },
});
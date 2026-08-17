import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";

const WAVE = [0.3, 0.52, 0.68, 0.92, 0.6, 0.42, 0.58, 0.96, 0.7, 0.44, 0.28, 0.62, 0.86, 0.5, 0.36, 0.72, 0.94, 0.58, 0.4, 0.24, 0.52, 0.7, 0.42];

export type ReadinessHeroProps = {
  score: number;
  change: number;
  targetRole: string;
  focusAreas: string[];
  onStart: () => void;
};

/**
 * The heart of the home screen: a voice-wave progress path that fills
 * once, the score counting in beside it, and the strongest CTA on the app.
 */
export function ReadinessHero({ score, change, targetRole, focusAreas, onStart }: ReadinessHeroProps) {
  const wave = useSharedValue(0);
  const rising = change >= 0;

  useEffect(() => {
    wave.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const waveFill = useAnimatedStyle(() => ({
    transform: [{ scaleX: wave.value }],
  }));

  return (
    <View style={styles.panel}>
      <View style={styles.waveRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {WAVE.map((ratio, i) => (
          <View key={`base-${i}`} style={[styles.bar, { height: WAVE_HEIGHT * ratio }]} />
        ))}
        <Animated.View style={[StyleSheet.absoluteFill, styles.waveClip, waveFill]}>
          <View style={styles.waveRow}>
            {WAVE.map((ratio, i) => (
              <View key={`fill-${i}`} style={[styles.bar, styles.fillBar, { height: WAVE_HEIGHT * ratio }]} />
            ))}
          </View>
        </Animated.View>
      </View>

      <Text style={styles.scoreLabel} accessibilityRole="header">
        Interview readiness
      </Text>
      <AnimatedNumber value={score} delay={150} style={styles.score} accessibilityLabel={`${score} percent readiness`} />
      <View style={styles.changeRow}>
        <Ionicons
          name={rising ? "arrow-up" : "arrow-down"}
          size={13}
          color={rising ? colors.success : colors.warning}
        />
        <Text style={[styles.changeText, !rising && styles.changeTextDown]}>
          {rising ? "+" : ""}
          {change} points this week
        </Text>
      </View>

      <View style={styles.divider} />

      <PressableScale onPress={onStart} accessibilityLabel="Start interview" style={styles.ctaWrap}>
        <View style={styles.cta}>
          <Text style={styles.ctaLabel}>Start interview</Text>
          <Ionicons name="chevron-forward" size={19} color="#FFFFFF" />
        </View>
      </PressableScale>
      <Text style={styles.ctaHint}>Practice with a realistic AI interviewer.</Text>

      <Text style={styles.personalization} numberOfLines={2}>
        Preparing for {targetRole}
        {focusAreas.length > 0 ? ` · Focus: ${focusAreas.join(", ")}` : ""}
      </Text>
    </View>
  );
}

const WAVE_HEIGHT = 64;

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    shadowColor: "#151515",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: WAVE_HEIGHT,
    marginBottom: 18,
  },
  waveClip: {
    overflow: "hidden",
  },
  bar: {
    flex: 1,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  fillBar: {
    backgroundColor: colors.accent,
  },
  scoreLabel: {
    fontSize: 13.5,
    color: colors.secondary,
    fontWeight: "600",
    textAlign: "center",
  },
  score: {
    marginTop: 2,
    fontSize: 76,
    fontWeight: "800",
    letterSpacing: -3,
    color: colors.ink,
    textAlign: "center",
    lineHeight: 84,
    includeFontPadding: false,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 4,
  },
  changeText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.success,
  },
  changeTextDown: {
    color: colors.warning,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 18,
  },
  ctaWrap: {
    marginBottom: 10,
  },
  cta: {
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  ctaLabel: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  ctaHint: {
    fontSize: 12.5,
    color: colors.secondary,
    textAlign: "center",
    marginBottom: 12,
  },
  personalization: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    textAlign: "center",
  },
});

import { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";

const WAVE = [
  0.28, 0.48, 0.65, 0.88, 0.58, 0.4, 0.55, 0.94, 0.68, 0.42, 0.28, 0.6,
  0.84, 0.52, 0.36, 0.7, 0.92, 0.56, 0.38, 0.24, 0.5, 0.68, 0.4,
];

export type ReadinessHeroProps = {
  score: number;
  change: number;
  targetRole: string;
  focusAreas: string[];
  onStart: () => void;
};

/**
 * The heart of the home screen: a dynamic voice-wave progress visualizer,
 * counting score in bold typography, and a prominent call to action.
 */
export function ReadinessHero({
  score,
  change,
  targetRole,
  focusAreas,
  onStart,
}: ReadinessHeroProps) {
  const waveFill = useSharedValue(0);
  const breath = useSharedValue(1);
  const rising = change >= 0;

  useEffect(() => {
    waveFill.value = withTiming(1, {
      duration: 1100,
      easing: Easing.out(Easing.cubic),
    });

    breath.value = withDelay(
      1200,
      withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.94, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const waveFillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: waveFill.value }],
  }));

  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: breath.value }],
  }));

  return (
    <View style={styles.panel}>
      <Animated.View
        style={[styles.waveContainer, breathStyle]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.waveRow}>
          {WAVE.map((ratio, i) => (
            <View
              key={`base-${i}`}
              style={[styles.bar, { height: WAVE_HEIGHT * ratio }]}
            />
          ))}
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.waveClip, waveFillStyle]}
          >
            <View style={styles.waveRow}>
              {WAVE.map((ratio, i) => (
                <View
                  key={`fill-${i}`}
                  style={[
                    styles.bar,
                    styles.fillBar,
                    { height: WAVE_HEIGHT * ratio },
                  ]}
                />
              ))}
            </View>
          </Animated.View>
        </View>
      </Animated.View>

      <Text style={styles.scoreLabel} accessibilityRole="header">
        INTERVIEW READINESS
      </Text>

      <View style={styles.scoreRow}>
        <AnimatedNumber
          value={score}
          delay={150}
          style={styles.score}
          accessibilityLabel={`${score} percent readiness`}
        />
        <Text style={styles.scorePercent}>%</Text>
      </View>

      <View style={styles.changeBadgeRow}>
        <View
          style={[
            styles.changeBadge,
            rising ? styles.changeBadgeUp : styles.changeBadgeDown,
          ]}
        >
          <Ionicons
            name={rising ? "arrow-up" : "arrow-down"}
            size={12}
            color={rising ? colors.success : colors.warning}
          />
          <Text
            style={[
              styles.changeText,
              rising ? styles.changeTextUp : styles.changeTextDown,
            ]}
          >
            {rising ? "+" : ""}
            {change} this week
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      <PressableScale
        onPress={onStart}
        accessibilityLabel="Start interview"
        activeScale={0.97}
        style={styles.ctaWrap}
      >
        <View style={styles.cta}>
          <Text style={styles.ctaLabel}>Start interview</Text>
          <View style={styles.ctaIconCircle}>
            <Ionicons name="chevron-forward" size={17} color={colors.accent} />
          </View>
        </View>
      </PressableScale>

      <Text style={styles.ctaHint}>
        Practice with a realistic AI interviewer & instant feedback
      </Text>

      <View style={styles.personalizationCard}>
        <Ionicons name="sparkles-outline" size={13} color={colors.accent} />
        <Text style={styles.personalization} numberOfLines={2}>
          Preparing for <Text style={styles.personalizationBold}>{targetRole}</Text>
          {focusAreas.length > 0 ? ` · ${focusAreas.join(", ")}` : ""}
        </Text>
      </View>
    </View>
  );
}

const WAVE_HEIGHT = 58;

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.05,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: "0 8px 24px rgba(21, 21, 21, 0.05)",
      },
      default: {},
    }),
  },
  waveContainer: {
    height: WAVE_HEIGHT,
    marginBottom: 16,
  },
  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3.5,
    height: WAVE_HEIGHT,
  },
  waveClip: {
    overflow: "hidden",
  },
  bar: {
    flex: 1,
    borderRadius: 4,
    backgroundColor: colors.borderSubtle,
  },
  fillBar: {
    backgroundColor: colors.accent,
  },
  scoreLabel: {
    fontSize: 11.5,
    color: colors.muted,
    fontWeight: "800",
    letterSpacing: 1.2,
    textAlign: "center",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    marginTop: 2,
  },
  score: {
    fontSize: 72,
    fontWeight: "900",
    letterSpacing: -3,
    color: colors.ink,
    lineHeight: 80,
    includeFontPadding: false,
  },
  scorePercent: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.secondary,
    marginLeft: 2,
  },
  changeBadgeRow: {
    alignItems: "center",
    marginTop: 4,
    marginBottom: 4,
  },
  changeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  changeBadgeUp: {
    backgroundColor: colors.successLight,
  },
  changeBadgeDown: {
    backgroundColor: colors.warningLight,
  },
  changeText: {
    fontSize: 12.5,
    fontWeight: "800",
  },
  changeTextUp: {
    color: colors.success,
  },
  changeTextDown: {
    color: colors.warning,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: 18,
  },
  ctaWrap: {
    marginBottom: 10,
  },
  cta: {
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: colors.accent,
        shadowOpacity: 0.28,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: "0 4px 14px rgba(255, 90, 54, 0.28)",
      },
      default: {},
    }),
  },
  ctaLabel: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  ctaIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaHint: {
    fontSize: 12.5,
    color: colors.secondary,
    textAlign: "center",
    marginBottom: 14,
  },
  personalizationCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  personalization: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.secondary,
  },
  personalizationBold: {
    fontWeight: "700",
    color: colors.ink,
  },
});


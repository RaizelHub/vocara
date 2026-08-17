import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProgressLine } from "@/components/splash/ProgressLine";
import { Waveform } from "@/components/splash/Waveform";
import { colors } from "@/theme/colors";

/** Timing (ms) for the full opening sequence. */
const TIMING = {
  wordmark: 900,
  tagline: 1350,
  progress: 1550,
  fadeOut: 2620,
  fadeOutDuration: 420,
  navigate: 3320,
} as const;

/** Reduced-motion screens are much calmer and much shorter. */
const REDUCED_TIMING = {
  wordmark: 400,
  tagline: 650,
  progress: 850,
  fadeOut: 1750,
  fadeOutDuration: 360,
  navigate: 2350,
} as const;

export default function SplashScreen() {
  const insets = useSafeAreaInsets();
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  const wordmarkOpacity = useSharedValue(0);
  const wordmarkOffset = useSharedValue(14);
  const taglineOpacity = useSharedValue(0);
  const taglineOffset = useSharedValue(10);
  const screenOpacity = useSharedValue(1);
  const screenScale = useSharedValue(1);

  const navigated = useRef(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReducedMotion(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reducedMotion === null) return;

    const t = reducedMotion ? REDUCED_TIMING : TIMING;
    const easeOut = Easing.out(Easing.cubic);

    wordmarkOpacity.value = withDelay(t.wordmark, withTiming(1, { duration: 450, easing: easeOut }));
    wordmarkOffset.value = withDelay(t.wordmark, withTiming(0, { duration: 520, easing: easeOut }));

    taglineOpacity.value = withDelay(t.tagline, withTiming(1, { duration: 420, easing: easeOut }));
    taglineOffset.value = withDelay(t.tagline, withTiming(0, { duration: 480, easing: easeOut }));

    screenOpacity.value = withDelay(t.fadeOut, withTiming(0, { duration: t.fadeOutDuration, easing: Easing.in(Easing.quad) }));
    screenScale.value = withDelay(t.fadeOut, withTiming(0.985, { duration: t.fadeOutDuration, easing: Easing.in(Easing.quad) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion === null) return;
    const t = reducedMotion ? REDUCED_TIMING : TIMING;

    const timer = setTimeout(() => {
      if (navigated.current) return;
      navigated.current = true;
      router.replace("/onboarding");
    }, t.navigate);

    return () => clearTimeout(timer);
  }, [reducedMotion]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
    transform: [{ scale: screenScale.value }],
  }));

  const loadingStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value * taglineOpacity.value,
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkOffset.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineOffset.value }],
  }));

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <Animated.View style={[styles.content, contentStyle]}>
        <Waveform reducedMotion={reducedMotion === true} />

        <Animated.Text style={[styles.wordmark, wordmarkStyle]}>
          VOCARA
        </Animated.Text>

        <Animated.View style={[styles.taglineRow, taglineStyle]}>
          <Text style={styles.tagline} numberOfLines={1} adjustsFontSizeToFit>
            Speak better. Interview smarter
            <Text style={styles.taglineAccent}>.</Text>
          </Text>
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={[styles.loading, { bottom: insets.bottom + 26 }, loadingStyle]}
      >
        <ProgressLine
          reducedMotion={reducedMotion === true}
          delay={reducedMotion ? REDUCED_TIMING.progress : TIMING.progress}
          duration={reducedMotion ? 600 : 1450}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  wordmark: {
    marginTop: 36,
    fontSize: 42,
    fontWeight: "800",
    letterSpacing: 11,
    color: colors.ink,
    textAlign: "center",
  },
  taglineRow: {
    marginTop: 22,
    height: 34,
    justifyContent: "center",
  },
  tagline: {
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: 0.6,
    color: colors.secondary,
    textAlign: "center",
  },
  taglineAccent: {
    color: colors.accent,
    fontWeight: "700",
  },
  loading: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
});
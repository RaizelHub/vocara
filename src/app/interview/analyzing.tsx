import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InterviewerVoice } from "@/components/interview/InterviewerVoice";
import { LiveWaveform } from "@/components/interview/LiveWaveform";
import { colors } from "@/theme/colors";

const HOLD_MS = 2000;

export default function InterviewAnalyzingScreen() {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/interview/results" as Href);
    }, HOLD_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      <View style={styles.body}>
        <Animated.View entering={FadeIn.duration(500)}>
          <InterviewerVoice intensity={1} statusLabel="Working through your answers…" />
        </Animated.View>

        <Animated.View entering={FadeIn.delay(260).duration(500)} style={styles.textBlock}>
          <Text style={styles.title}>Building your feedback</Text>
          <Text style={styles.description}>
            {"We're"} reviewing your answers across clarity, confidence, relevance,
            grammar, and structure.
          </Text>
        </Animated.View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 30 }]}>
        <LiveWaveform active barCount={28} height={34} intensity={0.7} barWidth={3} gap={2} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.room,
  },
  body: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
    gap: 36,
  },
  textBlock: {
    alignItems: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.7,
    color: "#F6F5F0",
    textAlign: "center",
  },
  description: {
    fontSize: 14.5,
    lineHeight: 21.5,
    color: "#9C9B93",
    textAlign: "center",
    marginTop: 10,
    maxWidth: 320,
  },
  footer: {
    alignItems: "center",
  },
});
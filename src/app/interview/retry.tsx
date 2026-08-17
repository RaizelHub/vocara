import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton } from "@/components/ui/BackButton";
import { PressableScale } from "@/components/ui/PressableScale";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { colors } from "@/theme/colors";

const STEPS = [
  {
    label: "Situation",
    prompt: "Name the problem and why it mattered in one or two sentences.",
  },
  {
    label: "Action",
    prompt: "Describe the two or three decisions that were specifically yours.",
  },
  {
    label: "Result",
    prompt: "Finish with the impact, ideally using a number or clear outcome.",
  },
];

export default function InterviewRetryScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ question?: string }>();
  const question =
    typeof params.question === "string"
      ? params.question
      : "Describe a difficult problem you solved.";

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(360)}>
          <Text style={styles.eyebrow}>Focused retry</Text>
          <Text style={styles.title}>Give this answer another try.</Text>
          <Text style={styles.subtitle}>
            Use a simple structure before starting another behavioral practice session.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(360)} style={styles.questionBlock}>
          <Text style={styles.questionLabel}>Question</Text>
          <Text style={styles.question}>{question}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(360)} style={styles.steps}>
          {STEPS.map((step, index) => (
            <View key={step.label} style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepLabel}>{step.label}</Text>
                <Text style={styles.stepPrompt}>{step.prompt}</Text>
              </View>
            </View>
          ))}
        </Animated.View>

        <View style={styles.actions}>
          <PrimaryButton
            label="Set up behavioral practice"
            onPress={() =>
              router.replace({
                pathname: "/interview/setup",
                params: { type: "behavioral" },
              })
            }
          />
          <PressableScale
            onPress={() => router.back()}
            accessibilityLabel="Back to interview results"
            collapsed
            style={styles.backPress}
          >
            <Text style={styles.backText}>Back to results</Text>
          </PressableScale>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  eyebrow: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: colors.accent,
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: colors.ink,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.secondary,
  },
  questionBlock: {
    marginTop: 28,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  questionLabel: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  question: {
    marginTop: 10,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  steps: {
    marginTop: 28,
    gap: 18,
  },
  step: {
    flexDirection: "row",
    gap: 13,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "#FBEEE9",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.accent,
  },
  stepCopy: {
    flex: 1,
  },
  stepLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
  },
  stepPrompt: {
    marginTop: 4,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.secondary,
  },
  actions: {
    marginTop: 32,
  },
  backPress: {
    alignSelf: "center",
    marginTop: 14,
  },
  backText: {
    minHeight: 42,
    lineHeight: 42,
    includeFontPadding: false,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: "800",
    color: colors.secondary,
  },
});

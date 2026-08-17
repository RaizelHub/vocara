import { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InterviewVisual } from "@/components/onboarding/InterviewVisual";
import { JobMatchVisual } from "@/components/onboarding/JobMatchVisual";
import { OnboardingSlide } from "@/components/onboarding/OnboardingSlide";
import { OnboardingPager } from "@/components/onboarding/OnboardingPager";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ReadinessVisual } from "@/components/onboarding/ReadinessVisual";
import { VoiceAnalysisVisual } from "@/components/onboarding/VoiceAnalysisVisual";
import { colors } from "@/theme/colors";

export const ONBOARDING_STAGES = 4;
export const LAST_STAGE = ONBOARDING_STAGES - 1;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState(0);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReducedMotion(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const reduced = reducedMotion === true;
  const isLast = stage === LAST_STAGE;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.brand}>VOCARA</Text>
        {!isLast && (
          <Pressable
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => setStage(LAST_STAGE)}
            style={styles.skipHit}
          >
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        )}
      </View>

      <OnboardingPager
        current={stage}
        onChange={setStage}
        reducedMotion={reduced}
      >
        <OnboardingSlide
          active={stage === 0}
          reducedMotion={reduced}
          visual={<InterviewVisual active={stage === 0} reducedMotion={reduced} />}
          headline={["Practice for the", "interview you want"]}
          copy="Realistic interview questions tailored to your role, experience, and goals."
        />
        <OnboardingSlide
          active={stage === 1}
          reducedMotion={reduced}
          visual={<VoiceAnalysisVisual active={stage === 1} reducedMotion={reduced} />}
          headline={["Your voice tells", "the whole story"]}
          copy="VOCARA listens to your answers and helps you improve clarity, confidence, grammar, and structure."
        />
        <OnboardingSlide
          active={stage === 2}
          reducedMotion={reduced}
          visual={<JobMatchVisual active={stage === 2} reducedMotion={reduced} />}
          headline={["Prepare for the", "actual job"]}
          copy="Paste a job description and VOCARA creates questions based on what employers really look for."
        />
        <OnboardingSlide
          active={stage === 3}
          reducedMotion={reduced}
          visual={<ReadinessVisual active={stage === 3} reducedMotion={reduced} />}
          headline={["Walk in", "ready"]}
          copy="Practice consistently, track your improvement, and build the confidence to perform when it matters."
        />
      </OnboardingPager>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <OnboardingProgress
          count={ONBOARDING_STAGES}
          current={stage}
          onSelect={setStage}
        />

        <View style={styles.footerAction}>
          <PrimaryButton
            label={isLast ? "Get started" : "Next"}
            onPress={() => {
              if (isLast) {
                router.push("/signup");
              } else {
                setStage((s) => Math.min(LAST_STAGE, s + 1));
              }
            }}
          />
          {isLast && (
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => router.push("/login")}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>I already have an account</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  brand: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 3.4,
    color: colors.ink,
  },
  skipHit: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  skip: {
    fontSize: 14.5,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: colors.muted,
  },
  footer: {
    paddingHorizontal: 24,
  },
  footerAction: {
    marginTop: 18,
    alignSelf: "stretch",
  },
  secondaryButton: {
    alignSelf: "center",
    marginTop: 18,
    paddingVertical: 6,
  },
  secondaryButtonPressed: {
    opacity: 0.55,
  },
  secondaryLabel: {
    fontSize: 14.5,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: colors.secondary,
  },
});
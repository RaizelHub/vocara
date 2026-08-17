import { useCallback, useEffect, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GoalsStep } from "@/components/setup/GoalsStep";
import { OptionRow } from "@/components/setup/OptionRow";
import { PlanSummary } from "@/components/setup/PlanSummary";
import { RoleStep } from "@/components/setup/RoleStep";
import { SetupProgress } from "@/components/setup/SetupProgress";
import { BackButton } from "@/components/ui/BackButton";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { getDataErrorMessage } from "@/lib/dataErrors";
import { useAuth } from "@/providers/AuthProvider";
import { careerSetupService } from "@/services/careerSetupService";
import { colors } from "@/theme/colors";
import { MAX_GOALS, type CareerSetupData } from "@/types/career";

const EXPERIENCE = [
  { title: "Just starting out", description: "Preparing for my first role or internship." },
  { title: "Less than 1 year", description: "Still finding my footing in the working world." },
  { title: "1 to 3 years", description: "I already have some real work experience." },
  { title: "3 to 5 years", description: "Comfortable in my field, aiming for the next step." },
  { title: "5+ years", description: "Experienced, and looking to level up my interviews." },
] as const;

const TIMELINES = [
  { title: "Within a few days", description: "An interview is already on the calendar." },
  { title: "Within 1 to 2 weeks", description: "Active prep with a steady pace." },
  { title: "Within a month", description: "Building skills with a bit more runway." },
  { title: "I'm just preparing", description: "No deadline — gaining confidence for later." },
] as const;

const STEPS: { question: string; support: string }[] = [
  {
    question: "What role are you\npreparing for?",
    support: "We'll tailor your practice around the kind of interview you want to ace.",
  },
  {
    question: "How experienced\nare you?",
    support: "We'll adjust the difficulty and style of your interview practice.",
  },
  {
    question: "What do you want to\nimprove most?",
    support: "Choose up to 3. VOCARA will focus your feedback around these areas.",
  },
  {
    question: "When is your next\ninterview?",
    support: "This helps VOCARA create the right practice pace.",
  },
] as const;

export default function CareerSetupScreen() {
  const { refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const questionSize = Math.min(33, Math.max(27, Math.round(width * 0.088)));

  const [step, setStep] = useState(0);
  const [data, setData] = useState<CareerSetupData>({
    role: "",
    customRole: "",
    experience: "",
    goals: [],
    interviewTimeline: "",
  });
  const [finishing, setFinishing] = useState(false);
  const [planReady, setPlanReady] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const targetRole =
    data.role === "Other" && data.customRole?.trim()
      ? data.customRole.trim()
      : data.role;

  const stepValid =
    step === 0
      ? data.role !== "" && (data.role !== "Other" || (data.customRole?.trim()?.length ?? 0) > 0)
      : step === 1
        ? data.experience !== ""
        : step === 2
          ? data.goals.length > 0
          : data.interviewTimeline !== "";

  useEffect(() => {
    const onBackPress = () => {
      if (planReady || finishing) return true;
      if (step > 0) {
        setStep((s) => s - 1);
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [step, planReady, finishing]);

  const handleContinue = useCallback(async () => {
    if (!stepValid || finishing) return;
    if (step < 3) {
      setStep((s) => s + 1);
      return;
    }

    setFinishing(true);
    setSubmitError(null);
    try {
      await careerSetupService.complete({
        targetRole,
        experienceLevel: data.experience,
        interviewTimeline: data.interviewTimeline,
        goals: data.goals,
      });
      setPlanReady(true);
    } catch (error) {
      setSubmitError(
        getDataErrorMessage(error, "We couldn't save your setup. Please try again."),
      );
    } finally {
      setFinishing(false);
    }
  }, [data, finishing, step, stepValid, targetRole]);

  const toggleGoal = useCallback((goal: string) => {
    setData((prev) => {
      if (prev.goals.includes(goal)) {
        return { ...prev, goals: prev.goals.filter((g) => g !== goal) };
      }
      if (prev.goals.length >= MAX_GOALS) return prev;
      return { ...prev, goals: [...prev.goals, goal] };
    });
  }, []);

  if (planReady) {
    return (
      <PlanSummary
        targetRole={targetRole}
        goals={data.goals}
        onComplete={refreshProfile}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <View style={[styles.topRow, { paddingTop: insets.top + 10 }]}>
            {step > 0 ? (
              <BackButton onPress={() => setStep((s) => s - 1)} />
            ) : (
              <View style={styles.backPlaceholder} />
            )}
            <SetupProgress count={4} current={step} />
            <View style={styles.backPlaceholder} />
          </View>

          <Animated.View
            key={step}
            entering={FadeInDown.duration(280)}
            exiting={FadeOutUp.duration(160)}
            style={styles.step}
          >
            <Text style={[styles.question, { fontSize: questionSize, lineHeight: Math.round(questionSize * 1.14) }]}>
              {STEPS[step].question}
            </Text>
            <Text style={styles.support}>{STEPS[step].support}</Text>

            {step === 0 && (
              <RoleStep
                role={data.role}
                customRole={data.customRole ?? ""}
                onChangeRole={(role) => setData((prev) => ({ ...prev, role }))}
                onChangeCustomRole={(customRole) => setData((prev) => ({ ...prev, customRole }))}
              />
            )}
            {step === 1 && (
              <View style={styles.singleOptions}>
                {EXPERIENCE.map((option) => (
                  <OptionRow
                    key={option.title}
                    title={option.title}
                    description={option.description}
                    selected={data.experience === option.title}
                    onPress={() => setData((prev) => ({ ...prev, experience: option.title }))}
                  />
                ))}
              </View>
            )}
            {step === 2 && (
              <GoalsStep goals={data.goals} onToggle={toggleGoal} />
            )}
            {step === 3 && (
              <View style={styles.singleOptions}>
                {TIMELINES.map((option) => (
                  <OptionRow
                    key={option.title}
                    title={option.title}
                    description={option.description}
                    selected={data.interviewTimeline === option.title}
                    onPress={() => setData((prev) => ({ ...prev, interviewTimeline: option.title }))}
                  />
                ))}
              </View>
            )}
          </Animated.View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          {submitError ? (
            <Text accessibilityRole="alert" style={styles.submitError}>
              {submitError}
            </Text>
          ) : null}
          <PrimaryButton
            label={step === 3 && data.interviewTimeline !== "" ? "Finish setup" : "Continue"}
            onPress={handleContinue}
            loading={finishing}
            disabled={!stepValid}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 40,
  },
  backPlaceholder: {
    width: 44,
    height: 44,
  },
  step: {
    paddingBottom: 24,
  },
  question: {
    color: colors.ink,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  support: {
    marginTop: 12,
    fontSize: 16.5,
    lineHeight: 24,
    color: colors.secondary,
    maxWidth: 330,
  },
  singleOptions: {
    marginTop: 34,
    gap: 12,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  submitError: {
    marginBottom: 10,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.error,
    textAlign: "center",
  },
});

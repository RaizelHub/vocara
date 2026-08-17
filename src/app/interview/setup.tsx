import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LiveWaveform } from "@/components/interview/LiveWaveform";
import { BackButton } from "@/components/ui/BackButton";
import { PressableScale } from "@/components/ui/PressableScale";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { colors } from "@/theme/colors";
import { getDataErrorMessage } from "@/lib/dataErrors";
import { useAuth } from "@/providers/AuthProvider";
import { interviewSessionService } from "@/services/interviewSessionService";
import { resetInterviewSession, startInterviewSession } from "@/state/session";
import type {
  Difficulty,
  InterviewLength,
  InterviewType,
  InterviewerStyle,
} from "@/types/interview";

const TYPE_OPTIONS: { value: InterviewType; title: string; description: string }[] = [
  {
    value: "standard",
    title: "Standard Interview",
    description: "Balanced mix of common behavioral and role-based questions.",
  },
  {
    value: "behavioral",
    title: "Behavioral",
    description: "Focus on situations, teamwork, challenges, and achievements.",
  },
  {
    value: "technical",
    title: "Technical",
    description: "Role-specific technical and problem-solving questions.",
  },
  {
    value: "mixed",
    title: "Mixed",
    description: "A realistic blend of behavioral and technical questions.",
  },
];

const LENGTH_OPTIONS: {
  value: InterviewLength;
  title: string;
  meta: string;
  description: string;
}[] = [
  { value: "quick", title: "Quick", meta: "5 questions · ~8 min", description: "A short warm-up with instant feedback." },
  { value: "standard", title: "Standard", meta: "8 questions · ~15 min", description: "A typical interview pace." },
  { value: "deep", title: "Deep Practice", meta: "12 questions · ~25 min", description: "For a full-length challenging session." },
];

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string; description: string }[] = [
  { value: "beginner", label: "Beginner", description: "Friendly questions that build on what you know." },
  {
    value: "intermediate",
    label: "Intermediate",
    description: "Questions similar to a real junior-to-mid-level interview.",
  },
  { value: "advanced", label: "Advanced", description: "Tricky, layered questions that push your thinking." },
];

const STYLE_OPTIONS: { value: InterviewerStyle; label: string }[] = [
  { value: "supportive", label: "Supportive" },
  { value: "balanced", label: "Balanced" },
  { value: "challenging", label: "Challenging" },
];

const ROLE_OPTIONS = [
  "Software Developer",
  "Virtual Assistant",
  "Customer Support",
  "IT Support",
  "Sales",
  "Teacher",
  "Marketing",
];

const PREP_STAGES = [
  "Preparing your interview…",
  "Analyzing your role…",
  "Selecting the right questions…",
  "Ready.",
];

export default function InterviewSetupScreen() {
  const { profile, preferences, user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string }>();
  const initialType = TYPE_OPTIONS.some((option) => option.value === params.type)
    ? (params.type as InterviewType)
    : "standard";

  const [type, setType] = useState<InterviewType>(initialType);
  const initialDifficulty = DIFFICULTY_OPTIONS.some(
    (option) => option.value === preferences?.default_difficulty,
  )
    ? (preferences?.default_difficulty as Difficulty)
    : "intermediate";
  const initialStyle = STYLE_OPTIONS.some(
    (option) => option.value === preferences?.default_interviewer_style,
  )
    ? (preferences?.default_interviewer_style as InterviewerStyle)
    : "balanced";

  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty);
  const [length, setLength] = useState<InterviewLength>("standard");
  const [style, setStyle] = useState<InterviewerStyle>(initialStyle);
  const [role, setRole] = useState(profile?.target_role?.trim() || "Software Developer");
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [stage, setStage] = useState(0);
  const [preparationError, setPreparationError] = useState<string | null>(null);

  const activeDifficulty = DIFFICULTY_OPTIONS.find((o) => o.value === difficulty)!;

  useEffect(() => {
    if (!preparing) return;
    let active = true;

    const interval = setInterval(() => {
      setStage((s) => Math.min(s + 1, PREP_STAGES.length - 1));
    }, 640);

    const prepare = async () => {
      if (!user) throw new Error("No authenticated user.");
      const nextSession = startInterviewSession({
        role,
        type,
        difficulty,
        interviewerStyle: style,
        length,
      });

      await Promise.all([
        interviewSessionService.ensureCreated(nextSession, user.id),
        new Promise((resolve) => setTimeout(resolve, 1800)),
      ]);
      if (active) router.replace("/interview/session" as Href);
    };

    void prepare().catch((error) => {
      if (!active) return;
      resetInterviewSession();
      setPreparationError(
        getDataErrorMessage(
          error,
          "We couldn't prepare your interview. Please try again.",
        ),
      );
      setPreparing(false);
    });

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [difficulty, length, preparing, role, style, type, user]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Set up your interview</Text>
        <Text style={styles.subtitle}>Choose how you want Vocara to challenge you.</Text>

        {/* Type */}
        <Text style={styles.sectionLabel}>Interview type</Text>
        <View style={styles.typeList}>
          {TYPE_OPTIONS.map((option) => {
            const selected = option.value === type;
            return (
              <PressableScale
                key={option.value}
                onPress={() => setType(option.value)}
                accessibilityLabel={`${option.title}. ${selected ? "Selected" : ""}`}
                style={styles.typeRowWrap}
              >
                <View style={[styles.typeRow, selected && styles.rowSelected]}>
<View style={styles.typeText}>
                        <Text style={[styles.typeTitle, selected && styles.typeSelected]}>
                          {option.title}
                        </Text>
                        <Text style={styles.typeDescription}>{option.description}</Text>
                      </View>
                      <View style={[styles.radio, selected && styles.radioOn]}>
                        {selected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                      </View>
                </View>
              </PressableScale>
            );
          })}
        </View>

        {/* Role */}
        <Text style={styles.sectionLabel}>Interviewing for</Text>
        <PressableScale
          onPress={() => setRoleModalVisible(true)}
          accessibilityLabel="Change role"
          style={styles.roleCardWrap}
        >
          <View style={styles.roleCard}>
            <View style={styles.typeText}>
              <Text style={styles.roleTitle}>{role}</Text>
              <Text style={styles.roleHint}>Questions will be tailored to this role.</Text>
            </View>
            <Text style={styles.changeRole}>Change role</Text>
          </View>
        </PressableScale>

        {/* Difficulty */}
        <Text style={styles.sectionLabel}>Difficulty</Text>
        <Segmented
          options={DIFFICULTY_OPTIONS.map((o) => o.label)}
          value={activeDifficulty.label}
          onChange={(label) => {
            const next = DIFFICULTY_OPTIONS.find((o) => o.label === label);
            if (next) setDifficulty(next.value);
          }}
        />
        <Text style={styles.sectionHint}>{activeDifficulty.description}</Text>

        {/* Length */}
        <Text style={styles.sectionLabel}>Interview length</Text>
        <View style={styles.typeList}>
          {LENGTH_OPTIONS.map((option) => {
            const selected = option.value === length;
            return (
              <PressableScale
                key={option.value}
                onPress={() => setLength(option.value)}
                accessibilityLabel={`${option.title}, ${option.meta}`}
                style={styles.typeRowWrap}
              >
                <View style={[styles.typeRow, selected && styles.rowSelected]}>
                  <View style={styles.typeText}>
                    <Text style={[styles.typeTitle, selected && styles.typeSelected]}>
                      {option.title}
                    </Text>
                    <Text style={styles.typeDescription}>{option.description}</Text>
                  </View>
                  <Text style={styles.lengthMeta}>{option.meta}</Text>
                </View>
              </PressableScale>
            );
          })}
        </View>

        {/* Interviewer style */}
        <Text style={styles.sectionLabel}>Interviewer style</Text>
        <Segmented
          options={STYLE_OPTIONS.map((o) => o.label)}
          value={STYLE_OPTIONS.find((o) => o.value === style)!.label}
          onChange={(label) => {
            const next = STYLE_OPTIONS.find((o) => o.label === label);
            if (next) setStyle(next.value);
          }}
        />

        <View style={styles.ctaWrap}>
          <PrimaryButton
            label="Start interview"
            onPress={() => {
              setPreparationError(null);
              setStage(0);
              setPreparing(true);
            }}
            disabled={preparing}
          />
          {preparationError && <Text style={styles.preparationError}>{preparationError}</Text>}
        </View>
      </ScrollView>

      {/* Role picker */}
      <Modal
        visible={roleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRoleModalVisible(false)} accessible={false} />
          <Animated.View entering={FadeInDown.duration(260)} style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select role</Text>
            {ROLE_OPTIONS.map((option) => {
              const selected = option === role;
              return (
                <PressableScale
                  key={option}
                  onPress={() => {
                    setRole(option);
                    setRoleModalVisible(false);
                  }}
                  accessibilityLabel={option}
                  style={styles.roleOptionWrap}
                >
                  <View style={[styles.roleOption, selected && styles.roleOptionSelected]}>
                    <Text style={[styles.roleOptionText, selected && styles.roleOptionTextSelected]}>
                      {option}
                    </Text>
                    {selected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                  </View>
                </PressableScale>
              );
            })}
          </Animated.View>
        </View>
      </Modal>

{/* Preparation overlay */}
      {preparing && (
        <View style={styles.prepOverlay}>
          <LiveWaveform active barCount={26} height={52} intensity={0.9} />
          <Animated.Text key={`stage-${stage}`} entering={FadeInDown.duration(300)} style={styles.prepStage}>
            {PREP_STAGES[stage]}
          </Animated.Text>
        </View>
      )}
    </View>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (label: string) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <PressableScale
            key={option}
            onPress={() => onChange(option)}
            accessibilityLabel={option}
            style={[styles.segmentWrap, selected && styles.segSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option}</Text>
          </PressableScale>
        );
      })}
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
    paddingTop: 8,
    paddingBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.7,
    color: colors.ink,
  },
  subtitle: {
    fontSize: 15.5,
    color: colors.secondary,
    marginTop: 5,
    marginBottom: 4,
  },
  sectionLabel: {
    marginTop: 30,
    marginBottom: 12,
    fontSize: 12.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  typeList: {
    gap: 10,
  },
  typeRowWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  rowSelected: {
    borderColor: colors.accent,
    backgroundColor: "#FBEEE9",
  },
  typeText: {
    flex: 1,
  },
  typeTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: colors.ink,
  },
  typeSelected: {
    color: colors.ink,
  },
  typeDescription: {
    fontSize: 13,
    lineHeight: 18.5,
    color: colors.secondary,
    marginTop: 3,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  roleCardWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
  },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  roleTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: colors.ink,
  },
  roleHint: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: 3,
  },
  changeRole: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.accent,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  segmentWrap: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
  },
  segmentText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.secondary,
    textAlign: "center",
  },
  segmentTextSelected: {
    color: "#FFFFFF",
  },
  segSelected: {
    backgroundColor: colors.accent,
    borderRadius: 10,
  },
  sectionHint: {
    marginTop: 10,
    fontSize: 13,
    color: colors.secondary,
    lineHeight: 19,
  },
  lengthMeta: {
    fontSize: 12.5,
    fontWeight: "800",
    color: colors.muted,
  },
  ctaWrap: {
    marginTop: 14,
    marginBottom: 10,
  },
  preparationError: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(9, 9, 7, 0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 10,
  },
  roleOptionWrap: {
    borderRadius: 14,
  },
  roleOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
  },
  roleOptionSelected: {
    backgroundColor: "#FBEEE9",
  },
  roleOptionText: {
    fontSize: 15.5,
    fontWeight: "700",
    color: colors.ink,
  },
  roleOptionTextSelected: {
    color: colors.accentDark,
    fontWeight: "800",
  },
  prepOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.room,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 26,
  },
  prepStage: {
    fontSize: 17,
    fontWeight: "700",
    color: "#E7E6E0",
    textAlign: "center",
    marginTop: 0,
  },
});

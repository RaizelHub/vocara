import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { colors } from "@/theme/colors";
import { radius, shadows, spacing } from "@/theme/tokens";
import { getDataErrorMessage } from "@/lib/dataErrors";
import { useAuth } from "@/providers/AuthProvider";
import { interviewSessionService } from "@/services/interviewSessionService";
import { createInterviewStarter } from "@/lib/interviewStarter";
import { useSubscription } from "@/providers/SubscriptionProvider";
import { resetInterviewSession, startInterviewSession } from "@/state/session";
import {
  LENGTH_QUESTION_COUNTS,
  type InterviewSession,
  type Difficulty,
  type InterviewLength,
  type InterviewType,
  type InterviewerStyle,
} from "@/types/interview";

const TYPE_OPTIONS: { value: InterviewType; title: string; description: string }[] = [
  {
    value: "standard",
    title: "Standard Interview",
    description: "Balanced mix of common behavioral and role-based questions.",
  },
  {
    value: "situational",
    title: "Situational",
    description: "Hypothetical workplace scenarios, dilemmas, and on-the-job problem solving.",
  },
  {
    value: "behavioral",
    title: "Behavioral",
    description: "Past experiences, teamwork, overcoming setbacks, and achievements.",
  },
  {
    value: "technical",
    title: "Technical",
    description: "Role-specific technical skills and methodology questions.",
  },
  {
    value: "mixed",
    title: "Mixed",
    description: "A realistic blend of behavioral, situational, and technical questions.",
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

const SUGGESTED_ROLES = [
  "Software Developer",
  "Product Manager",
  "Virtual Assistant",
  "Customer Support",
  "Data Analyst",
  "Project Manager",
  "IT Support Specialist",
  "Sales Representative",
  "Digital Marketer",
  "Teacher / Educator",
  "UX / UI Designer",
  "Financial Analyst",
  "Nurse / Healthcare",
  "Operations Manager",
  "Human Resources",
  "Accountant",
];

const PREP_STAGES = [
  "Preparing your interview…",
  "Analyzing your role…",
  "Selecting the right questions…",
  "Ready.",
];

export default function InterviewSetupScreen() {
  const { profile, preferences, user } = useAuth();
  const { usage, refresh } = useSubscription();
  const allowance = usage.find(item => item.feature === 'ai_feedback');
  const remaining = allowance?.limit_value == null ? null : Math.max(0, allowance.limit_value - (allowance.used ?? 0));
  const starter = useRef<{ key: string; value: ReturnType<typeof createInterviewStarter<InterviewSession>> } | null>(null);
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
  const [length, setLength] = useState<InterviewLength>("quick");
  const [style, setStyle] = useState<InterviewerStyle>(initialStyle);
  const [role, setRole] = useState(profile?.target_role?.trim() || "Software Developer");
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [customRoleInput, setCustomRoleInput] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [stage, setStage] = useState(0);
  const [preparationError, setPreparationError] = useState<string | null>(null);

  const activeDifficulty = DIFFICULTY_OPTIONS.find((o) => o.value === difficulty)!;
  const trimmedInput = customRoleInput.trim();
  const query = trimmedInput.toLowerCase();
  const filteredRoles = query
    ? SUGGESTED_ROLES.filter((r) => r.toLowerCase().includes(query))
    : SUGGESTED_ROLES;
  const isExactSuggestion = SUGGESTED_ROLES.some(
    (r) => r.toLowerCase() === query,
  );

  useEffect(() => {
    if (!preparing) return;
    let active = true;

    const interval = setInterval(() => {
      setStage((s) => Math.min(s + 1, PREP_STAGES.length - 1));
    }, 640);

    const prepare = async () => {
      if (!user) throw new Error("No authenticated user.");
      const key = JSON.stringify([user.id, role, type, difficulty, style, length]);
      if (starter.current?.key !== key) {
        starter.current = { key, value: createInterviewStarter(
          () => startInterviewSession({ role, type, difficulty, interviewerStyle: style, length }),
          session => interviewSessionService.ensureCreated(session, user.id),
        ) };
      }
      const nextSession = await starter.current.value.run();
      void refresh();
      if (active) router.replace({ pathname: '/interview/session', params: { id: nextSession.id } } as Href);
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
  }, [difficulty, length, preparing, role, style, type, user, refresh]);

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
                style={[styles.typeRowWrap, selected && styles.typeRowWrapSelected]}
              >
                <View style={styles.typeRow}>
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
          onPress={() => {
            setCustomRoleInput("");
            setRoleModalVisible(true);
          }}
          accessibilityLabel={`Interviewing for ${role}. Tap to change role.`}
          style={styles.roleCardWrap}
        >
          <View style={styles.roleCard}>
            <View style={styles.roleIconBubble}>
              <Ionicons name="briefcase-outline" size={19} color={colors.accent} />
            </View>
            <View style={styles.typeText}>
              <Text style={styles.roleTitle}>{role}</Text>
              <Text style={styles.roleHint}>Questions will be tailored to this role.</Text>
            </View>
            <View style={styles.changeRoleBadge}>
              <Text style={styles.changeRole}>Change</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accentDark} />
            </View>
          </View>
        </PressableScale>

        {/* Difficulty */}
        <Text style={styles.sectionLabel}>Difficulty</Text>
        <SegmentedControl
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
        <Text style={styles.sectionHint}>
          {remaining === null ? 'Answer allowance is checked before starting.' : `${remaining} answer allowances available. This interview needs ${LENGTH_QUESTION_COUNTS[length]}.`}
          {' '}The full interview is reserved at the start; resuming does not use more allowance.
        </Text>
        <View style={styles.typeList}>
          {LENGTH_OPTIONS.map((option) => {
            const selected = option.value === length;
            return (
              <PressableScale
                key={option.value}
                onPress={() => setLength(option.value)}
                accessibilityLabel={`${option.title}, ${option.meta}`}
                style={[styles.typeRowWrap, selected && styles.typeRowWrapSelected]}
              >
                <View style={styles.typeRow}>
                  <View style={styles.typeText}>
                    <View style={styles.lengthHeaderRow}>
                      <Text style={[styles.typeTitle, selected && styles.typeSelected]}>
                        {option.title}
                      </Text>
                      <View style={[styles.lengthBadge, selected && styles.lengthBadgeSelected]}>
                        <Text style={[styles.lengthMeta, selected && styles.lengthMetaSelected]}>
                          {option.meta}
                        </Text>
                      </View>
                    </View>
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

        {/* Interviewer style */}
        <Text style={styles.sectionLabel}>Interviewer style</Text>
        <SegmentedControl
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

      {/* Role picker modal */}
      <Modal
        visible={roleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setRoleModalVisible(false)}
            accessible={false}
          />
          <Animated.View entering={FadeInDown.duration(260)} style={styles.modalCard}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeaderRow}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>Target Role</Text>
                <Text style={styles.modalSubtitle}>
                  Choose a popular role or type any custom job title.
                </Text>
              </View>
              <Pressable
                onPress={() => setRoleModalVisible(false)}
                hitSlop={10}
                accessibilityLabel="Close role selector"
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={18} color={colors.secondary} />
              </Pressable>
            </View>

            {/* Custom Input Field */}
            <View style={styles.inputContainer}>
              <Ionicons name="search-outline" size={18} color={colors.muted} />
              <TextInput
                style={styles.roleInput}
                placeholder="Type any job (e.g. Graphic Designer, Nurse)…"
                placeholderTextColor={colors.muted}
                value={customRoleInput}
                onChangeText={setCustomRoleInput}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (trimmedInput) {
                    setRole(trimmedInput);
                    setRoleModalVisible(false);
                  }
                }}
                autoCapitalize="words"
                autoCorrect={false}
              />
              {trimmedInput.length > 0 && (
                <Pressable
                  onPress={() => {
                    setRole(trimmedInput);
                    setRoleModalVisible(false);
                  }}
                  style={styles.useRoleButton}
                  accessibilityLabel={`Use ${trimmedInput}`}
                >
                  <Text style={styles.useRoleButtonText}>Use</Text>
                </Pressable>
              )}
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* If user typed a custom role that isn't already an exact suggestion */}
              {trimmedInput.length > 0 && !isExactSuggestion && (
                <PressableScale
                  onPress={() => {
                    setRole(trimmedInput);
                    setRoleModalVisible(false);
                  }}
                  style={styles.customRolePromptCard}
                  accessibilityLabel={`Use custom role ${trimmedInput}`}
                >
                  <View style={styles.customRolePromptLeft}>
                    <View style={styles.customRolePromptIcon}>
                      <Ionicons name="add" size={20} color={colors.accent} />
                    </View>
                    <View style={styles.customRolePromptTextWrap}>
                      <Text style={styles.customRolePromptSub}>Use Custom Role</Text>
                      <Text style={styles.customRolePromptTitle} numberOfLines={1}>
                        &quot;{trimmedInput}&quot;
                      </Text>
                    </View>
                  </View>
                  <View style={styles.customRolePromptArrow}>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </View>
                </PressableScale>
              )}

              {/* Show active custom role if current role is not in suggestions and input is empty */}
              {!trimmedInput &&
                !SUGGESTED_ROLES.some((r) => r.toLowerCase() === role.toLowerCase()) && (
                  <PressableScale
                    key={role}
                    onPress={() => setRoleModalVisible(false)}
                    accessibilityLabel={`Currently selected custom role: ${role}`}
                    style={[styles.roleOption, styles.roleOptionSelected]}
                  >
                    <View style={styles.activeCustomRow}>
                      <Text style={[styles.roleOptionText, styles.roleOptionTextSelected]}>
                        {role}
                      </Text>
                      <View style={styles.customBadge}>
                        <Text style={styles.customBadgeText}>Active Custom</Text>
                      </View>
                    </View>
                    <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                  </PressableScale>
                )}

              <Text style={styles.suggestionsHeader}>
                {trimmedInput ? "Matching Suggestions" : "Popular Suggestions"}
              </Text>

              {filteredRoles.map((option) => {
                const selected = option.toLowerCase() === role.toLowerCase();
                return (
                  <PressableScale
                    key={option}
                    onPress={() => {
                      setRole(option);
                      setRoleModalVisible(false);
                    }}
                    accessibilityLabel={option}
                    style={[styles.roleOption, selected && styles.roleOptionSelected]}
                  >
                    <Text
                      style={[styles.roleOptionText, selected && styles.roleOptionTextSelected]}
                    >
                      {option}
                    </Text>
                    {selected && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                    )}
                  </PressableScale>
                );
              })}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 8,
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
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
    fontSize: 15,
    color: colors.secondary,
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 22,
  },
  sectionLabel: {
    marginTop: 28,
    marginBottom: 12,
    fontSize: 12.5,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  typeList: {
    gap: 10,
  },
  typeRowWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    ...shadows.subtle,
  },
  typeRowWrapSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  typeText: {
    flex: 1,
  },
  lengthHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  typeTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  typeSelected: {
    color: colors.accentDark,
  },
  typeDescription: {
    fontSize: 13,
    lineHeight: 18.5,
    color: colors.secondary,
    marginTop: 2,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  radioOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  roleCardWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    ...shadows.subtle,
  },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  roleIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  roleHint: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: 2,
  },
  changeRoleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.accentLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  changeRole: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.accentDark,
  },
  sectionHint: {
    marginTop: 10,
    fontSize: 13,
    color: colors.secondary,
    lineHeight: 19,
  },
  lengthBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lengthBadgeSelected: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  lengthMeta: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  lengthMetaSelected: {
    color: colors.accentDark,
    fontWeight: "800",
  },
  ctaWrap: {
    marginTop: 28,
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
    padding: 22,
    paddingBottom: Platform.OS === "ios" ? 38 : 24,
    maxHeight: "88%",
    ...shadows.elevated,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  modalTitleWrap: {
    flex: 1,
    paddingRight: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: 4,
    lineHeight: 18,
  },
  modalCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginTop: 14,
    marginBottom: 12,
  },
  roleInput: {
    flex: 1,
    fontSize: 14.5,
    color: colors.ink,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  useRoleButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 8,
  },
  useRoleButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  customRolePromptCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.accentLight,
    borderWidth: 1.5,
    borderColor: colors.accentMuted,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  customRolePromptLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  customRolePromptIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  customRolePromptTextWrap: {
    flex: 1,
  },
  customRolePromptSub: {
    fontSize: 10.5,
    fontWeight: "800",
    color: colors.accentDark,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  customRolePromptTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    marginTop: 1,
  },
  customRolePromptArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionsHeader: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 8,
  },
  modalScroll: {
    maxHeight: 320,
  },
  modalScrollContent: {
    gap: 8,
    paddingBottom: 16,
  },
  activeCustomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  customBadge: {
    backgroundColor: colors.accentMuted,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  customBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.accentDark,
  },
  roleOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  roleOptionSelected: {
    backgroundColor: colors.accentLight,
    borderColor: colors.accentSoft,
  },
  roleOptionText: {
    fontSize: 15,
    fontWeight: "600",
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

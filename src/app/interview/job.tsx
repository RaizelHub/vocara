import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, type Href } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LiveWaveform } from "@/components/interview/LiveWaveform";
import { BackButton } from "@/components/ui/BackButton";
import { PressableScale } from "@/components/ui/PressableScale";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { colors } from "@/theme/colors";
import { MAX_JOB_CHARS } from "@/types/job";
import {
  getJobErrorMessage,
  jobService,
  validateJobText,
} from "@/services/jobService";

const ANALYSIS_STAGES = [
  "Reading the job description…",
  "Breaking down skills and expectations…",
  "Finding what this interview should probe…",
];

export default function InterviewJobScreen() {
  const insets = useSafeAreaInsets();

  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [savedJobId, setSavedJobId] = useState<string | null>(null);

  const charCount = text.length;
  const validJobText = validateJobText(text).ok;

  useEffect(() => {
    if (!analyzing) return;
    const interval = setInterval(() => {
      setStage((s) => Math.min(s + 1, ANALYSIS_STAGES.length - 1));
    }, 640);
    return () => clearInterval(interval);
  }, [analyzing]);

  function handleAnalyze() {
    if (analyzing) return;
    setError(null);
    setStage(0);
    setAnalyzing(true);

    void (async () => {
      try {
        const jobDescriptionId =
          savedJobId ?? (await jobService.createJobDescription(text)).id;
        if (!savedJobId) setSavedJobId(jobDescriptionId);
        await jobService.analyzeJob(jobDescriptionId);
        await delay(1800);
        router.replace({
          pathname: "/interview/job-analysis",
          params: { jobId: jobDescriptionId },
        } as Href);
      } catch (analysisError) {
        setError(getJobErrorMessage(analysisError));
        setAnalyzing(false);
      }
    })();
  }

  async function pasteFromClipboard() {
    if (pasting) return;
    setPasting(true);
    setError(null);
    try {
      const copied = await Clipboard.getStringAsync();
      if (copied && copied.trim()) {
        if (copied.trim().length > MAX_JOB_CHARS) {
          setError("That's a very long posting. Keep it under 12,000 characters.");
          return;
        }
        setText(copied.trim());
      } else {
        setError("Your clipboard doesn't contain any text to paste.");
      }
    } catch {
      setError("We couldn't read your clipboard. Paste manually instead.");
    } finally {
      setPasting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={() => router.back()} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Job-Specific Interview</Text>
        <Text style={styles.subtitle}>
          Paste a real job description. Vocara builds a tailored interview around the role and
          seniority.
        </Text>

        <Text style={styles.sectionLabel}>Job description</Text>
        <View style={styles.inputCard}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Paste the full job posting here…"
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
            maxLength={MAX_JOB_CHARS}
            editable={!analyzing && !savedJobId}
            accessibilityLabel="Job description"
          />
          <View style={styles.inputFooter}>
            <Text style={styles.charCount}>
              {charCount} / {MAX_JOB_CHARS}
            </Text>
            <PressableScale
              onPress={pasteFromClipboard}
              disabled={pasting || analyzing || !!savedJobId}
              accessibilityLabel="Paste from clipboard"
              style={styles.pasteButton}
            >
              <Ionicons name="clipboard-outline" size={14} color={colors.accent} />
              <Text style={styles.pasteLabel}>{pasting ? "Reading…" : "Paste"}</Text>
            </PressableScale>
          </View>
        </View>

        <View style={styles.noteRow}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.muted} />
          <Text style={styles.noteText}>
            Only you can see this job description. You can delete it anytime from your list.
          </Text>
        </View>

        <View style={styles.ctaWrap}>
          <PrimaryButton
            label="Analyze job description"
            onPress={handleAnalyze}
            disabled={analyzing || !validJobText}
          />
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      </ScrollView>

      {analyzing && (
        <View style={styles.analyzeOverlay}>
          <LiveWaveform active barCount={26} height={52} intensity={0.9} />
          <Animated.Text
            key={`stage-${stage}`}
            entering={FadeInDown.duration(300)}
            style={styles.stageText}
          >
            {ANALYSIS_STAGES[stage]}
          </Animated.Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
    lineHeight: 22,
    color: colors.secondary,
    marginTop: 5,
    marginBottom: 4,
  },
  sectionLabel: {
    marginTop: 24,
    marginBottom: 12,
    fontSize: 12.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  inputCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
  },
  input: {
    minHeight: 240,
    fontSize: 15.5,
    lineHeight: 22.5,
    color: colors.ink,
    padding: 0,
  },
  inputFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  charCount: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.muted,
  },
  pasteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FBEEE9",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  pasteLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.accentDark,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 2,
  },
  noteText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
  },
  ctaWrap: {
    marginTop: 26,
    marginBottom: 10,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 12,
  },
  analyzeOverlay: {
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
  stageText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#E7E6E0",
    textAlign: "center",
  },
});

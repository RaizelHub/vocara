import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScoreWave } from "@/components/results/ScoreWave";
import { PressableScale } from "@/components/ui/PressableScale";
import type { InterviewResult } from "@/data/mockInterviewResult";
import { colors } from "@/theme/colors";

export type ShareResultModalProps = {
  visible: boolean;
  result: InterviewResult;
  onClose: () => void;
};

export function ShareResultModal({ visible, result, onClose }: ShareResultModalProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <Animated.View
          entering={FadeInDown.duration(280)}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.sheetHeader}>
              <Text style={styles.previewLabel}>Share preview</Text>
              <PressableScale onPress={onClose} accessibilityLabel="Close share preview" collapsed>
                <View style={styles.close}>
                  <Ionicons name="close" size={19} color={colors.secondary} />
                </View>
              </PressableScale>
            </View>

            <View style={styles.preview}>
              <Text style={styles.wordmark}>VOCARA</Text>
              <Text style={styles.scoreLabel}>INTERVIEW SCORE</Text>
              <Text style={styles.score}>{result.score}</Text>
              <ScoreWave score={result.score} />
              <Text style={styles.performance}>{result.performanceLabel}</Text>
              <View style={styles.skills}>
                {result.skills.slice(0, 3).map((skill) => (
                  <View key={skill.key} style={styles.skillRow}>
                    <Text style={styles.skillName}>{skill.label}</Text>
                    <Text style={styles.skillScore}>{skill.score}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.questions}>{result.answers.length} questions completed</Text>
              <Text style={styles.tagline}>Speak better. Interview smarter.</Text>
            </View>

            <PressableScale onPress={onClose} accessibilityLabel="Close share preview" style={styles.donePress}>
              <Text style={styles.done}>Close preview</Text>
            </PressableScale>
            <Text style={styles.note}>Image sharing will be enabled in a future update.</Text>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(14, 14, 12, 0.66)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "92%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  previewLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
  },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  preview: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
  },
  wordmark: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2.5,
    color: colors.ink,
  },
  scoreLabel: {
    marginTop: 24,
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: colors.muted,
  },
  score: {
    fontSize: 66,
    lineHeight: 72,
    includeFontPadding: false,
    fontWeight: "800",
    letterSpacing: -2.5,
    color: colors.ink,
  },
  performance: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
  },
  skills: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  skillRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  skillName: {
    fontSize: 13,
    color: colors.secondary,
  },
  skillScore: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink,
  },
  questions: {
    marginTop: 14,
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.secondary,
  },
  tagline: {
    marginTop: 20,
    fontSize: 12,
    fontWeight: "800",
    color: colors.accent,
  },
  donePress: {
    marginTop: 14,
  },
  done: {
    height: 52,
    lineHeight: 52,
    includeFontPadding: false,
    borderRadius: 26,
    backgroundColor: colors.accent,
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  note: {
    marginTop: 9,
    textAlign: "center",
    fontSize: 11.5,
    color: colors.muted,
  },
});

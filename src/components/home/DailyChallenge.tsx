import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { PressableScale } from "@/components/ui/PressableScale";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/theme/colors";

export type DailyChallengeProps = {
  question: string;
  support: string;
  difficulty: string;
  onStart: () => void;
};

/**
 * One focused practice prompt for the day, with a subtle mic cue.
 * Deliberately light — no panel, just a resting block on the canvas.
 */
export function DailyChallenge({
  question,
  support,
  difficulty,
  onStart,
}: DailyChallengeProps) {
  return (
    <View>
      <SectionHeader title="Today's challenge" />
      <View style={styles.row}>
        <View style={styles.micBubble}>
          <Ionicons name="mic" size={19} color={colors.accent} />
        </View>
        <View style={styles.content}>
          <View style={styles.topLine}>
            <Text style={styles.question}>{question}</Text>
            <View style={styles.difficultyChip}>
              <Text style={styles.difficultyText}>{difficulty}</Text>
            </View>
          </View>
          <Text style={styles.support}>{support}</Text>
          <PressableScale
            onPress={onStart}
            accessibilityLabel="Start challenge"
            collapsed
            style={styles.startWrap}
          >
            <View style={styles.startRow}>
              <Text style={styles.startLabel}>Start challenge</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accent} />
            </View>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 14,
  },
  micBubble: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FBEEE9",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    rowGap: 4,
  },
  question: {
    fontSize: 16.5,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  difficultyChip: {
    borderRadius: 7,
    backgroundColor: "#FBF0DC",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  difficultyText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#8A5A0E",
  },
  support: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: 4,
  },
  startWrap: {
    marginTop: 10,
    alignSelf: "flex-start",
  },
  startRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  startLabel: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.accent,
  },
});
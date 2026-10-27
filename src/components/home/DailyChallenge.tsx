import { Platform, StyleSheet, Text, View } from "react-native";
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
 * Daily challenge spotlight card: structured question prompt, difficulty tag,
 * coaching tip, and clear audio-themed call to action.
 */
export function DailyChallenge({
  question,
  support,
  difficulty,
  onStart,
}: DailyChallengeProps) {
  return (
    <View>
      <SectionHeader
        title="Today's Challenge"
        subtitle="Keep your streak active with one quick prompt"
      />

      <View style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.micBubble}>
            <Ionicons name="mic" size={20} color={colors.accent} />
          </View>
          <View style={styles.badgeRow}>
            <View style={styles.difficultyChip}>
              <Text style={styles.difficultyText}>{difficulty}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.question}>{question}</Text>

        <View style={styles.tipBox}>
          <Ionicons name="bulb-outline" size={15} color={colors.secondary} style={styles.tipIcon} />
          <Text style={styles.support}>{support}</Text>
        </View>

        <PressableScale
          onPress={onStart}
          accessibilityLabel="Start daily challenge"
          activeScale={0.97}
          style={styles.ctaWrap}
        >
          <View style={styles.cta}>
            <Text style={styles.ctaLabel}>Record your answer</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.04,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 4px 16px rgba(21, 21, 21, 0.04)",
      },
      default: {},
    }),
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  micBubble: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  difficultyChip: {
    borderRadius: 7,
    backgroundColor: colors.warningLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  difficultyText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#8A5A0E",
    letterSpacing: 0.3,
  },
  question: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.3,
    lineHeight: 23,
    marginBottom: 12,
  },
  tipBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  tipIcon: {
    marginTop: 1,
  },
  support: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.secondary,
    flex: 1,
  },
  ctaWrap: {
    width: "100%",
  },
  cta: {
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
});
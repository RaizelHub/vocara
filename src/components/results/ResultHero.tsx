import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { ScoreWave } from "@/components/results/ScoreWave";
import { colors } from "@/theme/colors";

export type ResultHeroProps = {
  score: number;
  previousScore: number;
};

export function ResultHero({ score, previousScore }: ResultHeroProps) {
  const change = score - previousScore;

  return (
    <View style={styles.hero}>
      <View style={styles.scoreRow}>
        <View>
          <AnimatedScore score={score} />
          <Text style={styles.label}>Interview score</Text>
        </View>
        <View style={styles.change}>
          <Ionicons name="arrow-up" size={13} color={colors.success} />
          <Text style={styles.changeText}>+{change} from your last interview</Text>
        </View>
      </View>
      <ScoreWave score={score} />
    </View>
  );
}

function AnimatedScore({ score }: { score: number }) {
  const animatedScore = useSharedValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    animatedScore.value = withDelay(
      100,
      withTiming(score, { duration: 950, easing: Easing.out(Easing.cubic) }),
    );
  }, [animatedScore, score]);

  useAnimatedReaction(
    () => Math.round(animatedScore.value),
    (current, previous) => {
      if (current !== previous) runOnJS(setDisplay)(current);
    },
    [score],
  );

  return (
    <Text style={styles.score} accessibilityLabel={`${score} out of 100`}>
      {display}
    </Text>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    shadowColor: "#151515",
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 16,
  },
  score: {
    fontSize: 72,
    lineHeight: 76,
    includeFontPadding: false,
    fontWeight: "800",
    letterSpacing: -3,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  label: {
    marginTop: 3,
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.secondary,
  },
  change: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingBottom: 7,
  },
  changeText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: colors.success,
  },
});

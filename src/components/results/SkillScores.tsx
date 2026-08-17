import { StyleSheet, Text, View } from "react-native";

import { SkillBar } from "@/components/ui/SkillBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { SkillScore } from "@/data/mockInterviewResult";
import { colors } from "@/theme/colors";
import { interpretScore } from "@/utils/resultScore";

export type SkillScoresProps = {
  skills: SkillScore[];
};

export function SkillScores({ skills }: SkillScoresProps) {
  return (
    <View>
      <SectionHeader title="How you scored" />
      <View style={styles.list}>
        {skills.map((skill, index) => (
          <View key={skill.key} style={styles.row}>
            <View style={styles.topLine}>
              <Text style={styles.name}>{skill.label}</Text>
              <View style={styles.scoreGroup}>
                <Text style={styles.interpretation}>{interpretScore(skill.score)}</Text>
                <Text style={styles.score}>{skill.score}</Text>
              </View>
            </View>
            <SkillBar value={skill.score} index={index} />
            <Text style={styles.insight}>{skill.insight}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 18,
  },
  row: {
    gap: 7,
  },
  topLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  },
  name: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
  },
  scoreGroup: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 9,
  },
  interpretation: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.muted,
  },
  score: {
    minWidth: 24,
    textAlign: "right",
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  insight: {
    fontSize: 12.5,
    color: colors.secondary,
  },
});

import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { SkillBar } from "@/components/ui/SkillBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/theme/colors";
import type { PracticeSkill } from "@/types/interview";

export type SkillSnapshotProps = {
  skills: PracticeSkill[];
};

/**
 * Strengths as a quiet list — one thin voice bar per skill, coral only.
 */
export function SkillSnapshot({ skills }: SkillSnapshotProps) {
  return (
    <View>
      <SectionHeader
        title="Your strengths"
        actionLabel="View progress"
        onAction={() => router.push("/progress")}
      />
      <View style={styles.list}>
        {skills.map((skill, i) => (
          <View key={skill.key} style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.name}>{skill.label}</Text>
              <Text style={styles.value} accessibilityLabel={`${skill.label} ${skill.value} percent`}>
                {skill.value}
              </Text>
            </View>
            <SkillBar value={skill.value} index={i} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 15,
  },
  row: {
    gap: 7,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  name: {
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.ink,
  },
  value: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
});
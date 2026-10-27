import { Platform, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { SkillBar } from "@/components/ui/SkillBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/theme/colors";
import type { PracticeSkill } from "@/types/interview";

export type SkillSnapshotProps = {
  skills: PracticeSkill[];
};

/**
 * Strengths card: elevated container displaying skill indicators with
 * smooth spring fill bars and tabular percentage scores.
 */
export function SkillSnapshot({ skills }: SkillSnapshotProps) {
  return (
    <View>
      <SectionHeader
        title="Your Strengths"
        subtitle="Key skill competency areas from recent answers"
        actionLabel="View all"
        onAction={() => router.push("/progress")}
      />
      <View style={styles.card}>
        <View style={styles.list}>
          {skills.map((skill, i) => (
            <View key={skill.key} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.name}>{skill.label}</Text>
                <View style={styles.percentBadge}>
                  <Text
                    style={styles.value}
                    accessibilityLabel={`${skill.label} ${skill.value} percent`}
                  >
                    {skill.value}%
                  </Text>
                </View>
              </View>
              <SkillBar value={skill.value} index={i} height={8} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.04,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 4px 14px rgba(21, 21, 21, 0.04)",
      },
      default: {},
    }),
  },
  list: {
    gap: 16,
  },
  row: {
    gap: 8,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.ink,
  },
  percentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    backgroundColor: colors.surfaceSubtle,
  },
  value: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
});
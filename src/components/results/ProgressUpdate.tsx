import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { SectionHeader } from "@/components/ui/SectionHeader";
import type { InterviewResult } from "@/data/mockInterviewResult";
import { colors } from "@/theme/colors";

export type ProgressUpdateProps = {
  progress: InterviewResult["progress"];
};

export function ProgressUpdate({ progress }: ProgressUpdateProps) {
  const change = progress.readinessAfter - progress.readinessBefore;

  return (
    <View>
      <SectionHeader title="Progress update" />
      <View style={styles.panel}>
        <View style={styles.readiness}>
          <View>
            <Text style={styles.smallLabel}>Before</Text>
            <Text style={styles.bigScore}>{progress.readinessBefore}</Text>
          </View>
          <View style={styles.arrowArea}>
            <View style={styles.deltaPill}>
              <Ionicons name="arrow-up" size={12} color={colors.success} />
              <Text style={styles.delta}>+{change}</Text>
            </View>
            <Ionicons name="arrow-forward" size={21} color={colors.muted} />
          </View>
          <View style={styles.after}>
            <Text style={styles.smallLabel}>After</Text>
            <Text style={styles.bigScore}>{progress.readinessAfter}</Text>
          </View>
        </View>
        <Text style={styles.readinessLabel}>Interview readiness</Text>
        <View style={styles.divider} />
        <ProgressRow
          label="Confidence"
          before={progress.confidenceBefore}
          after={progress.confidenceAfter}
        />
        <ProgressRow
          label="Structure"
          before={progress.structureBefore}
          after={progress.structureAfter}
        />
      </View>
    </View>
  );
}

function ProgressRow({ label, before, after }: { label: string; before: number; after: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowScore}>
        {before}  →  {after}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  readiness: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  smallLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.muted,
  },
  bigScore: {
    marginTop: 2,
    fontSize: 35,
    lineHeight: 40,
    includeFontPadding: false,
    fontWeight: "800",
    letterSpacing: -1,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  after: {
    alignItems: "flex-end",
  },
  arrowArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deltaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: 9,
    backgroundColor: "rgba(32, 164, 100, 0.10)",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  delta: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.success,
  },
  readinessLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    color: colors.secondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  row: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  rowScore: {
    fontSize: 13.5,
    fontWeight: "800",
    color: colors.secondary,
    fontVariant: ["tabular-nums"],
  },
});

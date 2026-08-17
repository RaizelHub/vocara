import { StyleSheet, Text, View } from "react-native";

import { FEATURE_LABELS } from "@/config/features";
import { colors } from "@/theme/colors";

export type UsageMeterProps = {
  feature: string;
  used: number | null;
  limit: number | null;
  period: "day" | "month" | null;
  pro?: boolean;
};

function periodSuffix(period: "day" | "month" | null): string {
  if (period === "day") return "today";
  if (period === "month") return "this month";
  return "";
}

export function UsageMeter({ feature, used, limit, period, pro = false }: UsageMeterProps) {
  const label = FEATURE_LABELS[feature as keyof typeof FEATURE_LABELS] ?? feature;
  const unlimited = pro || limit === null;
  const fraction = !unlimited && limit > 0 ? Math.min(1, (used ?? 0) / limit) : 0;
  const exhausted = !unlimited && (used ?? 0) >= limit;
  const suffix = periodSuffix(period);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.count, exhausted && styles.countExhausted]}>
          {unlimited
            ? "Unlimited"
            : `${Math.max(0, limit - (used ?? 0))} left${suffix ? ` ${suffix}` : ""}`}
        </Text>
      </View>
      {!unlimited && (
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${Math.round(fraction * 100)}%` },
              exhausted && styles.fillExhausted,
            ]}
          />
        </View>
      )}
      <Text style={styles.caption}>
        {unlimited
          ? "Included with Vocara Pro"
          : `${used ?? 0} of ${limit} used${suffix ? ` ${suffix}` : ""}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 17,
    paddingVertical: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  label: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.ink,
  },
  count: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.accent,
  },
  countExhausted: {
    color: colors.error,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginTop: 10,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  fillExhausted: {
    backgroundColor: colors.error,
  },
  caption: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 7,
  },
});

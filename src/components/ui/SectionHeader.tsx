import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";

export type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  badge?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({
  title,
  subtitle,
  badge,
  actionLabel,
  onAction,
}: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>{title}</Text>
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>

        {actionLabel && onAction ? (
          <PressableScale
            onPress={onAction}
            accessibilityLabel={actionLabel}
            collapsed
            activeScale={0.94}
          >
            <View style={styles.action}>
              <Text style={styles.actionLabel}>{actionLabel}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accent} />
            </View>
          </PressableScale>
        ) : null}
      </View>

      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.accentLight,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.accentDark,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 13.5,
    color: colors.secondary,
    marginTop: 3,
    lineHeight: 18,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 2,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.accent,
  },
});
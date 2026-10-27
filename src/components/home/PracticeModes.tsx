import { Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";

import { PressableScale } from "@/components/ui/PressableScale";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/theme/colors";

type IconName = keyof typeof Ionicons.glyphMap;

const PRIMARY_MODE = {
  icon: "mic" as IconName,
  title: "Full Mock Interview",
  description: "Realistic multi-question session with comprehensive evaluation & scoring.",
  time: "10–15 min",
  badge: "RECOMMENDED",
  href: "/interview/setup" as Href,
};

const SECONDARY_MODES = [
  {
    icon: "flash" as IconName,
    title: "Quick Practice",
    description: "One targeted question with instant AI feedback.",
    time: "2 min",
    href: "/interview/quick" as Href,
  },
  {
    icon: "briefcase" as IconName,
    title: "Job-Specific",
    description: "Practice tailored to a real job posting.",
    time: "Custom",
    href: "/interview/job" as Href,
  },
];

/**
 * Practice modes presentation: flagship Mock Interview card plus
 * two balanced secondary tiles with clean icon bubbles and time pills.
 */
export function PracticeModes() {
  return (
    <View>
      <SectionHeader
        title="Practice Modes"
        subtitle="Select how you want to train today"
      />

      <PressableScale
        onPress={() => router.push(PRIMARY_MODE.href)}
        accessibilityLabel={`${PRIMARY_MODE.title}, ${PRIMARY_MODE.time}`}
        activeScale={0.98}
        style={[styles.tile, styles.primaryTile]}
      >
        <View style={styles.primaryTopRow}>
          <View style={styles.iconBubble}>
            <Ionicons name={PRIMARY_MODE.icon} size={22} color={colors.accent} />
          </View>
          <View style={styles.badgeWrap}>
            <Text style={styles.badgeText}>{PRIMARY_MODE.badge}</Text>
          </View>
        </View>

        <View style={styles.primaryContent}>
          <Text style={styles.primaryTitle}>{PRIMARY_MODE.title}</Text>
          <Text style={styles.primaryDesc}>{PRIMARY_MODE.description}</Text>
        </View>

        <View style={styles.primaryFooter}>
          <View style={styles.timePill}>
            <Ionicons name="time-outline" size={13} color={colors.accentDark} />
            <Text style={styles.timeText}>{PRIMARY_MODE.time}</Text>
          </View>
          <View style={styles.startRow}>
            <Text style={styles.startText}>Start</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.accent} />
          </View>
        </View>
      </PressableScale>

      <View style={styles.secondaryRow}>
        {SECONDARY_MODES.map((mode) => (
          <PressableScale
            key={mode.title}
            onPress={() => router.push(mode.href)}
            accessibilityLabel={`${mode.title}, ${mode.time}`}
            activeScale={0.97}
            style={[styles.tile, styles.secondaryTile]}
          >
            <View style={styles.secondary}>
              <View style={styles.secondaryIconBubble}>
                <Ionicons name={mode.icon} size={18} color={colors.accent} />
              </View>
              <Text style={styles.secondaryTitle}>{mode.title}</Text>
              <Text style={styles.secondaryDesc}>{mode.description}</Text>
              <View style={styles.secondaryTimePill}>
                <Text style={styles.secondaryTime}>{mode.time}</Text>
              </View>
            </View>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 22,
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
  primaryTile: {
    padding: 20,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  primaryTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeWrap: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 6,
    backgroundColor: colors.accentLight,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.accentDark,
  },
  primaryContent: {
    marginBottom: 14,
  },
  primaryTitle: {
    fontSize: 17.5,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  primaryDesc: {
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.secondary,
    marginTop: 4,
  },
  primaryFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  timePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.accentDark,
  },
  startRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  startText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: colors.accent,
  },
  secondaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  secondaryTile: {
    flex: 1,
    padding: 16,
  },
  secondary: {
    gap: 8,
    minHeight: 120,
    justifyContent: "space-between",
  },
  secondaryIconBubble: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  secondaryDesc: {
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.secondary,
    flex: 1,
  },
  secondaryTimePill: {
    alignSelf: "flex-start",
    borderRadius: 6,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  secondaryTime: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
  },
});
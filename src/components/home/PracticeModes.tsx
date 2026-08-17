import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";

import { PressableScale } from "@/components/ui/PressableScale";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/theme/colors";

type IconName = keyof typeof Ionicons.glyphMap;

const PRIMARY_MODE = {
  icon: "mic" as IconName,
  title: "Mock Interview",
  description: "A realistic multi-question interview.",
  time: "10–15 min",
  href: "/interview/setup" as Href,
};

const SECONDARY_MODES = [
  {
    icon: "flash" as IconName,
    title: "Quick Practice",
    description: "One question. Instant feedback.",
    time: "2 min",
    href: "/interview/quick" as Href,
  },
  {
    icon: "briefcase" as IconName,
    title: "Job-Specific",
    description: "Practice from a real job description.",
    time: "Custom",
    href: "/interview/job" as Href,
  },
];

/**
 * Practice your way: one primary tile plus two compact secondary modes.
 * Asymmetric on purpose — the mock interview is the flagship interaction.
 */
export function PracticeModes() {
  return (
    <View>
      <SectionHeader title="Practice your way" />

      <PressableScale
        onPress={() => router.push(PRIMARY_MODE.href)}
        accessibilityLabel={`${PRIMARY_MODE.title}, ${PRIMARY_MODE.time}`}
        style={[styles.tile, styles.primaryTile]}
      >
        <View style={styles.primary}>
          <View style={styles.iconBubble}>
            <Ionicons name={PRIMARY_MODE.icon} size={24} color={colors.accent} />
          </View>
          <View style={styles.primaryText}>
            <Text style={styles.primaryTitle}>{PRIMARY_MODE.title}</Text>
            <Text style={styles.primaryDesc}>{PRIMARY_MODE.description}</Text>
            <View style={styles.timePill}>
              <Text style={styles.timeText}>{PRIMARY_MODE.time}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </View>
      </PressableScale>

      <View style={styles.secondaryRow}>
        {SECONDARY_MODES.map((mode) => (
          <PressableScale
            key={mode.title}
            onPress={() => router.push(mode.href)}
            accessibilityLabel={`${mode.title}, ${mode.time}`}
            style={styles.secondaryTile}
          >
            <View style={styles.secondary}>
              <Ionicons name={mode.icon} size={20} color={colors.accent} />
              <Text style={styles.secondaryTitle}>{mode.title}</Text>
              <Text style={styles.secondaryDesc}>{mode.description}</Text>
              <Text style={styles.secondaryTime}>{mode.time}</Text>
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
    borderColor: colors.border,
    borderRadius: 20,
  },
  primaryTile: {
    padding: 18,
    marginBottom: 12,
  },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: "#FBEEE9",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    flex: 1,
  },
  primaryTitle: {
    fontSize: 16.5,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  primaryDesc: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: 2,
  },
  timePill: {
    alignSelf: "flex-start",
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: "#F7F1EC",
    paddingHorizontal: 9,
    paddingVertical: 3.5,
  },
  timeText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: colors.accentDark,
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
    gap: 7,
    minHeight: 92,
  },
  secondaryTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  secondaryDesc: {
    fontSize: 12.5,
    lineHeight: 17.5,
    color: colors.secondary,
    flex: 1,
  },
  secondaryTime: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted,
  },
});
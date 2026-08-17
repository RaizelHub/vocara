import { Pressable, StyleSheet, Text } from "react-native";

import { colors } from "@/theme/colors";

export type GoalPillProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

/**
 * A multi-select pill for the focus areas. Selected pills show a warm tint,
 * a coral ring, and a small check so the state never rides on color alone.
 */
export function GoalPill({ label, selected, onPress }: GoalPillProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        selected && styles.pillSelected,
        pressed && styles.pillPressed,
      ]}
    >
      {selected && (
        <Text style={styles.checkGlyph}>✓</Text>
      )}
      <Text style={[styles.label, selected && styles.labelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 46,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pillSelected: {
    borderColor: colors.accent,
    backgroundColor: "#FFF3EE",
  },
  pillPressed: {
    opacity: 0.85,
  },
  checkGlyph: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.accent,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  labelSelected: {
    fontWeight: "700",
  },
});
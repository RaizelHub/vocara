import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/colors";

export type OptionRowProps = {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
};

/**
 * A large tappable row for single-choice questions. The selection state is
 * carried by both the border/bg warmth and a filled indicator, so it never
 * relies on color alone.
 */
export function OptionRow({
  title,
  description,
  selected,
  onPress,
}: OptionRowProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={description ? `${title}. ${description}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.textBlock}>
        <Text style={[styles.title, selected && styles.titleSelected]}>
          {title}
        </Text>
        {description != null && (
          <Text style={styles.description}>{description}</Text>
        )}
      </View>
      <View style={[styles.indicator, selected && styles.indicatorSelected]}>
        {selected && <Text style={styles.indicatorGlyph}>✓</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  rowSelected: {
    borderColor: colors.accent,
    backgroundColor: "#FFF3EE",
  },
  rowPressed: {
    opacity: 0.85,
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  titleSelected: {
    fontWeight: "700",
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.secondary,
  },
  indicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  indicatorSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  indicatorGlyph: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
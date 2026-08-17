import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

/* eslint-disable react-hooks/immutability -- Reanimated shared-value writes in press handlers */

import { colors } from "@/theme/colors";

export type ChoiceChipProps = {
  label: string;
  mark: string;
  tint: string;
  selected: boolean;
  onPress: () => void;
};

/**
 * A single-select choice for the role question. Scannable grid tile with a
 * soft tinted mark, a clear selected state, and a quiet press scale.
 */
export function ChoiceChip({
  label,
  mark,
  tint,
  selected,
  onPress,
}: ChoiceChipProps) {
  const scale = useSharedValue(1);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={pressStyle}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        onPressIn={() => {
          scale.value = withSpring(0.96, { damping: 24, stiffness: 320 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 16, stiffness: 260 });
        }}
        onPress={onPress}
        style={[styles.chip, selected && styles.chipSelected]}
      >
        <View style={[styles.mark, { backgroundColor: tint }, selected && styles.markSelected]}>
          <Text style={[styles.markText, selected && styles.markTextSelected]}>
            {mark}
          </Text>
        </View>
        <Text
          style={[styles.label, selected && styles.labelSelected]}
          numberOfLines={2}
        >
          {label}
        </Text>
        {selected && (
          <View style={styles.check}>
            <Text style={styles.checkGlyph}>✓</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 72,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: "#FFF3EE",
  },
  mark: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  markSelected: {
    backgroundColor: colors.accent,
  },
  markText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: colors.ink,
  },
  markTextSelected: {
    color: "#FFFFFF",
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  labelSelected: {
    fontWeight: "700",
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  checkGlyph: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
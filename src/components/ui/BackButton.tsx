import { Pressable, StyleSheet, Text } from "react-native";

import { colors } from "@/theme/colors";

export type BackButtonProps = {
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * The shared circular back control: a quiet white pill with a hairline
 * border and a soft press state.
 */
export function BackButton({
  onPress,
  accessibilityLabel = "Go back",
}: BackButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.glyph}>‹</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    backgroundColor: colors.background,
  },
  glyph: {
    fontSize: 30,
    lineHeight: 32,
    fontWeight: "400",
    color: colors.ink,
    marginTop: -3,
    marginRight: 2,
  },
});
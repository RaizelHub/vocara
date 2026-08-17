import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { authStyles } from "@/components/auth/authStyles";
import { colors } from "@/theme/colors";

type AuthButtonProps = {
  label: string;
  loadingLabel?: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function AuthButton({
  label,
  loadingLabel,
  onPress,
  loading = false,
  disabled = false,
}: AuthButtonProps) {
  const inactive = loading || disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading ? loadingLabel ?? label : label}
      accessibilityState={{ busy: loading, disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
      ]}
    >
      {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
      <Text style={styles.label}>{loading ? loadingLabel ?? label : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: authStyles.fieldHeight,
    borderRadius: authStyles.radius,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 24,
  },
  pressed: {
    backgroundColor: colors.accentDark,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    backgroundColor: "#D8A89D",
  },
  label: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
});

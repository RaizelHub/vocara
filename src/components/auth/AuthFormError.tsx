import { StyleSheet, Text } from "react-native";

import { colors } from "@/theme/colors";

export function AuthFormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  error: {
    marginTop: 14,
    borderRadius: 13,
    backgroundColor: "#FCEDEB",
    borderWidth: 1,
    borderColor: "#F3CFCA",
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
    lineHeight: 18,
    color: colors.error,
  },
});

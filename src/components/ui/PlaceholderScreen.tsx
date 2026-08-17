import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/theme/colors";

export type PlaceholderScreenProps = {
  title: string;
  message: string;
  hint?: string;
};

/**
 * Minimal stand-in for screens that arrive in a later phase. Matches the
 * warm brand voice without any fake UI to maintain later.
 */
export function PlaceholderScreen({
  title,
  message,
  hint,
}: PlaceholderScreenProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.brand}>VOCARA</Text>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
      {hint != null && <Text style={styles.hint}>{hint}</Text>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  brand: {
    position: "absolute",
    top: 58,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 3,
    color: colors.ink,
  },
  content: {
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: colors.ink,
    textAlign: "center",
  },
  message: {
    fontSize: 15.5,
    lineHeight: 23,
    color: colors.secondary,
    textAlign: "center",
    maxWidth: 300,
  },
  hint: {
    position: "absolute",
    bottom: 32,
    fontSize: 12.5,
    letterSpacing: 0.2,
    color: colors.muted,
  },
});
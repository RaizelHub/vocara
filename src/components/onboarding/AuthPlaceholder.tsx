import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/theme/colors";

export type AuthPlaceholderProps = {
  title: string;
  message: string;
};

/**
 * Quiet stand-in for the auth flows while account work is still a later
 * phase. Matches the brand's editorial voice without any fake UI.
 */
export function AuthPlaceholder({ title, message }: AuthPlaceholderProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.brand}>VOCARA</Text>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
      <Text style={styles.hint}>Account flows arrive in the next build.</Text>
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
    top: 64,
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
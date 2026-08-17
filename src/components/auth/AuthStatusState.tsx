import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/colors";

type AuthStatusStateProps = {
  tone: "mail" | "success" | "error";
  title: string;
  body: string;
  emphasizedText?: string;
};

const status = {
  mail: { icon: "mail-outline", color: colors.accent, background: "#FFF0EB" },
  success: { icon: "checkmark", color: colors.success, background: "#EAF6EF" },
  error: { icon: "alert-circle-outline", color: colors.error, background: "#FCEDEB" },
} as const;

export function AuthStatusState({
  tone,
  title,
  body,
  emphasizedText,
}: AuthStatusStateProps) {
  const appearance = status[tone];
  return (
    <View style={styles.wrap} accessibilityRole={tone === "error" ? "alert" : "summary"}>
      <View style={[styles.icon, { backgroundColor: appearance.background }]}>
        <Ionicons name={appearance.icon} size={30} color={appearance.color} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {emphasizedText ? <Text style={styles.emphasis}>{emphasizedText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  icon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  title: {
    color: colors.ink,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.45,
    textAlign: "center",
  },
  body: {
    color: colors.secondary,
    fontSize: 15.5,
    lineHeight: 23,
    textAlign: "center",
    marginTop: 9,
    maxWidth: 360,
  },
  emphasis: {
    color: colors.ink,
    fontSize: 15.5,
    lineHeight: 22,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 6,
  },
});

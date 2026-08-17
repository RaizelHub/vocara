import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";

type MicrophonePermissionStateProps = {
  canAskAgain: boolean;
  busy?: boolean;
  onAllow: () => void;
  onNotNow: () => void;
  onOpenSettings: () => void;
};

export function MicrophonePermissionState({
  canAskAgain,
  busy,
  onAllow,
  onNotNow,
  onOpenSettings,
}: MicrophonePermissionStateProps) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="mic-outline" size={24} color={colors.accent} />
      </View>
      <Text style={styles.title}>Microphone access needed</Text>
      <Text style={styles.body}>
        Vocara needs microphone access so you can practice spoken interview answers.
      </Text>
      <PressableScale
        onPress={canAskAgain ? onAllow : onOpenSettings}
        disabled={busy}
        accessibilityLabel={canAskAgain ? "Allow microphone" : "Open settings"}
        style={styles.primaryWrap}
      >
        <Text style={[styles.primary, busy && styles.disabled]}>
          {busy ? "Checking…" : canAskAgain ? "Allow microphone" : "Open settings"}
        </Text>
      </PressableScale>
      <PressableScale
        onPress={onNotNow}
        disabled={busy}
        accessibilityLabel="Not now"
        collapsed
      >
        <Text style={styles.secondary}>Not now</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: colors.roomCard,
    borderWidth: 1,
    borderColor: colors.roomLine,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(216, 84, 54, 0.13)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  title: {
    color: "#F6F5F0",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    color: "#B9B8B0",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },
  primaryWrap: {
    alignSelf: "stretch",
    marginTop: 20,
  },
  primary: {
    height: 52,
    lineHeight: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    color: "#FFFFFF",
    fontSize: 15.5,
    fontWeight: "800",
    textAlign: "center",
    includeFontPadding: false,
  },
  disabled: {
    opacity: 0.6,
  },
  secondary: {
    color: "#B9B8B0",
    fontSize: 14.5,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 16,
  },
});

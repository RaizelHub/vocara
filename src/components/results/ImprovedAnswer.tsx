import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";

export type ImprovedAnswerProps = {
  answer: string;
};

export function ImprovedAnswer({ answer }: ImprovedAnswerProps) {
  const [copied, setCopied] = useState(false);

  const copyAnswer = async () => {
    await Clipboard.setStringAsync(answer);
    setCopied(true);
  };

  return (
    <View style={styles.block}>
      <Text style={styles.quoteMark}>“</Text>
      <Text style={styles.heading}>Improved answer</Text>
      <Text style={styles.answer}>{answer}</Text>
      <View style={styles.actions}>
        <PressableScale
          onPress={copyAnswer}
          accessibilityLabel={copied ? "Improved answer copied" : "Copy improved answer"}
          collapsed
        >
          <View style={styles.action}>
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={15}
              color={copied ? colors.success : colors.accent}
            />
            <Text style={[styles.actionText, copied && styles.copied]}>
              {copied ? "Copied" : "Copy"}
            </Text>
          </View>
        </PressableScale>
        <PressableScale
          disabled
          accessibilityLabel="Listen to improved answer, coming soon"
          style={styles.listenDisabled}
        >
          <View style={styles.action}>
            <Ionicons name="volume-medium-outline" size={16} color={colors.muted} />
            <Text style={styles.listenText}>Listen</Text>
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    position: "relative",
    borderRadius: 18,
    backgroundColor: "#FBF1EC",
    borderWidth: 1,
    borderColor: "#F4D9D0",
    padding: 18,
    overflow: "hidden",
  },
  quoteMark: {
    position: "absolute",
    right: 13,
    top: -10,
    fontSize: 70,
    lineHeight: 88,
    fontWeight: "800",
    color: "rgba(255, 90, 54, 0.13)",
  },
  heading: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.accentDark,
  },
  answer: {
    marginTop: 9,
    fontSize: 14,
    lineHeight: 21.5,
    color: colors.ink,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginTop: 16,
  },
  action: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.accent,
  },
  copied: {
    color: colors.success,
  },
  listenDisabled: {
    opacity: 0.72,
  },
  listenText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.muted,
  },
});

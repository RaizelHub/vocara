import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/colors";

export type ResultSummaryProps = {
  label: string;
  summary: string;
};

export function ResultSummary({ label, summary }: ResultSummaryProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.marker} />
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.summary}>{summary}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    gap: 14,
  },
  marker: {
    width: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  copy: {
    flex: 1,
  },
  label: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  summary: {
    marginTop: 7,
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.secondary,
  },
});

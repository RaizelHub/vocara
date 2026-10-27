import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/colors";

export type AppHeaderProps = {
  subtitle?: string;
  rightAction?: ReactNode;
};

export function AppHeader({ subtitle, rightAction }: AppHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <View style={styles.logoMark}>
          <View style={[styles.waveBar, styles.waveBarShort]} />
          <View style={[styles.waveBar, styles.waveBarTall]} />
          <View style={[styles.waveBar, styles.waveBarMedium]} />
        </View>
        <View>
          <Text style={styles.wordmark}>VOCARA</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      {rightAction ? <View style={styles.rightAction}>{rightAction}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  logoMark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2.5,
    height: 18,
  },
  waveBar: {
    width: 3.2,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  waveBarShort: {
    height: 9,
  },
  waveBarTall: {
    height: 18,
  },
  waveBarMedium: {
    height: 13,
  },
  wordmark: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2.6,
    color: colors.ink,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.muted,
    marginTop: -1,
  },
  rightAction: {
    flexDirection: "row",
    alignItems: "center",
  },
});

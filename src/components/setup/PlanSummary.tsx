import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { getDataErrorMessage } from "@/lib/dataErrors";
import { colors } from "@/theme/colors";

export type PlanSummaryProps = {
  targetRole: string;
  goals: string[];
  onComplete: () => Promise<void>;
};

const SUMMARY_HOLD_MS = 1700;

/**
 * The brief personalized moment before /home: a wordmark, a check, the
 * role, and the chosen focus areas. Auto-advances after a short beat.
 */
export function PlanSummary({ targetRole, goals, onComplete }: PlanSummaryProps) {
  const insets = useSafeAreaInsets();
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = useCallback(async () => {
    setCompleting(true);
    setError(null);
    try {
      await onComplete();
    } catch (cause) {
      setError(
        getDataErrorMessage(cause, "Your setup is saved, but we couldn't open Home. Try again."),
      );
      setCompleting(false);
    }
  }, [onComplete]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void finish();
    }, SUMMARY_HOLD_MS);
    return () => clearTimeout(timer);
  }, [finish]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Animated.View entering={FadeIn.duration(420)} style={styles.inner}>
        <Text style={styles.brand}>VOCARA</Text>

        <Animated.View entering={FadeInDown.duration(480).delay(120)} style={styles.checkWrap}>
          <View style={styles.checkMark}>
            <Text style={styles.checkGlyph}>✓</Text>
          </View>
          <Text style={styles.title}>Your practice plan is ready.</Text>
        </Animated.View>

        {targetRole !== "" && (
          <Animated.View entering={FadeInDown.duration(420).delay(360)} style={styles.detail}>
            <Text style={styles.detailLabel}>Target role</Text>
            <Text style={styles.detailValue}>{targetRole}</Text>
          </Animated.View>
        )}

        {goals.length > 0 && (
          <Animated.View entering={FadeInDown.duration(420).delay(520)} style={styles.detail}>
            <Text style={styles.detailLabel}>Focus</Text>
            <Text style={styles.detailValue}>{goals.join(" · ")}</Text>
          </Animated.View>
        )}

        {completing && !error ? (
          <Text style={styles.opening}>Opening your dashboard…</Text>
        ) : null}

        {error ? (
          <View style={styles.retry}>
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
            <PrimaryButton label="Try again" onPress={finish} />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  inner: {
    alignItems: "center",
    paddingHorizontal: 36,
  },
  brand: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 4,
    color: colors.ink,
    marginBottom: 44,
  },
  checkWrap: {
    alignItems: "center",
    gap: 26,
  },
  checkMark: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#E3F3EA",
    alignItems: "center",
    justifyContent: "center",
  },
  checkGlyph: {
    fontSize: 38,
    fontWeight: "700",
    color: colors.success,
  },
  title: {
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
    textAlign: "center",
  },
  detail: {
    marginTop: 34,
    alignItems: "center",
    gap: 5,
  },
  detailLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.muted,
  },
  detailValue: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
    maxWidth: 300,
  },
  opening: {
    marginTop: 28,
    fontSize: 13,
    color: colors.muted,
  },
  retry: {
    alignSelf: "stretch",
    marginTop: 24,
  },
  error: {
    marginBottom: 12,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.error,
    textAlign: "center",
  },
});

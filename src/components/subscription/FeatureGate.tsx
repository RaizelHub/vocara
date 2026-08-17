import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useSubscription } from "@/providers/SubscriptionProvider";
import { colors } from "@/theme/colors";
import { PressableScale } from "@/components/ui/PressableScale";

export type FeatureGateProps = {
  feature: string;
  children: ReactNode;
  ctaLabel?: string;
};

/**
 * Renders its children when the user has access to `feature`; otherwise a
 * quiet locked card with an upgrade CTA that opens the RevenueCat paywall.
 */
export function FeatureGate({ feature, children, ctaLabel = "Unlock with Pro" }: FeatureGateProps) {
  const access = useFeatureAccess(feature);
  const { showPaywall } = useSubscription();

  if (access.allowed && access.status !== "limited") {
    return <>{children}</>;
  }

  const exhausted = access.status === "limited";
  return (
    <View style={styles.card}>
      <View style={styles.lockWrap}>
        <Ionicons name="lock-closed" size={17} color={colors.accent} />
      </View>
      <Text style={styles.title}>
        {exhausted ? "Free limit reached" : "Vocara Pro feature"}
      </Text>
      <Text style={styles.description}>
        {exhausted
          ? `You've used all of your ${access.limit ?? 0} this period. Upgrade for unlimited access.`
          : "Upgrade to Vocara Pro to unlock this experience."}
      </Text>
      <PressableScale
        onPress={() => void showPaywall()}
        accessibilityLabel="Upgrade to Vocara Pro"
        style={styles.ctaWrap}
      >
        <Text style={styles.cta}>{ctaLabel}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: "center",
  },
  lockWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#FDEAE3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.secondary,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 14,
  },
  ctaWrap: {
    alignSelf: "stretch",
  },
  cta: {
    textAlign: "center",
    height: 48,
    lineHeight: 48,
    includeFontPadding: false,
    borderRadius: 24,
    backgroundColor: colors.accent,
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});

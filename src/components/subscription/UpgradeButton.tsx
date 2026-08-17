import { useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

import { useSubscription } from "@/providers/SubscriptionProvider";
import { colors } from "@/theme/colors";
import { PressableScale } from "@/components/ui/PressableScale";

type UpgradeButtonProps = {
  label?: string;
  children?: ReactNode;
  style?: "accent" | "surface";
};

/**
 * Reusable upgrade action. Every "Upgrade to Pro" entry point in the app calls
 * the same centralized `showPaywall()` so the RevenueCat dashboard paywall is
 * the single source of truth for the purchase experience.
 */
export function UpgradeButton({
  label = "Upgrade to Pro",
  children,
  style = "accent",
}: UpgradeButtonProps) {
  const { showPaywall } = useSubscription();
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await showPaywall();
    } finally {
      setLoading(false);
    }
  };

  return (
    <PressableScale
      onPress={handlePress}
      disabled={loading}
      accessibilityLabel={label}
      style={style === "accent" ? styles.accent : styles.surface}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Text
          style={style === "accent" ? styles.accentText : styles.surfaceText}
        >
          {children ?? label}
        </Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  accent: {
    alignSelf: "stretch",
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  accentText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  surface: {
    alignSelf: "stretch",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  surfaceText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
});

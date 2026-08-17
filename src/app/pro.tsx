import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSubscription } from "@/providers/SubscriptionProvider";
import { SubscriptionStatus } from "@/components/subscription/SubscriptionStatus";
import { ProPaywall } from "@/components/subscription/ProPaywall";
import { BackButton } from "@/components/ui/BackButton";
import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";

export default function ProScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isPro, isLoading, showPaywall, restorePurchases } = useSubscription();
  const [fallback, setFallback] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (isPro || isLoading || fallback) return;
    let active = true;
    void showPaywall().then((result) => {
      if (!active) return;
      // When the dashboard paywall can't be presented at all (missing native
      // module / SDK key, e.g. Expo Go), fall back to the custom paywall. For
      // every other outcome (cancel, error, purchased, restored) return to the
      // previous screen — cancellation is not an error.
      if (result.status === "unavailable") {
        setFallback(true);
      } else {
        router.back();
      }
    });
    return () => {
      active = false;
    };
  }, [isPro, isLoading, fallback, showPaywall, router]);

  const handleRestore = async () => {
    setRestoreMessage(null);
    setIsRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.status === "restored") {
        setRestoreMessage("Vocara Pro restored.");
      } else if (result.status === "cancelled") {
        setRestoreMessage(
          "We couldn't find an active Vocara Pro purchase for this account.",
        );
      } else if (result.status === "error") {
        setRestoreMessage(result.message);
      }
    } finally {
      setIsRestoring(false);
    }
  };

  if (isPro) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
        <View style={styles.nav}>
          <BackButton onPress={() => router.back()} />
        </View>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>VOCARA PRO</Text>
          <Text style={styles.title}>You&apos;re all set.</Text>
          <Text style={styles.subtitle}>
            Every feature is unlocked. Practice without limits and review your
            full progress history.
          </Text>
          <View style={styles.statusCard}>
            <SubscriptionStatus />
          </View>
          <PressableScale
            onPress={handleRestore}
            disabled={isRestoring}
            accessibilityLabel="Restore purchases"
            style={styles.restoreWrap}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.restore}>Restore purchases</Text>
            )}
          </PressableScale>
          {restoreMessage ? (
            <Text accessibilityRole="alert" style={styles.feedback}>
              {restoreMessage}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (fallback) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
        <View style={styles.nav}>
          <BackButton onPress={() => router.back()} />
        </View>
        <ProPaywall />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.nav}>
        <BackButton onPress={() => router.back()} />
      </View>
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Opening Vocara Pro…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  nav: {
    paddingHorizontal: 12,
    paddingBottom: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    color: colors.accent,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: colors.ink,
    marginTop: 6,
  },
  subtitle: {
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.secondary,
    marginTop: 8,
    marginBottom: 22,
  },
  statusCard: {
    borderRadius: 16,
    overflow: "hidden",
  },
  restoreWrap: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  restore: {
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.secondary,
  },
  feedback: {
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.ink,
    textAlign: "center",
    fontWeight: "600",
    marginTop: 14,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  loadingText: {
    fontSize: 14,
    color: colors.secondary,
    fontWeight: "600",
  },
});

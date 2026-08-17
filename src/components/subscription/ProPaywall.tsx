import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useSubscription } from "@/providers/SubscriptionProvider";
import { revenueCatEnvironment } from "@/services/revenueCatService";
import { colors } from "@/theme/colors";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { PressableScale } from "@/components/ui/PressableScale";
import { ProBenefit } from "@/components/subscription/ProBenefit";
import { PlanOption, priceLabel, savingsLabel } from "@/components/subscription/PlanOption";

const PRO_BENEFITS = [
  {
    icon: "sparkles" as const,
    title: "More AI coaching",
    description: "Daily and monthly feedback limits disappear — practice as much as you need.",
  },
  {
    icon: "briefcase" as const,
    title: "Job-specific interviews",
    description: "Tailored interview scenarios matching your exact target role and job descriptions.",
  },
  {
    icon: "document-text" as const,
    title: "Resume-powered preparation",
    description: "Personalized questions built directly from your uploaded resume experience.",
  },
  {
    icon: "hardware-chip" as const,
    title: "Deep Practice",
    description: "Access advanced practice modes with comprehensive multi-layer feedback.",
  },
  {
    icon: "analytics" as const,
    title: "Full progress history",
    description: "Retain complete session performance, score trends, and audio feedback.",
  },
];

export function ProPaywall({ onPurchased }: { onPurchased?: () => void }) {
  const router = useRouter();
  const {
    isPro,
    isLoading,
    isPurchasing,
    isRestoring,
    monthlyPackage,
    annualPackage,
    purchaseMonthly,
    purchaseAnnual,
    restorePurchases,
    manage,
    refresh,
    error,
  } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("annual");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const selectedPackage = selectedPlan === "annual" ? (annualPackage ?? monthlyPackage) : (monthlyPackage ?? annualPackage);
  const selectedPriceLabel = priceLabel(selectedPackage);
  const savings = savingsLabel(monthlyPackage, annualPackage);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading Vocara Pro information…</Text>
      </View>
    );
  }

  if (isSuccess || isPro) {
    return (
      <View style={styles.proActive}>
        <View style={styles.successBadgeIcon}>
          <Ionicons name="sparkles" size={32} color={colors.accent} />
        </View>
        <Text style={styles.proActiveTitle}>Welcome to Vocara Pro</Text>
        <Text style={styles.proActiveBody}>
          Your full practice toolkit is unlocked. Practice deeper interviews, personalized sessions, and unlimited AI coaching.
        </Text>
        <View style={styles.successActions}>
          <PrimaryButton
            label="Start practicing"
            onPress={() => {
              if (onPurchased) {
                onPurchased();
              } else if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(tabs)/practice");
              }
            }}
          />
          <PressableScale
            onPress={() => manage()}
            accessibilityLabel="Manage subscription"
            style={styles.secondaryWrap}
          >
            <Text style={styles.secondary}>Manage subscription</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  const handlePurchase = async () => {
    setFeedbackMessage(null);
    const result = selectedPlan === "annual" ? await purchaseAnnual() : await purchaseMonthly();

    if (result.status === "purchased" || result.status === "restored") {
      setIsSuccess(true);
      onPurchased?.();
    } else if (result.status === "error") {
      setFeedbackMessage(result.message);
    }
  };

  const handleRestore = async () => {
    setFeedbackMessage(null);
    const result = await restorePurchases();

    if (result.status === "restored") {
      setIsSuccess(true);
      setFeedbackMessage("Vocara Pro restored.");
      onPurchased?.();
    } else if (result.status === "cancelled") {
      setFeedbackMessage("We couldn't find an active Vocara Pro purchase for this account.");
    } else if (result.status === "error") {
      setFeedbackMessage(result.message);
    }
  };

  const hasNoPackages = !monthlyPackage && !annualPackage;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>VOCARA PRO</Text>
        <Text style={styles.title}>Practice without holding back.</Text>
        <Text style={styles.subtitle}>
          Unlock deeper interviews, personalized preparation, and more AI coaching.
        </Text>
      </View>

      <View style={styles.benefits}>
        {PRO_BENEFITS.map((benefit) => (
          <ProBenefit
            key={benefit.title}
            icon={benefit.icon}
            title={benefit.title}
            description={benefit.description}
          />
        ))}
      </View>

      {!hasNoPackages ? (
        <View accessibilityRole="radiogroup" style={styles.options}>
          <PlanOption
            id="annual"
            title="Annual"
            subtitle={savings ? `Billed yearly · ${savings}` : "Billed yearly"}
            price={priceLabel(annualPackage)}
            badge={savings ?? null}
            selected={selectedPlan === "annual"}
            onSelect={() => setSelectedPlan("annual")}
          />
          <PlanOption
            id="monthly"
            title="Monthly"
            subtitle="Billed monthly · cancel anytime"
            price={priceLabel(monthlyPackage)}
            badge={null}
            selected={selectedPlan === "monthly"}
            onSelect={() => setSelectedPlan("monthly")}
          />
        </View>
      ) : (
        <View style={styles.missingOfferingBox}>
          <Text style={styles.missingOfferingText}>
            {"We couldn't load store offerings right now."}
          </Text>
          <PressableScale onPress={() => refresh()} style={styles.retryWrap}>
            <Text style={styles.retryText}>Tap to retry</Text>
          </PressableScale>
        </View>
      )}

      {error ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {error}
        </Text>
      ) : null}

      {feedbackMessage ? (
        <Text accessibilityRole="alert" style={styles.feedbackText}>
          {feedbackMessage}
        </Text>
      ) : null}

      {!revenueCatEnvironment.configured ? (
        <Text style={styles.previewNotice}>
          Store billing key is missing. Set EXPO_PUBLIC_REVENUECAT_TEST_API_KEY in .env to enable purchases.
        </Text>
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton
          label={
            selectedPackage
              ? `Unlock Vocara Pro · ${selectedPriceLabel ?? ""}`.trim()
              : "Unlock Vocara Pro"
          }
          onPress={handlePurchase}
          loading={isPurchasing}
          disabled={hasNoPackages || isPurchasing || isRestoring}
        />
        <PressableScale
          onPress={handleRestore}
          disabled={isPurchasing || isRestoring}
          accessibilityLabel="Restore purchases"
          style={styles.restoreWrap}
        >
          {isRestoring ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={styles.restore}>Restore purchases</Text>
          )}
        </PressableScale>
      </View>

      <Text style={styles.terms}>
        Payment is charged to your account upon confirmation. Subscriptions automatically renew unless cancelled at least 24 hours before the current period ends.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 48,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 14,
  },
  loadingText: {
    fontSize: 14,
    color: colors.secondary,
    fontWeight: "600",
  },
  header: {
    marginBottom: 24,
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
  },
  benefits: {
    gap: 16,
    marginBottom: 26,
  },
  options: {
    gap: 12,
    marginBottom: 20,
  },
  missingOfferingBox: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  missingOfferingText: {
    fontSize: 13.5,
    color: colors.secondary,
    textAlign: "center",
  },
  retryWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.accent,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.error,
    marginBottom: 14,
    textAlign: "center",
  },
  feedbackText: {
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.ink,
    marginBottom: 14,
    textAlign: "center",
    fontWeight: "600",
  },
  previewNotice: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.warning,
    marginBottom: 14,
    textAlign: "center",
  },
  actions: {
    gap: 6,
    marginTop: 2,
  },
  restoreWrap: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  restore: {
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.secondary,
  },
  terms: {
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.muted,
    textAlign: "center",
    marginTop: 18,
  },
  proActive: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  successBadgeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFF2EE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  proActiveTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.5,
  },
  proActiveBody: {
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.secondary,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 28,
  },
  successActions: {
    alignSelf: "stretch",
    gap: 12,
  },
  secondaryWrap: {
    alignSelf: "stretch",
  },
  secondary: {
    textAlign: "center",
    height: 52,
    lineHeight: 52,
    includeFontPadding: false,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
});


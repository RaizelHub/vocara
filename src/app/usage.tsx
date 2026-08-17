import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FEATURE_KEYS, PLAN_LABELS } from "@/config/features";
import { UsageMeter } from "@/components/subscription/UsageMeter";
import { ProBenefit } from "@/components/subscription/ProBenefit";
import { BackButton } from "@/components/ui/BackButton";
import { useSubscription } from "@/providers/SubscriptionProvider";
import { useRouter } from "expo-router";
import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";

export default function UsageScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { plan, subscription, status, usage, error, manage, showPaywall } =
    useSubscription();

  const free = plan === "free";

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.nav}>
        <BackButton onPress={() => router.back()} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.planCard}>
          <Text style={styles.eyebrow}>YOUR PLAN</Text>
          <Text style={styles.planTitle}>{PLAN_LABELS[plan]}</Text>
          {free && subscription && subscription.rc_entitlement_expires_at ? (
            <Text style={styles.planMeta}>
              Pro until {new Date(subscription.rc_entitlement_expires_at).toLocaleDateString()}
            </Text>
          ) : null}
          {!free ? (
            <Text style={styles.planMeta}>All limits lifted</Text>
          ) : (
            <Text style={styles.planMeta}>
              Free practice includes daily and monthly limits
            </Text>
          )}
          {free ? (
            <PressableScale
              onPress={() => void showPaywall()}
              accessibilityLabel="Upgrade to Vocara Pro"
              style={styles.upgradeWrap}
            >
              <Text style={styles.upgrade}>Upgrade to Pro</Text>
            </PressableScale>
          ) : (
            <PressableScale
              onPress={() => manage()}
              accessibilityLabel="Manage subscription"
              style={styles.upgradeWrap}
            >
              <Text style={styles.upgrade}>Manage subscription</Text>
            </PressableScale>
          )}
        </View>

        {status === "error" ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error ?? "We couldn't load your usage right now."}
          </Text>
        ) : null}

        {usage.length > 0 ? (
          <View style={styles.meters}>
            <UsageMeter
              feature={FEATURE_KEYS.aiFeedback}
              used={usage.find((u) => u.feature === FEATURE_KEYS.aiFeedback)?.used ?? null}
              limit={usage.find((u) => u.feature === FEATURE_KEYS.aiFeedback)?.limit_value ?? null}
              period={usage.find((u) => u.feature === FEATURE_KEYS.aiFeedback)?.period ?? null}
              pro={!free}
            />
            <UsageMeter
              feature={FEATURE_KEYS.jobAnalysis}
              used={usage.find((u) => u.feature === FEATURE_KEYS.jobAnalysis)?.used ?? null}
              limit={usage.find((u) => u.feature === FEATURE_KEYS.jobAnalysis)?.limit_value ?? null}
              period={usage.find((u) => u.feature === FEATURE_KEYS.jobAnalysis)?.period ?? null}
              pro={!free}
            />
            <UsageMeter
              feature={FEATURE_KEYS.resumeAnalysis}
              used={usage.find((u) => u.feature === FEATURE_KEYS.resumeAnalysis)?.used ?? null}
              limit={usage.find((u) => u.feature === FEATURE_KEYS.resumeAnalysis)?.limit_value ?? null}
              period={usage.find((u) => u.feature === FEATURE_KEYS.resumeAnalysis)?.period ?? null}
              pro={!free}
            />
            <UsageMeter
              feature={FEATURE_KEYS.personalizedInterview}
              used={usage.find((u) => u.feature === FEATURE_KEYS.personalizedInterview)?.used ?? null}
              limit={usage.find((u) => u.feature === FEATURE_KEYS.personalizedInterview)?.limit_value ?? null}
              period={usage.find((u) => u.feature === FEATURE_KEYS.personalizedInterview)?.period ?? null}
              pro={!free}
            />
          </View>
        ) : (
          <Text style={styles.empty}>No usage data yet.</Text>
        )}

        {free ? (
          <View style={styles.benefits}>
            <Text style={styles.benefitsTitle}>What Pro unlocks</Text>
            <ProBenefit
              icon="infinite"
              title="Unlimited AI feedback"
              description="No daily or monthly caps on evaluations and transcriptions."
            />
            <ProBenefit
              icon="time"
              title="Full practice history"
              description="Keep every result without a 30-day history window."
            />
            <ProBenefit
              icon="sparkles"
              title="Deep-dive interviews"
              description="Pro-only interview modes and personalized sessions."
            />
          </View>
        ) : null}
      </ScrollView>
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
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 48,
  },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 22,
  },
  eyebrow: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1.8,
    color: colors.muted,
  },
  planTitle: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: colors.ink,
    marginTop: 6,
  },
  planMeta: {
    fontSize: 13.5,
    color: colors.secondary,
    marginTop: 4,
  },
  upgradeWrap: {
    marginTop: 16,
  },
  upgrade: {
    textAlign: "center",
    height: 52,
    lineHeight: 52,
    includeFontPadding: false,
    borderRadius: 26,
    backgroundColor: colors.accent,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginBottom: 14,
  },
  meters: {
    gap: 12,
    marginBottom: 24,
  },
  empty: {
    fontSize: 14,
    color: colors.secondary,
    marginBottom: 24,
  },
  benefits: {
    gap: 16,
  },
  benefitsTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 2,
  },
});

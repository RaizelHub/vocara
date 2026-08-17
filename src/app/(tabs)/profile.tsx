import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "@/components/ui/PressableScale";
import { mockProgress } from "@/data/mock";
import { getAuthErrorMessage } from "@/lib/authErrors";
import { useAuth } from "@/providers/AuthProvider";
import { useSubscription } from "@/providers/SubscriptionProvider";
import { revenueCatEnvironment } from "@/services/revenueCatService";
import { FOCUS_AREA_LABELS } from "@/services/careerSetupService";
import { colors } from "@/theme/colors";

type IconName = keyof typeof Ionicons.glyphMap;

const MENU: { icon: IconName; label: string; destructive?: boolean }[] = [
  { icon: "log-out-outline", label: "Log out", destructive: true },
];

export default function ProfileScreen() {
  const { profile, user, focusAreas, signOut } = useAuth();
  const { isPro, subscription, usage, showPaywall, restorePurchases, offerings, customerInfo } =
    useSubscription();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const fullName =
    profile?.full_name.trim() ||
    (typeof user?.user_metadata.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "") ||
    user?.email?.split("@")[0] ||
    "VOCARA member";
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  const targetRole = profile?.target_role?.trim() || "Not set";
  const experience = profile?.experience_level?.trim() || "Not set";
  const focusLabels = focusAreas.map((area) => FOCUS_AREA_LABELS[area]);

  const aiUsage = usage.find((entry) => entry.feature === "ai_feedback");
  const usageSummary = isPro
    ? "Unlimited"
    : aiUsage && aiUsage.limit_value !== null
      ? `${Math.max(0, (aiUsage.limit_value ?? 0) - (aiUsage.used ?? 0))} of ${aiUsage.limit_value} AI feedback left today`
      : null;
  const proExpiry = subscription?.rc_entitlement_expires_at;

  const handleLogout = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError(null);
    try {
      await signOut();
    } catch (error) {
      setLogoutError(getAuthErrorMessage(error, "signOut"));
      setSigningOut(false);
    }
  }, [signOut, signingOut]);

  const handleUpgrade = useCallback(() => {
    void showPaywall();
  }, [showPaywall]);

  const handleRestore = useCallback(async () => {
    setRestoreError(null);
    try {
      const result = await restorePurchases();
      if (result.status === "error") setRestoreError(result.message);
    } catch {
      setRestoreError("We couldn't restore purchases right now.");
    }
  }, [restorePurchases]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <Text style={styles.wordmark}>VOCARA</Text>
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        entering={FadeInDown.delay(0).duration(300)}
      >
        <Animated.View entering={FadeInDown.delay(80).duration(420)} style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {initials}
            </Text>
          </View>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.subline}>
            Preparing for {targetRole}
          </Text>

          <View style={styles.chips}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{experience} experience</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{mockProgress.streak} day streak</Text>
            </View>
          </View>

          <View style={styles.focusBlock}>
            <Text style={styles.focusLabel}>Focus areas</Text>
            <Text style={styles.focusText}>
              {focusLabels.length > 0 ? focusLabels.join(" · ") : "No focus areas yet"}
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(140).duration(420)} style={styles.subscriptionWrap}>
          <Text style={styles.subscriptionSectionHeader}>Subscription</Text>
          <View style={styles.subscriptionCard}>
            <View style={styles.subscriptionIcon}>
              <Ionicons
                name={isPro ? "sparkles" : "card-outline"}
                size={19}
                color={isPro ? colors.accent : colors.secondary}
              />
            </View>
            <View style={styles.subscriptionText}>
              <View style={styles.subscriptionTitleRow}>
                <Text style={styles.subscriptionTitle}>
                  {isPro ? "Vocara Pro" : "Vocara Free"}
                </Text>
                {isPro ? (
                  <View style={styles.proBadge}>
                    <Text style={styles.proBadgeText}>PRO</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.subscriptionMeta}>
                {isPro
                  ? proExpiry
                    ? `Active · Renews ${new Date(proExpiry).toLocaleDateString()}`
                    : "Active"
                  : usageSummary ?? "Free plan limits apply"}
              </Text>
            </View>

            {isPro ? (
              <PressableScale
                onPress={() => router.push("/pro")}
                accessibilityLabel="Manage subscription"
                style={styles.actionBtn}
              >
                <Text style={styles.actionBtnText}>Manage →</Text>
              </PressableScale>
            ) : (
              <View style={styles.freeActions}>
                <PressableScale
                  onPress={handleUpgrade}
                  accessibilityLabel="Upgrade to Pro"
                  style={styles.actionBtnAccent}
                >
                  <Text style={styles.actionBtnAccentText}>Upgrade to Pro →</Text>
                </PressableScale>
                <PressableScale
                  onPress={handleRestore}
                  accessibilityLabel="Restore purchases"
                  style={styles.actionBtnGhost}
                >
                  <Text style={styles.actionBtnGhostText}>Restore purchases</Text>
                </PressableScale>
              </View>
            )}
          </View>
        </Animated.View>

        {restoreError ? (
          <Text accessibilityRole="alert" style={styles.restoreError}>
            {restoreError}
          </Text>
        ) : null}

        {__DEV__ ? (
          <View style={styles.debugCard}>
            <Text style={styles.debugTitle}>RevenueCat (dev)</Text>
            <Text style={styles.debugRow}>
              Configured: {revenueCatEnvironment.configured ? "Yes" : "No"}
            </Text>
            <Text style={styles.debugRow}>App User ID: {user?.id ?? "none"}</Text>
            <Text style={styles.debugRow}>
              Entitlement pro: {isPro ? "Active" : "Inactive"}
            </Text>
            <Text style={styles.debugRow}>
              Offering loaded: {offerings?.current || offerings?.all?.["default"] ? "Yes" : "No"}
            </Text>
            <Text style={styles.debugRow}>
              Environment: {revenueCatEnvironment.key.startsWith("test_") ? "Test Store" : "Store"}
            </Text>
            {customerInfo?.originalAppUserId ? (
              <Text style={styles.debugRow}>
                RC ID: {customerInfo.originalAppUserId}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(180).duration(420)} style={styles.menu}>
          {MENU.map((item, i) => {
            const logout = item.destructive === true;
            return (
              <PressableScale
                key={item.label}
                accessibilityLabel={item.label}
                onPress={logout ? handleLogout : undefined}
                disabled={logout && signingOut}
                style={styles.menuRowWrap}
              >
              <View style={[styles.menuRow, i > 0 && styles.menuRowBorder]}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.destructive ? colors.error : colors.secondary}
                />
                <Text style={[styles.menuLabel, item.destructive && styles.menuLabelDestructive]}>
                  {logout && signingOut ? "Logging out…" : item.label}
                </Text>
                {!item.destructive && <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
              </View>
              </PressableScale>
            );
          })}
        </Animated.View>

        {logoutError ? (
          <Text accessibilityRole="alert" style={styles.logoutError}>
            {logoutError}
          </Text>
        ) : null}

        <Text style={styles.version}>Vocara 1.0.0</Text>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  wordmark: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 2.4,
    color: colors.ink,
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 44,
  },
  identity: {
    alignItems: "center",
    marginTop: 26,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: colors.ink,
  },
  subline: {
    fontSize: 14.5,
    color: colors.secondary,
    marginTop: 4,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.secondary,
  },
  focusBlock: {
    marginTop: 18,
    alignItems: "center",
    gap: 5,
  },
  focusLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  focusText: {
    fontSize: 13.5,
    color: colors.secondary,
    textAlign: "center",
    lineHeight: 19,
  },
  menu: {
    marginTop: 32,
  },
  subscriptionWrap: {
    marginTop: 28,
  },
  subscriptionSectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.secondary,
  },
  actionBtnAccent: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#FFF2EE",
    borderRadius: 14,
  },
  actionBtnAccentText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.accent,
  },
  freeActions: {
    gap: 8,
    alignItems: "flex-end",
  },
  actionBtnGhost: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionBtnGhostText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.secondary,
  },
  restoreError: {
    marginTop: 10,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.error,
    textAlign: "center",
  },
  debugCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  debugTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 4,
  },
  debugRow: {
    fontSize: 12,
    color: colors.secondary,
  },
  subscriptionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  subscriptionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FDEAE3",
    alignItems: "center",
    justifyContent: "center",
  },
  subscriptionText: {
    flex: 1,
  },
  subscriptionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  subscriptionTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: colors.ink,
  },
  proBadge: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  proBadgeText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  subscriptionMeta: {
    fontSize: 12.5,
    color: colors.secondary,
    marginTop: 3,
  },
  menuRowWrap: {
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    height: 56,
  },
  menuRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  menuLabelDestructive: {
    color: colors.error,
    fontWeight: "700",
  },
  version: {
    textAlign: "center",
    fontSize: 12,
    color: colors.muted,
    marginTop: 34,
  },
  logoutError: {
    marginTop: 16,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.error,
    textAlign: "center",
  },
});

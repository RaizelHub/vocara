import { useCallback, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/components/ui/AppHeader";
import { PressableScale } from "@/components/ui/PressableScale";
import { mockProgress } from "@/data/mock";
import { getAuthErrorMessage } from "@/lib/authErrors";
import { useAuth } from "@/providers/AuthProvider";
import { useSubscription } from "@/providers/SubscriptionProvider";
import { revenueCatEnvironment } from "@/services/revenueCatService";
import { FOCUS_AREA_LABELS } from "@/services/careerSetupService";
import { colors } from "@/theme/colors";

type IconName = keyof typeof Ionicons.glyphMap;

type MenuItem = {
  icon: IconName;
  label: string;
  href?: Href;
  destructive?: boolean;
};

const MENU: MenuItem[] = [
  { icon: "briefcase-outline", label: "Career & Target Role", href: "/career-setup" },
  { icon: "pie-chart-outline", label: "Usage & Daily Limits", href: "/usage" },
  { icon: "shield-checkmark-outline", label: "Privacy Policy", href: "/privacy" },
  { icon: "document-text-outline", label: "Terms", href: "/terms" },
  { icon: "trash-outline", label: "Delete Account", href: "/account/delete" },
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
    "VOCARA Member";
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  const targetRole = profile?.target_role?.trim() || "Target role not set";
  const experience = profile?.experience_level?.trim() || "Mid-level";
  const focusLabels = focusAreas.map((area) => FOCUS_AREA_LABELS[area]);

  const aiUsage = usage.find((entry) => entry.feature === "ai_feedback");
  const usageSummary = isPro
    ? "Unlimited feedback"
    : aiUsage && aiUsage.limit_value !== null
      ? `${Math.max(0, (aiUsage.limit_value ?? 0) - (aiUsage.used ?? 0))} of ${aiUsage.limit_value} daily feedbacks left`
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
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <AppHeader subtitle="Profile & Settings" />
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        entering={FadeInDown.delay(0).duration(300)}
      >
        <Animated.View entering={FadeInDown.delay(60).duration(420)} style={styles.identityCard}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>

          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.subline}>Preparing for {targetRole}</Text>

          <View style={styles.chips}>
            <View style={styles.chip}>
              <Ionicons name="briefcase-outline" size={13} color={colors.accentDark} />
              <Text style={styles.chipText}>{experience} experience</Text>
            </View>
            <View style={styles.chip}>
              <Ionicons name="flame" size={13} color={colors.accent} />
              <Text style={styles.chipText}>{mockProgress.streak} day streak</Text>
            </View>
          </View>

          <View style={styles.focusBlock}>
            <Text style={styles.focusLabel}>Focus Areas</Text>
            <Text style={styles.focusText}>
              {focusLabels.length > 0 ? focusLabels.join(" · ") : "No focus areas selected yet"}
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(420)} style={styles.sectionWrap}>
          <Text style={styles.sectionHeader}>Subscription Plan</Text>
          <View style={[styles.subscriptionCard, isPro && styles.subscriptionCardPro]}>
            <View style={styles.subscriptionIconWrap}>
              <Ionicons
                name={isPro ? "sparkles" : "card-outline"}
                size={20}
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
                    <Text style={styles.proBadgeText}>PRO ACTIVE</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.subscriptionMeta}>
                {isPro
                  ? proExpiry
                    ? `Renews ${new Date(proExpiry).toLocaleDateString()}`
                    : "Unlimited practice & evaluation"
                  : usageSummary ?? "Daily limits apply"}
              </Text>
            </View>

            {isPro ? (
              <PressableScale
                onPress={() => router.push("/pro")}
                accessibilityLabel="Manage subscription"
                activeScale={0.96}
                style={styles.actionBtn}
              >
                <Text style={styles.actionBtnText}>Manage →</Text>
              </PressableScale>
            ) : (
              <View style={styles.freeActions}>
                <PressableScale
                  onPress={handleUpgrade}
                  accessibilityLabel="Upgrade to Pro"
                  activeScale={0.96}
                  style={styles.actionBtnAccent}
                >
                  <Text style={styles.actionBtnAccentText}>Upgrade →</Text>
                </PressableScale>
                <PressableScale
                  onPress={handleRestore}
                  accessibilityLabel="Restore purchases"
                  activeScale={0.96}
                  style={styles.actionBtnGhost}
                >
                  <Text style={styles.actionBtnGhostText}>Restore</Text>
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

        <Animated.View entering={FadeInDown.delay(180).duration(420)} style={styles.sectionWrap}>
          <Text style={styles.sectionHeader}>Preferences & Account</Text>
          <View style={styles.menuCard}>
            {MENU.map((item, i) => {
              const isLogout = item.destructive === true;
              return (
                <PressableScale
                  key={item.label}
                  accessibilityLabel={item.label}
                  onPress={
                    isLogout
                      ? handleLogout
                      : item.href
                        ? () => router.push(item.href!)
                        : undefined
                  }
                  disabled={isLogout && signingOut}
                  activeScale={0.98}
                >
                  <View style={[styles.menuRow, i > 0 && styles.menuRowBorder]}>
                    <View
                      style={[
                        styles.menuIconCircle,
                        isLogout && styles.menuIconCircleDestructive,
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={18}
                        color={isLogout ? colors.error : colors.secondary}
                      />
                    </View>
                    <Text
                      style={[
                        styles.menuLabel,
                        isLogout && styles.menuLabelDestructive,
                      ]}
                    >
                      {isLogout && signingOut ? "Signing out…" : item.label}
                    </Text>
                    {!isLogout && (
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    )}
                  </View>
                </PressableScale>
              );
            })}
          </View>
        </Animated.View>

        {logoutError ? (
          <Text accessibilityRole="alert" style={styles.logoutError}>
            {logoutError}
          </Text>
        ) : null}

        {__DEV__ ? (
          <View style={styles.debugCard}>
            <Text style={styles.debugTitle}>RevenueCat Diagnostics</Text>
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

        <Text style={styles.version}>Vocara 1.0.0 · Voice-First Interview Coaching</Text>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  identityCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 24,
    marginTop: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.04,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 4px 16px rgba(21, 21, 21, 0.04)",
      },
      default: {},
    }),
  },
  avatarRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 26,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
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
    marginTop: 14,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.ink,
  },
  focusBlock: {
    alignItems: "center",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    width: "100%",
  },
  focusLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  focusText: {
    fontSize: 13,
    color: colors.secondary,
    textAlign: "center",
    lineHeight: 18,
  },
  sectionWrap: {
    marginTop: 26,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  subscriptionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 18,
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.04,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 3px 12px rgba(21, 21, 21, 0.04)",
      },
      default: {},
    }),
  },
  subscriptionCardPro: {
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  subscriptionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  subscriptionText: {
    flex: 1,
  },
  subscriptionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  subscriptionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
  },
  proBadge: {
    backgroundColor: colors.accent,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  proBadgeText: {
    fontSize: 9.5,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  subscriptionMeta: {
    fontSize: 12.5,
    color: colors.secondary,
    marginTop: 3,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.accentDark,
  },
  freeActions: {
    gap: 4,
    alignItems: "flex-end",
  },
  actionBtnAccent: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnAccentText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  actionBtnGhost: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  actionBtnGhostText: {
    fontSize: 11.5,
    color: colors.secondary,
    fontWeight: "700",
  },
  restoreError: {
    fontSize: 12,
    color: colors.error,
    marginTop: 8,
    textAlign: "center",
  },
  menuCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.04,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 3px 12px rgba(21, 21, 21, 0.04)",
      },
      default: {},
    }),
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 15,
    gap: 12,
  },
  menuRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  menuIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconCircleDestructive: {
    backgroundColor: colors.errorLight,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  menuLabelDestructive: {
    color: colors.error,
    fontWeight: "800",
  },
  logoutError: {
    fontSize: 12,
    color: colors.error,
    marginTop: 8,
    textAlign: "center",
  },
  debugCard: {
    marginTop: 24,
    padding: 16,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 4,
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  debugRow: {
    fontSize: 11.5,
    color: colors.secondary,
  },
  version: {
    marginTop: 28,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
});

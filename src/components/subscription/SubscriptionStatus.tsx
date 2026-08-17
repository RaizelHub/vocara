import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useSubscription } from "@/providers/SubscriptionProvider";
import { REVENUECAT_ENTITLEMENTS } from "@/services/revenueCatService";
import { colors } from "@/theme/colors";

export function SubscriptionStatus() {
  const { isPro, customerInfo, subscription } = useSubscription();

  const entitlement = customerInfo?.entitlements.active[REVENUECAT_ENTITLEMENTS.PRO];
  const expiresDate = entitlement?.expirationDate
    ? new Date(entitlement.expirationDate).toLocaleDateString()
    : subscription?.rc_entitlement_expires_at
      ? new Date(subscription.rc_entitlement_expires_at).toLocaleDateString()
      : null;

  return (
    <View style={[styles.container, isPro ? styles.proContainer : styles.freeContainer]}>
      <View style={styles.iconWrap}>
        <Ionicons
          name={isPro ? "sparkles" : "radio-button-off-outline"}
          size={18}
          color={isPro ? colors.accent : colors.secondary}
        />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{isPro ? "Vocara Pro" : "Vocara Free"}</Text>
        <Text style={styles.subtitle}>
          {isPro
            ? expiresDate
              ? `Active · Renews ${expiresDate}`
              : "Active · Unlimited access"
            : "Daily & monthly practice limits apply"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  proContainer: {
    backgroundColor: "#FFF5F2",
    borderColor: "#FCD8CD",
  },
  freeContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.ink,
  },
  subtitle: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
  },
});

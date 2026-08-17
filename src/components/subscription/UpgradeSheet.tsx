import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { colors } from "@/theme/colors";
import { PressableScale } from "@/components/ui/PressableScale";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useSubscription } from "@/providers/SubscriptionProvider";

export type UpgradeSheetProps = {
  visible: boolean;
  feature: string;
  onClose: () => void;
};

/**
 * Lightweight in-context upgrade prompt for a blocked/limited feature.
 * Opens the RevenueCat dashboard paywall when the user accepts.
 */
export function UpgradeSheet({ visible, feature, onClose }: UpgradeSheetProps) {
  const access = useFeatureAccess(feature);
  const { showPaywall } = useSubscription();

  if (!visible) return null;

  const exhausted = access.status === "limited";
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessible={false}
          onPress={onClose}
        />
        <Animated.View entering={FadeInDown.duration(260)} style={styles.card}>
          <Text style={styles.title}>
            {exhausted ? "Free limit reached" : "Unlock with Vocara Pro"}
          </Text>
          <Text style={styles.description}>
            {exhausted
              ? `You've used all of your free allowance for this feature. Go Pro for unlimited access.`
              : "This feature is part of Vocara Pro. Upgrade to keep practicing without limits."}
          </Text>
          <PressableScale
            onPress={() => {
              onClose();
              void showPaywall();
            }}
            accessibilityLabel="Go to Vocara Pro"
            style={styles.upgradeWrap}
          >
            <Text style={styles.upgrade}>Go Pro</Text>
          </PressableScale>
          <PressableScale onPress={onClose} accessibilityLabel="Not now" style={styles.laterWrap}>
            <Text style={styles.later}>Not now</Text>
          </PressableScale>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(9, 9, 7, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 26,
    backgroundColor: colors.surface,
    padding: 26,
    alignItems: "center",
  },
  title: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
    textAlign: "center",
  },
  description: {
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.secondary,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  upgradeWrap: {
    alignSelf: "stretch",
    marginBottom: 10,
  },
  upgrade: {
    textAlign: "center",
    height: 54,
    lineHeight: 54,
    includeFontPadding: false,
    borderRadius: 27,
    backgroundColor: colors.accent,
    color: "#FFFFFF",
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  laterWrap: {
    alignSelf: "stretch",
  },
  later: {
    textAlign: "center",
    height: 54,
    lineHeight: 54,
    includeFontPadding: false,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.secondary,
    fontSize: 15.5,
    fontWeight: "800",
  },
});

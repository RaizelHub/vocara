import { Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton } from "@/components/ui/BackButton";
import { colors } from "@/theme/colors";

export type AuthHeaderProps = {
  /** Renders a back arrow at the left edge when provided. */
  onBack?: () => void;
  title: string;
  subtitle: string;
};

/**
 * The warm entry to every auth screen: brand wordmark with an optional
 * back control, then a single editorial headline block.
 */
export function AuthHeader({ onBack, title, subtitle }: AuthHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.topRow}>
        {onBack ? (
          <BackButton onPress={onBack} />
        ) : (
          <View style={styles.backPlaceholder} />
        )}
        <View style={styles.brandLockup} accessibilityLabel="VOCARA">
          <Image
            source={require("../../iconlogo/vocara_primary_symbol.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.brand}>VOCARA</Text>
        </View>
        <View style={styles.backPlaceholder} />
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  backPlaceholder: {
    width: 44,
    height: 44,
  },
  brand: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 4,
    color: colors.ink,
  },
  brandLockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  logo: {
    width: 38,
    height: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: colors.ink,
    lineHeight: 36,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15.5,
    lineHeight: 22,
    color: colors.secondary,
  },
});

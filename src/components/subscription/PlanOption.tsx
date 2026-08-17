import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/colors";

export { priceLabel, savingsLabel } from "@/lib/planPricing";

export type PlanOptionProps = {
  id: string;
  title: string;
  subtitle: string;
  price: string | null;
  badge: string | null;
  selected: boolean;
  onSelect: () => void;
};

export function PlanOption({
  id,
  title,
  subtitle,
  price,
  badge,
  selected,
  onSelect,
}: PlanOptionProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title} plan, ${price ?? "price unavailable"}`}
      onPress={onSelect}
      style={[
        styles.option,
        selected && styles.optionSelected,
      ]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.textWrap}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={[styles.price, !price && styles.priceMissing]}>
        {price ?? "Unavailable"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 17,
    paddingVertical: 15,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: "#FFF7F3",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: colors.accent,
  },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: colors.accent,
  },
  textWrap: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 15.5,
    fontWeight: "800",
    color: colors.ink,
  },
  subtitle: {
    fontSize: 12.5,
    color: colors.secondary,
    marginTop: 2,
  },
  badge: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  price: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
  },
  priceMissing: {
    color: colors.muted,
    fontWeight: "600",
  },
});

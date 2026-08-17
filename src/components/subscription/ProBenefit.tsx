import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "@/theme/colors";

type IconName = keyof typeof Ionicons.glyphMap;

export type ProBenefitProps = {
  icon: IconName;
  title: string;
  description: string;
};

export function ProBenefit({ icon, title, description }: ProBenefitProps) {
  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={19} color={colors.accent} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 13,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FDEAE3",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 15.5,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.secondary,
    marginTop: 2,
  },
});

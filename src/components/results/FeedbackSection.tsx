import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { SectionHeader } from "@/components/ui/SectionHeader";
import type { FeedbackPoint } from "@/data/mockInterviewResult";
import { colors } from "@/theme/colors";

export type FeedbackSectionProps = {
  title: string;
  items: FeedbackPoint[];
  variant: "strength" | "focus";
};

export function FeedbackSection({ title, items, variant }: FeedbackSectionProps) {
  const strength = variant === "strength";

  return (
    <View>
      <SectionHeader title={title} />
      <View>
        {items.map((item, index) => (
          <View key={item.title} style={[styles.row, index > 0 && styles.separator]}>
            <View style={[styles.icon, strength ? styles.iconStrength : styles.iconFocus]}>
              <Ionicons
                name={strength ? "checkmark" : "arrow-up"}
                size={15}
                color={strength ? colors.success : colors.accent}
              />
            </View>
            <View style={styles.copy}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.description}>{item.description}</Text>
              {item.suggestion ? (
                <Text style={styles.suggestion}>{item.suggestion}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 13,
    paddingVertical: 14,
  },
  separator: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  iconStrength: {
    backgroundColor: "rgba(32, 164, 100, 0.10)",
  },
  iconFocus: {
    backgroundColor: "rgba(255, 90, 54, 0.10)",
  },
  copy: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  description: {
    marginTop: 4,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.secondary,
  },
  suggestion: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    color: colors.accentDark,
  },
});

import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { PressableScale } from "@/components/ui/PressableScale";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/theme/colors";

export type PracticeRecommendationProps = {
  onPractice: () => void;
};

export function PracticeRecommendation({ onPractice }: PracticeRecommendationProps) {
  return (
    <View>
      <SectionHeader title="What to practice next" />
      <View style={styles.panel}>
        <View style={styles.icon}>
          <Ionicons name="people-outline" size={20} color={colors.accent} />
        </View>
        <Text style={styles.title}>Behavioral answers</Text>
        <Text style={styles.reason}>
          Your technical explanations were strong, but your experience-based answers would improve
          with clearer structure.
        </Text>
        <PressableScale
          onPress={onPractice}
          accessibilityLabel="Practice behavioral questions"
          style={styles.ctaPress}
        >
          <View style={styles.cta}>
            <Text style={styles.ctaText}>Practice behavioral questions</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 22,
    backgroundColor: "#FBF1EC",
    borderWidth: 1,
    borderColor: "#F4D9D0",
    padding: 20,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255, 90, 54, 0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  reason: {
    marginTop: 7,
    fontSize: 13.5,
    lineHeight: 20.5,
    color: colors.secondary,
  },
  ctaPress: {
    marginTop: 18,
  },
  cta: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 18,
  },
  ctaText: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});

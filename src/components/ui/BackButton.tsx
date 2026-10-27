import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";

export type BackButtonProps = {
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * The shared circular back control: a refined white pill with a hairline
 * border and tactile spring feedback.
 */
export function BackButton({
  onPress,
  accessibilityLabel = "Go back",
}: BackButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      collapsed
      activeScale={0.92}
      style={styles.wrap}
    >
      <View style={styles.button}>
        <Ionicons name="chevron-back" size={20} color={colors.ink} style={styles.icon} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 42,
    height: 42,
  },
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#151515",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  icon: {
    marginRight: 1,
  },
});
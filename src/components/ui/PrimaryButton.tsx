import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

/* eslint-disable react-hooks/immutability -- Reanimated shared-value writes in press and loading handlers */

import { colors } from "@/theme/colors";

export type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
};

function LoadingDot() {
  const opacity = useSharedValue(0.25);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 360 }),
        withTiming(0.25, { duration: 360 })
      ),
      -1,
      false,
      (finished) => {
        if (!finished) return;
        opacity.value = 0.25;
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: 0.7 + 0.3 * opacity.value }],
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

/**
 * The single strong action: a vibrant coral pill with tactile spring feedback
 * and subtle elevation. Supports icon, loading state, and disabled look.
 */
export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  icon,
}: PrimaryButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const inactive = loading || disabled;

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: inactive, busy: loading }}
        onPressIn={() => {
          if (inactive) return;
          scale.value = withSpring(0.96, { damping: 14, stiffness: 380 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 12, stiffness: 320 });
        }}
        onPress={inactive ? undefined : onPress}
        style={({ pressed }) => [
          styles.button,
          pressed && !inactive && styles.buttonPressed,
          disabled && styles.buttonDisabled,
          loading && styles.buttonLoading,
        ]}
      >
        {loading ? (
          <Animated.View style={styles.dots}>
            <LoadingDot />
            <LoadingDot />
            <LoadingDot />
          </Animated.View>
        ) : (
          <View style={styles.contentRow}>
            {icon ? <Ionicons name={icon} size={19} color="#FFFFFF" /> : null}
            <Text style={styles.label}>{label}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    ...Platform.select({
      ios: {
        shadowColor: colors.accent,
        shadowOpacity: 0.3,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: "0 4px 14px rgba(255, 90, 54, 0.28)",
      },
      default: {},
    }),
  },
  buttonPressed: {
    backgroundColor: colors.accentDark,
  },
  buttonDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonLoading: {
    backgroundColor: colors.accentDark,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 16.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#FFFFFF",
  },
});
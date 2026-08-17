import { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
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
 * The single strong action: a coral pill with a quiet scale-down on press.
 * Supports a busy state (three subtle dots) and a soft disabled look.
 */
export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
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
          scale.value = withSpring(0.98, { damping: 30, stiffness: 420 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 18, stiffness: 320 });
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
          <Text style={styles.label}>{label}</Text>
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
    paddingHorizontal: 32,
  },
  buttonPressed: {
    backgroundColor: colors.accentDark,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonLoading: {
    backgroundColor: colors.accentDark,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
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
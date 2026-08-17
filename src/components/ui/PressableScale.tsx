import { forwardRef, type ReactNode, useCallback } from "react";
import {
  Pressable,
  type AccessibilityState,
  type StyleProp,
  type View,
  type ViewStyle,
} from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

export type PressableScaleProps = {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  /** True for small icon/row targets that need an invisible touch margin. */
  collapsed?: boolean;
};

/**
 * Pressable with restrained tactile feedback: the whole hit area scales
 * down ~3% on press and eases back out. Settled and still between presses.
 */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  {
    children,
    onPress,
    onLongPress,
    disabled,
    style,
    accessibilityLabel,
    accessibilityState,
    collapsed,
  },
  ref,
) {
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(0.97, { duration: 90 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View ref={ref} style={[animatedStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
        onPress={disabled ? undefined : onPress}
        onLongPress={disabled ? undefined : onLongPress}
        onPressIn={disabled ? undefined : handlePressIn}
        onPressOut={disabled ? undefined : handlePressOut}
        disabled={disabled}
        hitSlop={collapsed ? 10 : undefined}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
});

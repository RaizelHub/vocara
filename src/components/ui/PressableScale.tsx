import { forwardRef, type ReactNode, useCallback } from "react";
import {
  Pressable,
  type AccessibilityState,
  type StyleProp,
  type View,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

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
  /** Custom scale factor on press (default: 0.96) */
  activeScale?: number;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable with tactile spring feedback: scales down smoothly on press and
 * bounces back with natural spring dynamics.
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
    activeScale = 0.96,
  },
  ref,
) {
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(activeScale, { damping: 14, stiffness: 380 });
  }, [activeScale, scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 320 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      ref={ref as any}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={disabled ? undefined : handlePressOut}
      disabled={disabled}
      hitSlop={collapsed ? 10 : undefined}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
});


import { useEffect, useState } from "react";
import type { StyleProp, TextStyle } from "react-native";
import { Text } from "react-native";
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

export type CountUpValueProps = {
  value: number;
  active: boolean;
  duration?: number;
  delay?: number;
  reducedMotion?: boolean;
  style?: StyleProp<TextStyle>;
};

/**
 * Renders a number that counts up from 0 with an eased curve once the host
 * slide becomes active. The counter runs on the UI thread; the text update
 * is forwarded to JS.
 */
export function CountUpValue({
  value,
  active,
  duration = 1400,
  delay = 0,
  reducedMotion = false,
  style,
}: CountUpValueProps) {
  const progress = useSharedValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (reducedMotion) {
      progress.value = withDelay(delay, withTiming(value, { duration: 1 }));
      return;
    }
    progress.value = withDelay(
      delay,
      withTiming(value, { duration, easing: Easing.out(Easing.cubic) })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, value, delay, reducedMotion]);

  useAnimatedReaction(
    () => progress.value,
    (current) => {
      runOnJS(setDisplay)(Math.round(current));
    }
  );

  return (
    <Text style={style} accessibilityLiveRegion="polite">
      {display}
    </Text>
  );
}
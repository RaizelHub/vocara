import { useEffect, useState } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";

export type AnimatedNumberProps = {
  value: number;
  duration?: number;
  /** Milliseconds to wait before starting the count. */
  delay?: number;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
};

/**
 * Counts from 0 to `value` once on mount using an ease-out curve driven
 * by requestAnimationFrame. Settles on the final value and stays still.
 */
export function AnimatedNumber({ value, duration = 1000, delay = 0, style, accessibilityLabel }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let start: number | null = null;
    let frame = 0;

    const step = (now: number) => {
      if (start === null) start = now;
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    const timer = setTimeout(() => {
      frame = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [value, duration, delay]);

  return (
    <Text accessibilityLabel={accessibilityLabel} style={style}>
      {display}
    </Text>
  );
}
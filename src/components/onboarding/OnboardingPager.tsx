import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/* eslint-disable react-hooks/immutability -- Reanimated shared-value writes in gesture worklets */

export type OnboardingPagerProps = {
  current: number;
  onChange: (index: number) => void;
  reducedMotion?: boolean;
  children: ReactNode[];
};

const SWIPE_TRIGGER = 0.24;
const VELOCITY_TRIGGER = 380;

/**
 * Horizontal pager for the onboarding stages, hand-rolled on the UI thread.
 * Drags are clamped to the page bounds; on release the nearest page snaps
 * with an eased settle. Programmatic page changes (buttons, pills, skip)
 * flow through the `current` prop.
 */
export function OnboardingPager({
  current,
  onChange,
  reducedMotion = false,
  children,
}: OnboardingPagerProps) {
  const { width } = useWindowDimensions();
  const count = children.length;

  const translateX = useSharedValue(-current * width);
  const pageIndex = useSharedValue(current);

useEffect(() => {
    pageIndex.value = current;
    translateX.value = withTiming(-current * width, {
      duration: reducedMotion ? 200 : 400,
      easing: Easing.out(Easing.cubic),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, width, reducedMotion]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!reducedMotion)
        .activeOffsetX([-8, 8])
        .failOffsetY([-14, 14])
        .onUpdate((event) => {
          const base = -pageIndex.value * width;
          translateX.value = Math.max(
            -width * (count - 1),
            Math.min(0, base + event.translationX)
          );
        })
        .onEnd((event) => {
          const delta = event.translationX;
          const velocity = event.velocityX;
          let next = pageIndex.value;

          if (delta < -width * SWIPE_TRIGGER || velocity < -VELOCITY_TRIGGER) {
            next = Math.min(count - 1, pageIndex.value + 1);
          } else if (
            delta > width * SWIPE_TRIGGER ||
            velocity > VELOCITY_TRIGGER
          ) {
            next = Math.max(0, pageIndex.value - 1);
          }

          pageIndex.value = next;
          translateX.value = withTiming(-next * width, {
            duration: reducedMotion ? 160 : 360,
            easing: Easing.out(Easing.cubic),
          });
          runOnJS(onChange)(next);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, count, reducedMotion]
  );

  return (
    <View style={styles.viewport}>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.row,
            { width: width * count, transform: [{ translateX }] },
          ]}
        >
          {children.map((page, index) => (
            <View key={index} style={{ width }}>
              {page}
            </View>
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: "hidden",
  },
  row: {
    flex: 1,
    flexDirection: "row",
  },
});
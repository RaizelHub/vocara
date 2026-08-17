import { useEffect, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/theme/colors";

const HEIGHTS = [
  12, 18, 27, 38, 49, 57, 63, 58, 47, 36, 28, 21, 31, 44, 55, 61, 52, 40,
  29, 20, 14,
];

export type ScoreWaveProps = {
  score: number;
};

/** A voice-shaped score meter with one clipped coral layer over a quiet base. */
export function ScoreWave({ score }: ScoreWaveProps) {
  const [width, setWidth] = useState(0);
  const fill = useSharedValue(0);

  useEffect(() => {
    fill.value = withDelay(
      180,
      withTiming(score / 100, {
        duration: 1050,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [fill, score]);

  const fillStyle = useAnimatedStyle(() => ({
    width: width * fill.value,
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={handleLayout}
      style={styles.frame}
      accessibilityRole="progressbar"
      accessibilityLabel={`Interview score ${score} out of 100`}
      accessibilityValue={{ min: 0, max: 100, now: score }}
    >
      <WaveRow color={colors.border} />
      <Animated.View style={[styles.fillClip, fillStyle]}>
        <View style={{ width }}>
          <WaveRow color={colors.accent} />
        </View>
      </Animated.View>
    </View>
  );
}

function WaveRow({ color }: { color: string }) {
  return (
    <View style={styles.waveRow}>
      {HEIGHTS.map((height, index) => (
        <View key={`${height}-${index}`} style={[styles.bar, { height, backgroundColor: color }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 64,
    justifyContent: "center",
    overflow: "hidden",
  },
  waveRow: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  bar: {
    flex: 1,
    borderRadius: 999,
  },
  fillClip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    overflow: "hidden",
  },
});

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Easing, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

import { WaveBar } from "./WaveBar";
import { colors } from "@/theme/colors";

export type WaveformProps = {
  reducedMotion?: boolean;
};

type BarSpec = {
  width: number;
  restHeight: number;
  amplitude: number;
  period: number;
  phase: number;
  color: string;
};

/** One-shot design of the mark: quiet on the edges, confident in the middle. */
const BARS: BarSpec[] = [
  { width: 7, restHeight: 26, amplitude: 24, period: 1600, phase: 0.92, color: colors.muted },
  { width: 13, restHeight: 40, amplitude: 36, period: 2200, phase: 0.18, color: colors.ink },
  { width: 8, restHeight: 54, amplitude: 36, period: 1450, phase: 0.55, color: colors.ink },
  { width: 15, restHeight: 62, amplitude: 46, period: 2600, phase: 0.35, color: colors.accent },
  { width: 8, restHeight: 54, amplitude: 36, period: 1200, phase: 0.72, color: colors.ink },
  { width: 13, restHeight: 40, amplitude: 36, period: 1800, phase: 0.05, color: colors.ink },
  { width: 7, restHeight: 26, amplitude: 24, period: 2000, phase: 0.4, color: colors.muted },
];

const WAVEFORM_HEIGHT = 124;
const ENTRANCE_STAGGER = 90;

/**
 * The VOCARA opening waveform. Bars entrance with a short stagger, then
 * breathe under a shared `energy` curve that eases from quiet to full
 * animation over ~1.8s.
 */
export function Waveform({ reducedMotion = false }: WaveformProps) {
  const energy = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      energy.value = withDelay(200, withTiming(0.45, { duration: 600, easing: Easing.out(Easing.cubic) }));
      return;
    }

    energy.value = withDelay(200, withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  return (
    <View style={styles.waveform} accessibilityElementsHidden>
      {BARS.map((bar, index) => (
        <WaveBar
          key={index}
          {...bar}
          delay={120 + index * ENTRANCE_STAGGER}
          energy={energy}
          reducedMotion={reducedMotion}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  waveform: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: WAVEFORM_HEIGHT,
  },
});
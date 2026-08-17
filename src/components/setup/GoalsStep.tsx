import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/* eslint-disable react-hooks/immutability -- Reanimated shared-value writes in select handlers */

import { GoalPill } from "./GoalPill";
import { colors } from "@/theme/colors";
import { MAX_GOALS } from "@/types/career";

export type GoalsStepProps = {
  goals: string[];
  onToggle: (goal: string) => void;
};

const GOALS = [
  "Confidence",
  "English fluency",
  "Grammar",
  "Clearer answers",
  "Interview structure",
  "Technical questions",
  "Pronunciation",
  "Speaking naturally",
] as const;

/**
 * Step 3: up to three focus areas. A fourth pick is gently refused — the
 * grid gives a short wobble and the "Choose up to 3" note appears.
 */
export function GoalsStep({ goals, onToggle }: GoalsStepProps) {
  const [limitNote, setLimitNote] = useState(goals.length >= MAX_GOALS);
  const wobble = useSharedValue(0);

  const gridStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: wobble.value }],
  }));

  const handlePress = (goal: string) => {
    if (goals.length >= MAX_GOALS && !goals.includes(goal)) {
      setLimitNote(true);
      wobble.value = withSequence(
        withTiming(-9, { duration: 40 }),
        withTiming(9, { duration: 48 }),
        withTiming(-5, { duration: 40 }),
        withTiming(0, { duration: 44 })
      );
      return;
    }
    onToggle(goal);
    if (goals.length + (goals.includes(goal) ? -1 : 1) < MAX_GOALS) {
      setLimitNote(false);
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.wrap, gridStyle]}>
        {GOALS.map((goal) => (
          <GoalPill
            key={goal}
            label={goal}
            selected={goals.includes(goal)}
            onPress={() => handlePress(goal)}
          />
        ))}
      </Animated.View>
      <View style={styles.noteRow}>
        {limitNote && (
          <Text style={styles.note}>Choose up to 3</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 34,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  noteRow: {
    marginTop: 14,
    minHeight: 18,
  },
  note: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    letterSpacing: 0.3,
  },
});
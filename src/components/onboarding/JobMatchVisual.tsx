import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/theme/colors";

export type JobMatchVisualProps = {
  active: boolean;
  reducedMotion?: boolean;
};

const SKILLS = ["React", "TypeScript", "REST APIs", "Git"];

const QUESTIONS = [
  "Tell me about your React experience.",
  "How have you worked with REST APIs?",
  "Walk me through a time you used Git.",
];

function clamp01(value: number) {
  "worklet";
  return Math.min(1, Math.max(0, value));
}

function QuestionRow({
  index,
  question,
  order,
}: {
  index: number;
  question: string;
  order: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const t = clamp01((order.value - (0.46 + 0.07 * index)) / 0.2);
    return {
      opacity: t,
      transform: [{ translateY: (1 - t) * 22 }],
    };
  });

  return (
    <Animated.View style={[styles.answer, style]}>
      <View style={styles.answerBar} />
      <Text style={styles.answerText} numberOfLines={2}>
        {question}
      </Text>
    </Animated.View>
  );
}

/**
 * A job description card whose requirement chips visually transform into
 * interview questions. One `phase` driver (0→1) choreographs the whole
 * metamorphosis.
 */
export function JobMatchVisual({
  active,
  reducedMotion = false,
}: JobMatchVisualProps) {
  const phase = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (!active) return;
    phase.value = withTiming(1, {
      duration: reducedMotion ? 250 : 2200,
      easing: Easing.inOut(Easing.quad),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion]);

  const cardStyle = useAnimatedStyle(() => {
    const t = clamp01(phase.value / 0.28);
    return {
      opacity: t,
      transform: [
        { translateY: (1 - t) * 20 },
        { scale: 0.94 + 0.06 * t },
      ],
    };
  });

  const chipsStyle = useAnimatedStyle(() => {
    const t = clamp01((phase.value - 0.32) / 0.14);
    return {
      opacity: 1 - t,
      transform: [{ translateY: -6 * t }, { scale: 0.88 + 0.12 * t }],
    };
  });

  const connectorStyle = useAnimatedStyle(() => {
    const inT = clamp01((phase.value - 0.26) / 0.1);
    const outT = 1 - clamp01((phase.value - 0.5) / 0.14);
    return {
      opacity: Math.min(inT, outT),
      transform: [{ scaleY: Math.min(inT, outT) }],
    };
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.card, cardStyle]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardCaption}>JOB DESCRIPTION</Text>
          <Text style={styles.cardTitle}>Junior React Developer</Text>
        </View>
        <Animated.View style={[styles.skills, chipsStyle]}>
          {SKILLS.map((skill) => (
            <Text key={skill} style={styles.skill}>
              {skill}
            </Text>
          ))}
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.connector, connectorStyle]}>
        <View style={styles.connectorLine} />
        <View style={styles.connectorDot} />
      </Animated.View>

      <View style={styles.answers}>
        {QUESTIONS.map((question, index) => (
          <QuestionRow
            key={question}
            index={index}
            question={question}
            order={phase}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 340,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 18,
  },
  cardHeader: {
    marginBottom: 14,
  },
  cardCaption: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    color: colors.muted,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  skills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  skill: {
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.ink,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: "hidden",
  },
  connector: {
    alignSelf: "flex-start",
    marginLeft: 30,
    paddingVertical: 8,
    alignItems: "center",
  },
  connectorLine: {
    width: 2,
    height: 14,
    borderRadius: 1,
    backgroundColor: colors.border,
  },
  connectorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 4,
  },
  answers: {
    gap: 8,
  },
  answer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  answerBar: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginRight: 12,
  },
  answerText: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: "500",
    color: colors.ink,
  },
});

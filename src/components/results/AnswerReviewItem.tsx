import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ImprovedAnswer } from "@/components/results/ImprovedAnswer";
import { PressableScale } from "@/components/ui/PressableScale";
import type { InterviewAnswerFeedback } from "@/data/mockInterviewResult";
import { colors } from "@/theme/colors";
import { interpretScore } from "@/utils/resultScore";

export type AnswerReviewItemProps = {
  answer: InterviewAnswerFeedback;
  expanded: boolean;
  strongest?: boolean;
  retryCandidate?: boolean;
  first?: boolean;
  onToggle: () => void;
  onRetry: () => void;
};

export function AnswerReviewItem({
  answer,
  expanded,
  strongest = false,
  retryCandidate = false,
  first = false,
  onToggle,
  onRetry,
}: AnswerReviewItemProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withTiming(expanded ? 180 : 0, { duration: 220 });
  }, [expanded, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      layout={LinearTransition.duration(260)}
      style={[styles.item, !first && styles.separator]}
    >
      <PressableScale
        onPress={onToggle}
        accessibilityLabel={`Question ${answer.questionNumber}. ${answer.question}. Score ${answer.score}. ${interpretScore(answer.score)}`}
        accessibilityState={{ expanded }}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow}>Question {answer.questionNumber}</Text>
              {strongest ? <HighlightBadge label="Your strongest answer" /> : null}
              {retryCandidate ? <HighlightBadge label="Worth another try" soft /> : null}
            </View>
            <Text style={styles.question} numberOfLines={expanded ? undefined : 2}>
              {answer.question}
            </Text>
            <View style={styles.statusRow}>
              <Text style={styles.score}>{answer.score}</Text>
              <Text style={styles.status}>{interpretScore(answer.score)}</Text>
            </View>
          </View>
          <Animated.View style={chevronStyle}>
            <Ionicons name="chevron-down" size={19} color={colors.muted} />
          </Animated.View>
        </View>
      </PressableScale>

      {expanded ? (
        <Animated.View
          entering={FadeInDown.duration(260)}
          exiting={FadeOutUp.duration(180)}
          style={styles.expanded}
        >
          <View style={styles.metrics}>
            <Metric label="Duration" value={formatDuration(answer.durationSeconds)} />
            <Metric label="Words" value={String(answer.wordCount)} />
            <Metric label="Pace" value={`${answer.speakingPace} wpm`} />
            <Metric
              label="Fillers"
              value={String(answer.fillerWords.reduce((total, item) => total + item.count, 0))}
            />
          </View>

          <Text style={styles.contentHeading}>Your answer</Text>
          <View style={styles.transcriptBlock}>
            <Text style={styles.transcript}>“{answer.transcript}”</Text>
          </View>

          {answer.fillerWords.length > 0 ? (
            <View style={styles.fillerBlock}>
              <Text style={styles.secondaryHeading}>Filler words detected</Text>
              <View style={styles.fillerRow}>
                {answer.fillerWords.map((filler) => (
                  <View key={filler.word} style={styles.fillerPill}>
                    <Text style={styles.fillerText}>
                      {filler.word} x {filler.count}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <EditorialBlock
            icon="checkmark"
            title="What worked"
            lines={answer.strengths}
            tone="success"
          />
          <EditorialBlock
            icon="arrow-up"
            title="Improve"
            lines={answer.improvements}
            tone="accent"
          />

          <View style={styles.approachBlock}>
            <Text style={styles.contentHeading}>Better approach</Text>
            <Text style={styles.approach}>{answer.betterApproach}</Text>
          </View>

          <ImprovedAnswer answer={answer.improvedAnswer} />

          {retryCandidate ? (
            <PressableScale
              onPress={onRetry}
              accessibilityLabel="Practice this question again"
              style={styles.retryPress}
            >
              <View style={styles.retryButton}>
                <Ionicons name="refresh" size={17} color="#FFFFFF" />
                <Text style={styles.retryLabel}>Practice this again</Text>
              </View>
            </PressableScale>
          ) : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function HighlightBadge({ label, soft = false }: { label: string; soft?: boolean }) {
  return (
    <View style={[styles.badge, soft && styles.badgeSoft]}>
      <Text style={[styles.badgeText, soft && styles.badgeTextSoft]}>{label}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function EditorialBlock({
  icon,
  title,
  lines,
  tone,
}: {
  icon: "checkmark" | "arrow-up";
  title: string;
  lines: string[];
  tone: "success" | "accent";
}) {
  const color = tone === "success" ? colors.success : colors.accent;
  return (
    <View style={styles.editorialBlock}>
      <View style={styles.editorialHeading}>
        <Ionicons name={icon} size={15} color={color} />
        <Text style={styles.contentHeading}>{title}</Text>
      </View>
      {lines.map((line) => (
        <Text key={line} style={styles.editorialLine}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  item: {
    paddingHorizontal: 16,
  },
  separator: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  eyebrow: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  badge: {
    borderRadius: 7,
    backgroundColor: "rgba(32, 164, 100, 0.10)",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeSoft: {
    backgroundColor: "rgba(255, 90, 54, 0.10)",
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: colors.success,
  },
  badgeTextSoft: {
    color: colors.accentDark,
  },
  question: {
    marginTop: 7,
    fontSize: 15.5,
    lineHeight: 21,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 7,
    marginTop: 7,
  },
  score: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.accent,
    fontVariant: ["tabular-nums"],
  },
  status: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.secondary,
  },
  expanded: {
    paddingBottom: 22,
  },
  metrics: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    marginBottom: 20,
  },
  metric: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 3,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  metricLabel: {
    marginTop: 3,
    fontSize: 10.5,
    color: colors.muted,
  },
  contentHeading: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.ink,
  },
  transcriptBlock: {
    marginTop: 9,
    borderRadius: 16,
    backgroundColor: colors.background,
    padding: 15,
  },
  transcript: {
    fontSize: 13.5,
    lineHeight: 20.5,
    color: colors.secondary,
  },
  fillerBlock: {
    marginTop: 16,
  },
  secondaryHeading: {
    fontSize: 12.5,
    fontWeight: "800",
    color: colors.secondary,
  },
  fillerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 8,
  },
  fillerPill: {
    borderRadius: 8,
    backgroundColor: "#F1F1EC",
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  fillerText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.secondary,
  },
  editorialBlock: {
    marginTop: 20,
  },
  editorialHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 7,
  },
  editorialLine: {
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.secondary,
    marginTop: 3,
  },
  approachBlock: {
    marginTop: 20,
    marginBottom: 18,
  },
  approach: {
    marginTop: 7,
    fontSize: 13.5,
    lineHeight: 20.5,
    color: colors.secondary,
  },
  retryPress: {
    marginTop: 16,
  },
  retryButton: {
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  retryLabel: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});

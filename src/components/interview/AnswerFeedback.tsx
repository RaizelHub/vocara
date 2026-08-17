import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { SkillBar } from "@/components/ui/SkillBar";
import type { AnswerEvaluationResult } from "@/services/evaluationService";
import { colors } from "@/theme/colors";
import { interpretScore } from "@/utils/resultScore";

type AnswerFeedbackProps = {
  evaluation: AnswerEvaluationResult;
};

const CATEGORY_KEYS: { key: keyof AnswerEvaluationResult["scores"]; label: string }[] = [
  { key: "relevance", label: "Relevance" },
  { key: "structure", label: "Structure" },
  { key: "clarity", label: "Clarity" },
  { key: "grammar", label: "Grammar" },
  { key: "vocabulary", label: "Vocabulary" },
  { key: "confidence", label: "Confidence" },
];

export function AnswerFeedback({ evaluation }: AnswerFeedbackProps) {
  const strengths = evaluation.strengths.slice(0, 3);
  const improvements = evaluation.improvements.slice(0, 3);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.heroRow}>
          <Text style={styles.heroScore}>{evaluation.overallScore}</Text>
          <Text style={styles.heroUnit}>/100</Text>
          <Text style={styles.heroLabel}>{interpretScore(evaluation.overallScore)}</Text>
        </View>
        <Text style={styles.summary}>{evaluation.summary}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>How you scored</Text>
        {CATEGORY_KEYS.map(({ key, label }, index) => (
          <View key={key} style={styles.skillRow}>
            <View style={styles.skillTopLine}>
              <Text style={styles.skillName}>{label}</Text>
              <View style={styles.scoreGroup}>
                <Text style={styles.interpretation}>{interpretScore(evaluation.scores[key])}</Text>
                <Text style={styles.skillScore}>{evaluation.scores[key]}</Text>
              </View>
            </View>
            <SkillBar value={evaluation.scores[key]} index={index} />
          </View>
        ))}
      </View>

      {strengths.length > 0 && (
        <View style={styles.card}>
          <FeedbackHeading icon="checkmark" tone="success" title="What worked" />
          {strengths.map((item) => (
            <View key={item.title} style={styles.point}>
              <Text style={styles.pointTitle}>{item.title}</Text>
              <Text style={styles.pointDetail}>{item.detail}</Text>
            </View>
          ))}
        </View>
      )}

      {improvements.length > 0 && (
        <View style={styles.card}>
          <FeedbackHeading icon="arrow-up" tone="accent" title="Improve next time" />
          {improvements.map((item) => (
            <View key={item.title} style={styles.point}>
              <Text style={styles.pointTitle}>{item.title}</Text>
              <Text style={styles.pointDetail}>{item.detail}</Text>
              <Text style={styles.pointAction}>{item.action}</Text>
            </View>
          ))}
        </View>
      )}

      {evaluation.betterApproach ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Better approach</Text>
          <Text style={styles.bodyText}>{evaluation.betterApproach}</Text>
        </View>
      ) : null}

      {evaluation.improvedAnswer ? (
        <View style={styles.improvedCard}>
          <Text style={styles.improvedLabel}>Improved answer</Text>
          <Text style={styles.improvedText}>“{evaluation.improvedAnswer}”</Text>
        </View>
      ) : null}

      {evaluation.fillerWords.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Filler words detected</Text>
          <View style={styles.fillerRow}>
            {evaluation.fillerWords.map((filler) => (
              <View key={filler.word} style={styles.fillerPill}>
                <Text style={styles.fillerText}>
                  {filler.word} x {filler.count}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function FeedbackHeading({
  icon,
  tone,
  title,
}: {
  icon: "checkmark" | "arrow-up";
  tone: "success" | "accent";
  title: string;
}) {
  return (
    <View style={styles.headingRow}>
      <View
        style={[
          styles.headingIcon,
          tone === "success" ? styles.headingIconSuccess : styles.headingIconAccent,
        ]}
      >
        <Ionicons
          name={icon}
          size={13}
          color={tone === "success" ? colors.success : colors.accent}
        />
      </View>
      <Text style={[styles.cardLabel, styles.headingLabel]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 18,
    gap: 12,
  },
  card: {
    backgroundColor: colors.roomCard,
    borderWidth: 1,
    borderColor: colors.roomLine,
    borderRadius: 18,
    padding: 17,
  },
  cardLabel: {
    color: "#8C8A82",
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 8,
  },
  heroScore: {
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: -1,
    color: "#F6F5F0",
    fontVariant: ["tabular-nums"],
  },
  heroUnit: {
    fontSize: 17,
    fontWeight: "800",
    color: "#8C8A82",
  },
  heroLabel: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#B9B8B0",
  },
  summary: {
    marginTop: 10,
    fontSize: 13.5,
    lineHeight: 20.5,
    color: "#B9B8B0",
    textAlign: "center",
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  headingIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  headingIconSuccess: {
    backgroundColor: "rgba(32, 164, 100, 0.13)",
  },
  headingIconAccent: {
    backgroundColor: "rgba(255, 90, 54, 0.13)",
  },
  headingLabel: {
    marginBottom: 0,
  },
  point: {
    marginTop: 12,
  },
  pointTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#F6F5F0",
  },
  pointDetail: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 19.5,
    color: "#B9B8B0",
  },
  pointAction: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 18.5,
    fontWeight: "700",
    color: colors.accent,
  },
  bodyText: {
    marginTop: -4,
    fontSize: 13.5,
    lineHeight: 20.5,
    color: "#B9B8B0",
  },
  improvedCard: {
    borderRadius: 18,
    backgroundColor: colors.roomCard,
    borderWidth: 1,
    borderColor: "rgba(255, 90, 54, 0.35)",
    padding: 17,
  },
  improvedLabel: {
    fontSize: 13.5,
    fontWeight: "800",
    color: colors.accent,
  },
  improvedText: {
    marginTop: 8,
    fontSize: 13.5,
    lineHeight: 20.5,
    color: "#E7E6E0",
  },
  skillRow: {
    marginTop: 13,
    gap: 6,
  },
  skillTopLine: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  skillName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#E7E6E0",
  },
  scoreGroup: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 9,
  },
  interpretation: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8C8A82",
  },
  skillScore: {
    minWidth: 22,
    textAlign: "right",
    fontSize: 13.5,
    fontWeight: "800",
    color: "#F6F5F0",
    fontVariant: ["tabular-nums"],
  },
  fillerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  fillerPill: {
    borderRadius: 8,
    backgroundColor: "#2A2824",
    borderWidth: 1,
    borderColor: colors.roomLine,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  fillerText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#B9B8B0",
  },
});
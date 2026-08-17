import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "@/theme/colors";
import type {
  SpeakingAttemptResult,
  SpeakingCategoryScores,
} from "@/types/speaking";

const SCORE_ROWS: { key: keyof SpeakingCategoryScores; label: string }[] = [
  { key: "clarity", label: "Clarity" },
  { key: "fluency", label: "Fluency" },
  { key: "grammar", label: "Grammar" },
  { key: "vocabulary", label: "Vocabulary" },
  { key: "structure", label: "Structure" },
  { key: "conciseness", label: "Conciseness" },
];

export type AttemptFeedbackCardProps = {
  attempt: SpeakingAttemptResult;
  previousScore?: number | null;
};

function formatPace(wordsPerMinute: number) {
  return `${Math.round(wordsPerMinute)} wpm`;
}

export function AttemptFeedbackCard({
  attempt,
  previousScore,
}: AttemptFeedbackCardProps) {
  const score = attempt.score ?? 0;
  const delta =
    previousScore === null ||
    previousScore === undefined ||
    previousScore === 0
      ? null
      : score - previousScore;
  const scores = attempt.scores ?? ({} as SpeakingCategoryScores);
  const hasCorrections = (attempt.grammarCorrections ?? []).length > 0;
  const hasPhrasing = (attempt.naturalPhrasing ?? []).length > 0;
  const hasFiller = (attempt.fillerWords ?? []).length > 0;

  return (
    <View style={styles.card}>
      <View style={styles.scoreRow}>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreValue}>{score}</Text>
          <Text style={styles.scoreLabel}>Attempt {attempt.attemptNumber}</Text>
          {delta !== null && (
            <View style={styles.deltaRow}>
              <Ionicons
                name={delta >= 0 ? "arrow-up" : "arrow-down"}
                size={12}
                color={delta >= 0 ? colors.success : colors.warning}
              />
              <Text style={[styles.deltaText, delta < 0 && styles.deltaTextDown]}>
                {delta >= 0 ? "+" : ""}
                {delta} vs last
              </Text>
            </View>
          )}
        </View>
        <View style={styles.metaBlock}>
          <Text style={styles.metaText}>{attempt.wordCount ?? 0} words</Text>
          {attempt.speakingPace !== null && attempt.speakingPace !== undefined && (
            <Text style={styles.metaText}>{formatPace(attempt.speakingPace)}</Text>
          )}
          {attempt.durationSeconds !== null && attempt.durationSeconds !== undefined && (
            <Text style={styles.metaText}>{attempt.durationSeconds}s</Text>
          )}
        </View>
      </View>

      <View style={styles.skillList}>
        {SCORE_ROWS.map((row) => (
          <View key={row.key} style={styles.skillRow}>
            <View style={styles.skillTop}>
              <Text style={styles.skillName}>{row.label}</Text>
              <Text style={styles.skillValue}>{scores[row.key] ?? score}</Text>
            </View>
            <View style={styles.skillTrack}>
              <View
                style={[
                  styles.skillFill,
                  { width: `${Math.min(100, Math.max(0, scores[row.key] ?? score))}%` },
                ]}
              />
            </View>
          </View>
        ))}
      </View>

      {attempt.summary ? (
        <Text style={styles.summary}>{attempt.summary}</Text>
      ) : null}

      {(attempt.strengths ?? []).length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>What went well</Text>
          {attempt.strengths.map((point, index) => (
            <View key={index} style={styles.pointRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.pointText}>
                <Text style={styles.pointStrong}>{point.title}. </Text>
                {point.detail}
              </Text>
            </View>
          ))}
        </View>
      )}

      {(attempt.improvements ?? []).length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Try next time</Text>
          {attempt.improvements.map((point, index) => (
            <View key={index} style={styles.pointRow}>
              <Ionicons name="bulb" size={16} color={colors.warning} />
              <Text style={styles.pointText}>
                <Text style={styles.pointStrong}>{point.title}. </Text>
                {point.detail}
                {point.action ? ` ${point.action}` : ""}
              </Text>
            </View>
          ))}
        </View>
      )}

      {hasCorrections && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Grammar fixes</Text>
          {attempt.grammarCorrections.map((item, index) => (
            <View key={index} style={styles.correctionCard}>
              <Text style={styles.correctionOriginal}>{item.original}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.accent} />
              <Text style={styles.correctionFixed}>{item.corrected}</Text>
              {item.explanation ? (
                <Text style={styles.correctionNote}>{item.explanation}</Text>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {hasPhrasing && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>More natural phrasing</Text>
          {attempt.naturalPhrasing.map((item, index) => (
            <View key={index} style={styles.correctionCard}>
              <Text style={styles.correctionOriginal}>{item.original}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.accent} />
              <Text style={styles.correctionFixed}>{item.improved}</Text>
            </View>
          ))}
        </View>
      )}

      {attempt.betterVersion ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>A stronger spoken version</Text>
          <Text style={styles.betterVersion}>{attempt.betterVersion}</Text>
        </View>
      ) : null}

      {hasFiller && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Filler words</Text>
          <View style={styles.fillerRow}>
            {attempt.fillerWords.map((item) => (
              <View key={item.word} style={styles.fillerChip}>
                <Text style={styles.fillerChipText}>
                  “{item.word}” × {item.count}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {attempt.transcript ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Your transcript</Text>
          <Text style={styles.transcript}>{attempt.transcript}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 18,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  scoreBlock: {
    alignItems: "flex-start",
  },
  scoreValue: {
    fontSize: 52,
    fontWeight: "800",
    letterSpacing: -2,
    lineHeight: 58,
    includeFontPadding: false,
    color: colors.ink,
  },
  scoreLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.secondary,
  },
  deltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 6,
  },
  deltaText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.success,
  },
  deltaTextDown: {
    color: colors.warning,
  },
  metaBlock: {
    alignItems: "flex-end",
    gap: 4,
    paddingTop: 6,
  },
  metaText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
  skillList: {
    gap: 13,
  },
  skillRow: {
    gap: 5,
  },
  skillTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  skillName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.ink,
  },
  skillValue: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  skillTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  skillFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  summary: {
    fontSize: 15,
    lineHeight: 21.5,
    color: colors.ink,
    fontWeight: "600",
  },
  block: {
    gap: 9,
  },
  blockTitle: {
    fontSize: 12.5,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  pointRow: {
    flexDirection: "row",
    gap: 9,
    alignItems: "flex-start",
  },
  pointText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.secondary,
  },
  pointStrong: {
    fontWeight: "800",
    color: colors.ink,
  },
  correctionCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    gap: 5,
  },
  correctionOriginal: {
    fontSize: 13.5,
    color: colors.secondary,
    textDecorationLine: "line-through",
    textDecorationColor: colors.muted,
  },
  correctionFixed: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.ink,
  },
  correctionNote: {
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.muted,
  },
  betterVersion: {
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.ink,
  },
  fillerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  fillerChip: {
    borderRadius: 8,
    backgroundColor: "#FBEEE9",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  fillerChipText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.accentDark,
  },
  transcript: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.secondary,
  },
});
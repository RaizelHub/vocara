import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";

import { PressableScale } from "@/components/ui/PressableScale";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/theme/colors";
import type { MockSession } from "@/data/mock";

type IconName = keyof typeof Ionicons.glyphMap;

const TYPE_ICONS: Record<MockSession["type"], IconName> = {
  "Mock interview": "mic-outline",
  "Job-specific": "briefcase-outline",
  "Quick practice": "flash-outline",
};

export type SessionSummaryProps = {
  session: MockSession;
};

function SessionRow({ session }: SessionSummaryProps) {
  return (
    <PressableScale
      onPress={() => router.push(`/interview/result/${session.id}` as Href)}
      accessibilityLabel={`${session.title}, score ${session.score}, ${session.date}`}
      style={styles.rowWrap}
    >
      <View style={styles.row}>
        <View style={styles.iconBubble}>
          <Ionicons name={TYPE_ICONS[session.type]} size={17} color={colors.accent} />
        </View>
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>
            {session.title}
          </Text>
          <Text style={styles.subtitle}>
            {session.type} · {session.date}
          </Text>
        </View>
        <Text style={styles.score} accessibilityLabel={`Score ${session.score}`}>
          {session.score}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </View>
    </PressableScale>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="mic" size={24} color={colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>Your first practice starts here.</Text>
      <Text style={styles.emptyDesc}>
        Complete one interview and Vocara will begin tracking your progress.
      </Text>
      <PressableScale
        onPress={() => router.push("/interview/setup")}
        accessibilityLabel="Start first interview"
        style={styles.emptyCta}
      >
        <View style={styles.emptyCtaInner}>
          <Text style={styles.emptyCtaLabel}>Start first interview</Text>
        </View>
      </PressableScale>
    </View>
  );
}

export type RecentPracticeProps = {
  sessions: MockSession[];
};

/**
 * Compact rows of past sessions — one line per session, no big cards.
 */
export function RecentPractice({ sessions }: RecentPracticeProps) {
  const hasSessions = sessions.length > 0;

  return (
    <View>
      <SectionHeader title="Recent practice" />
      {hasSessions ? (
        <View style={styles.list}>
          {sessions.map((session, i) => (
            <View key={session.id}>
              {i > 0 && <View style={styles.separator} />}
              <SessionRow session={session} />
            </View>
          ))}
        </View>
      ) : (
        <EmptyState />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  rowWrap: {
    paddingVertical: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#FBEEE9",
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12.5,
    color: colors.secondary,
    marginTop: 2,
  },
  score: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.accent,
    fontVariant: ["tabular-nums"],
  },
  empty: {
    alignItems: "center",
    paddingVertical: 34,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 28,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#FBEEE9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  emptyDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.secondary,
    textAlign: "center",
    marginTop: 6,
    maxWidth: 290,
  },
  emptyCta: {
    marginTop: 18,
  },
  emptyCtaInner: {
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.accent,
    paddingHorizontal: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCtaLabel: {
    color: "#FFFFFF",
    fontSize: 15.5,
    fontWeight: "800",
  },
});
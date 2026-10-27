import { Platform, StyleSheet, Text, View } from "react-native";
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
      activeScale={0.98}
      style={styles.rowWrap}
    >
      <View style={styles.row}>
        <View style={styles.iconBubble}>
          <Ionicons name={TYPE_ICONS[session.type]} size={18} color={colors.accent} />
        </View>
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>
            {session.title}
          </Text>
          <Text style={styles.subtitle}>
            {session.type} · {session.date}
          </Text>
        </View>
        <View style={styles.scorePill}>
          <Text style={styles.scoreText} accessibilityLabel={`Score ${session.score}`}>
            {session.score}%
          </Text>
        </View>
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
      <Text style={styles.emptyTitle}>Your first practice starts here</Text>
      <Text style={styles.emptyDesc}>
        Complete one interview and Vocara will begin tracking your scores and progress.
      </Text>
      <PressableScale
        onPress={() => router.push("/interview/setup")}
        accessibilityLabel="Start first interview"
        activeScale={0.96}
        style={styles.emptyCta}
      >
        <View style={styles.emptyCtaInner}>
          <Text style={styles.emptyCtaLabel}>Start first interview</Text>
          <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
        </View>
      </PressableScale>
    </View>
  );
}

export type RecentPracticeProps = {
  sessions: MockSession[];
};

/**
 * Compact rows of past sessions with clear scores and comfortable touch targets.
 */
export function RecentPractice({ sessions }: RecentPracticeProps) {
  const hasSessions = sessions.length > 0;

  return (
    <View>
      <SectionHeader
        title="Recent Practice"
        subtitle="Review past performance and detailed feedback"
      />
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
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 4,
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.04,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 4px 14px rgba(21, 21, 21, 0.04)",
      },
      default: {},
    }),
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderSubtle,
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
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.accentLight,
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
  scorePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.accentLight,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.accentDark,
    fontVariant: ["tabular-nums"],
  },
  empty: {
    alignItems: "center",
    paddingVertical: 36,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 24,
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.04,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 4px 14px rgba(21, 21, 21, 0.04)",
      },
      default: {},
    }),
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
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
    maxWidth: 280,
  },
  emptyCta: {
    marginTop: 18,
  },
  emptyCtaInner: {
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyCtaLabel: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "800",
  },
});
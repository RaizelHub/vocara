import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type Href } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton } from "@/components/ui/BackButton";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { colors } from "@/theme/colors";
import type { JobAnalysis } from "@/types/job";
import { getJobErrorMessage, jobService } from "@/services/jobService";

const SENIORITY_LABELS: Record<string, string> = {
  intern: "Intern",
  entry: "Entry-level",
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  lead: "Lead",
  manager: "Manager",
  unknown: "Role-based",
};

const IMPORTANCE_LABELS: Record<string, string> = {
  high: "Required",
  medium: "Important",
  low: "Nice to have",
};

export default function JobAnalysisScreen() {
  const insets = useSafeAreaInsets();
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();

  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<"reload" | "analyze">("reload");
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);

  const load = useCallback(async () => {
    if (!jobId) {
      setError("We couldn't load this job analysis.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setErrorAction("reload");
    try {
      const [job, storedAnalysis] = await Promise.all([
        jobService.fetchJobDescription(jobId),
        jobService.fetchJobAnalysis(jobId),
      ]);
      if (!job) {
        setAnalysis(null);
        setError("This job description is no longer available.");
        return;
      }
      setCompanyName(job?.companyName ?? null);
      if (storedAnalysis) {
        setAnalysis(storedAnalysis);
      } else {
        setAnalysis(null);
        if (job && job.analysisStatus === "processing") {
          setError("This job is still being analyzed. Wait a moment and try again.");
          setErrorAction("reload");
        }
      }
    } catch (loadError) {
      setError(getJobErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function reanalyze() {
    if (!jobId || analyzing) return;
    setAnalyzing(true);
    setError(null);
    try {
      await jobService.analyzeJob(jobId);
      await load();
    } catch (analysisError) {
      setError(getJobErrorMessage(analysisError));
      setErrorAction("analyze");
    } finally {
      setAnalyzing(false);
    }
  }

  const seniority = analysis?.seniorityLevel
    ? SENIORITY_LABELS[analysis.seniorityLevel]
    : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Job analysis</Text>
        <Text style={styles.subtitle}>Here&apos;s what Vocara picked up from the posting.</Text>

        {loading && <Text style={styles.stateText}>Loading analysis…</Text>}

        {!loading && error && (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton
              label={errorAction === "reload" ? "Refresh status" : "Try again"}
              onPress={errorAction === "reload" ? () => void load() : reanalyze}
              disabled={analyzing}
            />
          </View>
        )}

        {!loading && !error && !analysis && (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>
              This job description hasn&apos;t been analyzed yet.
            </Text>
            <PrimaryButton
              label="Analyze job description"
              onPress={reanalyze}
              disabled={analyzing}
            />
          </View>
        )}

        {!loading && analysis && (
          <Animated.View entering={FadeInDown.duration(320)}>
            <View style={styles.heroCard}>
              <Text style={styles.heroRole}>
                {analysis.detectedRole ?? "The target role"}
              </Text>
              {(companyName || seniority) && (
                <Text style={styles.heroMeta}>
                  {[companyName, seniority].filter(Boolean).join(" · ")}
                </Text>
              )}
            </View>

            <Text style={styles.sectionLabel}>Summary</Text>
            <Text style={styles.summaryText}>{analysis.summary}</Text>

            <Text style={styles.sectionLabel}>Key skills</Text>
            <SkillList skills={analysis.technicalSkills} />

            <Text style={styles.sectionLabel}>Soft skills</Text>
            <SkillList skills={analysis.softSkills} />

            <Text style={styles.sectionLabel}>What the role involves</Text>
            <BulletList items={analysis.responsibilities} />

            {analysis.interviewFocusAreas.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>What the interview should probe</Text>
                <View style={styles.chipWrap}>
                  {analysis.interviewFocusAreas.map((area) => (
                    <View key={area} style={styles.chip}>
                      <Text style={styles.chipText}>{area}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <View style={styles.ctaWrap}>
              <PrimaryButton
                label="Build my interview"
                onPress={() =>
                  router.replace({
                    pathname: "/interview/job-preview",
                    params: { jobId },
                  } as Href)
                }
              />
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

function SkillList({ skills }: { skills: JobAnalysis["technicalSkills"] }) {
  if (skills.length === 0) return <Text style={styles.emptyText}>Not specified in the posting.</Text>;
  return (
    <View style={styles.skillList}>
      {skills.map((skill) => (
        <View key={skill.name} style={styles.skillRow}>
          <View
            style={[
              styles.importanceDot,
              skill.importance === "high" && styles.importanceHigh,
              skill.importance === "medium" && styles.importanceMedium,
              skill.importance === "low" && styles.importanceLow,
            ]}
          />
          <Text style={styles.skillName}>{skill.name}</Text>
          <Text style={styles.skillImportance}>{IMPORTANCE_LABELS[skill.importance]}</Text>
        </View>
      ))}
    </View>
  );
}

function BulletList({ items }: { items: string[] }) {
  const visible = items.slice(0, 6);
  if (visible.length === 0) return <Text style={styles.emptyText}>Not specified in the posting.</Text>;
  return (
    <View style={styles.bulletList}>
      {visible.map((item) => (
        <View key={item} style={styles.bulletRow}>
          <Ionicons name="ellipse" size={7} color={colors.accent} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.7,
    color: colors.ink,
  },
  subtitle: {
    fontSize: 15.5,
    color: colors.secondary,
    marginTop: 5,
    marginBottom: 4,
  },
  stateCard: {
    marginTop: 26,
    gap: 16,
  },
  stateText: {
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.secondary,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 18,
    marginTop: 18,
  },
  heroRole: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  heroMeta: {
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.muted,
    marginTop: 5,
  },
  sectionLabel: {
    marginTop: 26,
    marginBottom: 12,
    fontSize: 12.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 22.5,
    color: colors.ink,
  },
  skillList: {
    gap: 8,
  },
  skillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  importanceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  importanceHigh: {
    backgroundColor: colors.accent,
  },
  importanceMedium: {
    backgroundColor: "#E0A48C",
  },
  importanceLow: {
    backgroundColor: colors.border,
  },
  skillName: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.ink,
  },
  skillImportance: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  emptyText: {
    fontSize: 13.5,
    color: colors.muted,
  },
  bulletList: {
    gap: 9,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  bulletText: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 20.5,
    color: colors.ink,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: "#FBEEE9",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accentDark,
  },
  ctaWrap: {
    marginTop: 32,
    marginBottom: 10,
  },
});

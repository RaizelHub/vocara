import { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, type Href } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/components/ui/AppHeader";
import { PressableScale } from "@/components/ui/PressableScale";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/theme/colors";
import { getJobErrorMessage, jobService } from "@/services/jobService";
import type { JobDescription } from "@/types/job";

type IconName = keyof typeof Ionicons.glyphMap;

const MODES: { icon: IconName; title: string; subtitle: string; description: string; href: Href }[] = [
  {
    icon: "flash",
    title: "Quick Practice",
    subtitle: "2 min warm-up",
    description: "One targeted question with instant AI coaching and feedback.",
    href: "/interview/quick",
  },
  {
    icon: "mic",
    title: "Mock Interview",
    subtitle: "Full simulation",
    description: "A comprehensive multi-question interview with in-depth evaluation.",
    href: "/interview/setup",
  },
  {
    icon: "briefcase",
    title: "Job-Specific Interview",
    subtitle: "From job posting",
    description: "Practice role-tailored questions generated from real job requirements.",
    href: "/interview/job" as Href,
  },
  {
    icon: "chatbubbles",
    title: "Speaking Practice",
    subtitle: "Fluency & confidence",
    description: "Improve articulation, pacing, and natural speaking under pressure.",
    href: "/speaking",
  },
];

const JOB_STATUS_CONFIG: Record<
  JobDescription["analysisStatus"],
  { label: string; bg: string; text: string }
> = {
  pending: { label: "Not analyzed", bg: colors.surfaceSubtle, text: colors.secondary },
  processing: { label: "Analyzing…", bg: colors.warningLight, text: "#8A5A0E" },
  completed: { label: "Ready", bg: colors.successLight, text: colors.success },
  failed: { label: "Needs retry", bg: colors.errorLight, text: colors.error },
};

export default function PracticeScreen() {
  const insets = useSafeAreaInsets();

  const [jobs, setJobs] = useState<JobDescription[] | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const list = await jobService.fetchSavedJobs();
      setJobs(list);
      setJobsError(null);
    } catch (error) {
      setJobsError(getJobErrorMessage(error));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadJobs();
    }, [loadJobs]),
  );

  function openJob(job: JobDescription) {
    if (job.analysisStatus === "completed") {
      router.push({
        pathname: "/interview/job-preview",
        params: { jobId: job.id },
      } as Href);
      return;
    }
    router.push({
      pathname: "/interview/job-analysis",
      params: { jobId: job.id },
    } as Href);
  }

  function confirmDelete(job: JobDescription) {
    const message =
      "Your interview history stays intact, but you won't be able to build new interviews from this posting.";
    const remove = () => {
      void jobService
        .deleteJobDescription(job.id)
        .then(loadJobs)
        .catch((error) => setJobsError(getJobErrorMessage(error)));
    };

    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Delete this job description?\n\n${message}`)) {
        remove();
      }
      return;
    }

    Alert.alert(
      "Delete this job description?",
      message,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: remove,
        },
      ],
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <AppHeader subtitle="Practice Hub" />
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        entering={FadeInDown.delay(0).duration(300)}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Practice Modes</Text>
          <Text style={styles.subtitle}>Choose how you want Vocara to challenge you today.</Text>
        </View>

        <View style={styles.list}>
          {MODES.map((mode, i) => (
            <Animated.View key={mode.title} entering={FadeInDown.delay(60 + i * 60).duration(360)}>
              <PressableScale
                onPress={() => router.push(mode.href)}
                accessibilityLabel={mode.title}
                activeScale={0.97}
                style={styles.rowWrap}
              >
                <View style={styles.row}>
                  <View style={styles.iconBubble}>
                    <Ionicons name={mode.icon} size={22} color={colors.accent} />
                  </View>
                  <View style={styles.meta}>
                    <View style={styles.rowHeader}>
                      <Text style={styles.rowTitle}>{mode.title}</Text>
                      <View style={styles.subtitleChip}>
                        <Text style={styles.subtitleChipText}>{mode.subtitle}</Text>
                      </View>
                    </View>
                    <Text style={styles.rowDesc}>{mode.description}</Text>
                  </View>
                  <View style={styles.arrowCircle}>
                    <Ionicons name="chevron-forward" size={16} color={colors.ink} />
                  </View>
                </View>
              </PressableScale>
            </Animated.View>
          ))}
        </View>

        {jobsError && (
          <PressableScale
            onPress={() => void loadJobs()}
            accessibilityLabel="Reload saved jobs"
            activeScale={0.97}
          >
            <View style={styles.jobsErrorCard}>
              <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
              <Text style={styles.jobsError}>{jobsError}</Text>
              <Text style={styles.jobsRetry}>Try again</Text>
            </View>
          </PressableScale>
        )}

        {jobs !== null && jobs.length > 0 && (
          <View style={styles.jobsSection}>
            <SectionHeader
              title="Saved Job Postings"
              subtitle="Generate role-specific interviews from these postings"
            />
            <View style={styles.list}>
              {jobs.map((job) => {
                const status = JOB_STATUS_CONFIG[job.analysisStatus];
                return (
                  <View key={job.id} style={styles.savedJobRow}>
                    <PressableScale
                      onPress={() => openJob(job)}
                      onLongPress={() => confirmDelete(job)}
                      accessibilityLabel={`${job.title ?? "Saved job"}, ${status.label}`}
                      activeScale={0.98}
                      style={styles.savedJobMainWrap}
                    >
                      <View style={styles.savedJobMain}>
                        <View style={styles.jobIconBubble}>
                          <Ionicons
                            name="document-text-outline"
                            size={20}
                            color={colors.accentDark}
                          />
                        </View>
                        <View style={styles.meta}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {job.title ?? "Saved job description"}
                          </Text>
                          <View style={styles.jobSubRow}>
                            {job.companyName ? (
                              <Text style={styles.jobCompany} numberOfLines={1}>
                                {job.companyName}
                              </Text>
                            ) : null}
                            <View style={[styles.jobStatusChip, { backgroundColor: status.bg }]}>
                              <Text style={[styles.jobStatusText, { color: status.text }]}>
                                {status.label}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                      </View>
                    </PressableScale>
                    <PressableScale
                      onPress={() => confirmDelete(job)}
                      accessibilityLabel={`Delete ${job.title ?? "saved job"}`}
                      activeScale={0.92}
                      collapsed
                    >
                      <View style={styles.deleteButton}>
                        <Ionicons name="trash-outline" size={17} color={colors.error} />
                      </View>
                    </PressableScale>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  titleBlock: {
    marginTop: 14,
    marginBottom: 22,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.7,
    color: colors.ink,
  },
  subtitle: {
    fontSize: 15,
    color: colors.secondary,
    marginTop: 4,
    lineHeight: 20,
  },
  list: {
    gap: 14,
  },
  jobsSection: {
    marginTop: 34,
  },
  jobsError: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.error,
    flex: 1,
  },
  jobsErrorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  jobsRetry: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.accentDark,
  },
  savedJobRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 22,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.04,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 3px 12px rgba(21, 21, 21, 0.04)",
      },
      default: {},
    }),
  },
  savedJobMainWrap: {
    flex: 1,
  },
  savedJobMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    paddingRight: 8,
  },
  jobSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  jobCompany: {
    fontSize: 12.5,
    color: colors.secondary,
    fontWeight: "600",
  },
  jobStatusChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  jobStatusText: {
    fontSize: 10.5,
    fontWeight: "800",
  },
  deleteButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor: colors.surfaceSubtle,
  },
  jobIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  rowWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 22,
    padding: 18,
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    flex: 1,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  rowTitle: {
    fontSize: 16.5,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  subtitleChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.surfaceSubtle,
  },
  subtitleChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  rowDesc: {
    fontSize: 13,
    lineHeight: 18.5,
    color: colors.secondary,
    marginTop: 4,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
});


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

import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";
import { getJobErrorMessage, jobService } from "@/services/jobService";
import type { JobDescription } from "@/types/job";

type IconName = keyof typeof Ionicons.glyphMap;

const MODES: { icon: IconName; title: string; description: string; href: Href }[] = [
  {
    icon: "flash",
    title: "Quick Practice",
    description: "One question. Instant feedback. Fit practice in between things.",
    href: "/interview/quick",
  },
  {
    icon: "mic",
    title: "Mock Interview",
    description: "A realistic multi-question interview with a full session ending.",
    href: "/interview/setup",
  },
  {
    icon: "briefcase",
    title: "Job-Specific Interview",
    description: "Practice questions based on a real job description and role.",
    href: "/interview/job" as Href,
  },
  {
    icon: "chatbubbles",
    title: "Speaking Practice",
    description: "Improve fluency, confidence, and natural speaking without a formal interview.",
    href: "/speaking",
  },
];

const JOB_STATUS_LABELS: Record<JobDescription["analysisStatus"], string> = {
  pending: "Not analyzed",
  processing: "Analyzing…",
  completed: "Ready",
  failed: "Needs retry",
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
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <Text style={styles.wordmark}>VOCARA</Text>
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        entering={FadeInDown.delay(0).duration(300)}
      >
        <Text style={styles.title}>Practice</Text>
        <Text style={styles.subtitle}>Choose how you want to practice.</Text>

        <View style={styles.list}>
          {MODES.map((mode, i) => (
            <Animated.View key={mode.title} entering={FadeInDown.delay(80 + i * 70).duration(360)}>
              <PressableScale
                onPress={() => router.push(mode.href)}
                accessibilityLabel={mode.title}
                style={styles.rowWrap}
              >
                <View style={styles.row}>
                  <View style={styles.iconBubble}>
                    <Ionicons name={mode.icon} size={21} color={colors.accent} />
                  </View>
                  <View style={styles.meta}>
                    <Text style={styles.rowTitle}>{mode.title}</Text>
                    <Text style={styles.rowDesc}>{mode.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </View>
              </PressableScale>
            </Animated.View>
          ))}
        </View>

        {jobsError && (
          <PressableScale onPress={() => void loadJobs()} accessibilityLabel="Reload saved jobs">
            <View style={styles.jobsErrorCard}>
              <Text style={styles.jobsError}>{jobsError}</Text>
              <Text style={styles.jobsRetry}>Try again</Text>
            </View>
          </PressableScale>
        )}

        {jobs !== null && jobs.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Your jobs</Text>
            <View style={styles.list}>
              {jobs.map((job) => (
                <View key={job.id} style={styles.savedJobRow}>
                  <PressableScale
                    onPress={() => openJob(job)}
                    onLongPress={() => confirmDelete(job)}
                    accessibilityLabel={`${job.title ?? "Saved job"}, ${JOB_STATUS_LABELS[job.analysisStatus]}`}
                    style={styles.savedJobMainWrap}
                  >
                    <View style={styles.savedJobMain}>
                      <View style={styles.jobIconBubble}>
                        <Ionicons
                          name="document-text-outline"
                          size={19}
                          color={colors.accentDark}
                        />
                      </View>
                      <View style={styles.meta}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {job.title ?? "Saved job description"}
                        </Text>
                        <Text style={styles.rowDesc} numberOfLines={1}>
                          {job.companyName ? `${job.companyName} · ` : ""}
                          {JOB_STATUS_LABELS[job.analysisStatus]}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    </View>
                  </PressableScale>
                  <PressableScale
                    onPress={() => confirmDelete(job)}
                    accessibilityLabel={`Delete ${job.title ?? "saved job"}`}
                  >
                    <View style={styles.deleteButton}>
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </View>
                  </PressableScale>
                </View>
              ))}
            </View>
          </>
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
  wordmark: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 2.4,
    color: colors.ink,
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 44,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: colors.ink,
    marginTop: 20,
  },
  subtitle: {
    fontSize: 15.5,
    color: colors.secondary,
    marginTop: 5,
    marginBottom: 26,
  },
  list: {
    gap: 12,
  },
  sectionLabel: {
    marginTop: 30,
    marginBottom: 12,
    fontSize: 12.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  jobsError: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.error,
    flex: 1,
  },
  jobsErrorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderColor: colors.border,
    borderRadius: 20,
    overflow: "hidden",
  },
  savedJobMainWrap: {
    flex: 1,
  },
  savedJobMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 17,
    paddingRight: 8,
  },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  jobIconBubble: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#FBEEE9",
    alignItems: "center",
    justifyContent: "center",
  },
  rowWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 17,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconBubble: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#FBEEE9",
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  rowDesc: {
    fontSize: 13,
    lineHeight: 18.5,
    color: colors.secondary,
    marginTop: 3,
  },
});

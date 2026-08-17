import { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { router, type Href } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LiveWaveform } from "@/components/interview/LiveWaveform";
import { PressableScale } from "@/components/ui/PressableScale";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { colors } from "@/theme/colors";
import {
  getResumeErrorMessage,
  resumeService,
} from "@/services/resumeService";
import { jobService } from "@/services/jobService";
import { RESUME_SENIORITY_LABELS, type ResumeAnalysis } from "@/types/resume";
import type { JobDescription } from "@/types/job";

const PROCESSING_STAGES = [
  "Uploading your resume…",
  "Extracting the text from your PDF…",
  "Reading your experience and skills…",
  "Building your analysis…",
];

export default function ResumeTabScreen() {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<Awaited<ReturnType<typeof resumeService.fetchResumes>>[number] | null>(null);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [matchScores, setMatchScores] = useState<Record<string, number | null>>({});
  const [savedJobs, setSavedJobs] = useState<JobDescription[]>([]);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const [picking, setPicking] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resumes, jobs] = await Promise.all([
        resumeService.fetchResumes(),
        jobService.fetchSavedJobs(),
      ]);
      const activeResume = resumes[0] ?? null;
      setResume(activeResume);
      setSavedJobs(jobs);
      setJobsError(null);

      if (activeResume && activeResume.processing_status === "completed") {
        const storedAnalysis = await resumeService.fetchResumeAnalysis(activeResume.id);
        setAnalysis(storedAnalysis);
        if (storedAnalysis) {
          const scores: Record<string, number | null> = {};
          await Promise.all(
            jobs.map(async (job) => {
              const match = await resumeService
                .fetchResumeMatch({ resumeId: activeResume.id, jobDescriptionId: job.id })
                .catch(() => null);
              scores[job.id] = match?.overallMatchScore ?? null;
            }),
          );
          setMatchScores(scores);
        }
      } else {
        setAnalysis(null);
        setMatchScores({});
      }
    } catch (loadError) {
      setError(getResumeErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!processing) return;
    const interval = setInterval(() => {
      setStage((s) => Math.min(s + 1, PROCESSING_STAGES.length - 1));
    }, 900);
    return () => clearInterval(interval);
  }, [processing]);

  async function pickAndUpload() {
    if (picking || processing) return;
    setPicking(true);
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.uri || !asset.name) {
        setError("We couldn't read that file. Choose a PDF resume and try again.");
        return;
      }
      const uploaded = await resumeService.uploadResume({
        uri: asset.uri,
        fileName: asset.name,
        mimeType: asset.mimeType ?? "application/pdf",
        sizeBytes: asset.size ?? 0,
        webFile: Platform.OS === "web" ? asset.file : undefined,
      });
      setResume({
        id: uploaded.id,
        file_name: uploaded.file_name,
        processing_status: uploaded.processing_status,
        processing_error: uploaded.processing_error,
        analysis_version: uploaded.analysis_version,
        created_at: uploaded.created_at,
      });
      setAnalysis(null);
      setMatchScores({});

      setStage(0);
      setProcessing(true);
      await resumeService.processResume(uploaded.id);
      await delay(400);
      await load();
    } catch (uploadError) {
      setError(getResumeErrorMessage(uploadError));
    } finally {
      setProcessing(false);
      setPicking(false);
    }
  }

  async function retryAnalysis() {
    if (!resume || processing) return;
    setError(null);
    setStage(0);
    setProcessing(true);
    try {
      await resumeService.processResume(resume.id);
      await delay(400);
      await load();
    } catch (retryError) {
      setError(getResumeErrorMessage(retryError));
    } finally {
      setProcessing(false);
    }
  }

  const processingActive =
    resume?.processing_status === "uploaded" ||
    resume?.processing_status === "extracting" ||
    resume?.processing_status === "analyzing" ||
    processing;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Resume</Text>
        <Text style={styles.subtitle}>
          Upload your resume once and every job interview becomes personal.
        </Text>

        {loading && (
          <Text style={styles.stateText}>Loading your resume…</Text>
        )}

        {!loading && error && (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton label="Try again" onPress={() => void load()} />
          </View>
        )}

        {!loading && !error && !resume && (
          <Animated.View entering={FadeInDown.duration(320)}>
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={34} color={colors.muted} />
              <Text style={styles.emptyTitle}>No resume yet</Text>
              <Text style={styles.emptyText}>
                Add a PDF of your resume and Vocara will analyze your skills, experience, and
                strengths — then use them to tailor your interview practice.
              </Text>
              <View style={styles.emptyCta}>
                <PrimaryButton
                  label={picking ? "Opening picker…" : "Upload resume (PDF)"}
                  onPress={() => void pickAndUpload()}
                  disabled={picking || processing}
                />
              </View>
            </View>
          </Animated.View>
        )}

        {!loading && !error && resume && (
          <Animated.View entering={FadeInDown.duration(320)}>
            <View style={styles.fileCard}>
              <View style={styles.fileIcon}>
                <Ionicons name="document-text" size={18} color={colors.accentDark} />
              </View>
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {resume.file_name}
                </Text>
                <Text style={styles.fileMeta}>
                  {statusLabel(resume.processing_status)}
                  {resume.analysis_version ? ` · v${resume.analysis_version}` : ""}
                </Text>
              </View>
            </View>

            {processingActive && (
              <View style={styles.processingCard}>
                <LiveWaveform active barCount={18} height={30} intensity={0.45} />
                <Text style={styles.processingText}>{PROCESSING_STAGES[stage]}</Text>
              </View>
            )}

            {(resume.processing_status === "extract_failed" ||
              resume.processing_status === "failed") && (
              <View style={styles.stateCard}>
                <Text style={styles.stateText}>
                  {resume.processing_status === "extract_failed"
                    ? "We couldn't read enough text from this PDF. Upload a text-based PDF resume (not a scan) and try again."
                    : resume.processing_error ?? "This resume couldn't be analyzed. Try again."}
                </Text>
                <PrimaryButton
                  label="Try again"
                  onPress={() => void retryAnalysis()}
                  disabled={processing}
                />
                <PressableScale
                  onPress={() => void pickAndUpload()}
                  disabled={picking || processing}
                  accessibilityLabel="Upload a different PDF"
                  style={styles.secondaryButton}
                >
                  <Ionicons name="arrow-up-circle-outline" size={15} color={colors.accentDark} />
                  <Text style={styles.secondaryLabel}>Upload a different PDF</Text>
                </PressableScale>
              </View>
            )}

            {resume.processing_status === "completed" && analysis && (
              <>
                <View style={styles.heroCard}>
                  <Text style={styles.heroRole}>
                    {analysis.currentOrLatestRole ?? "Your resume"}
                  </Text>
                  <Text style={styles.heroMeta}>
                    {RESUME_SENIORITY_LABELS[analysis.seniorityLevel]}
                    {analysis.yearsExperienceEstimate != null
                      ? ` · ~${analysis.yearsExperienceEstimate} yrs experience`
                      : ""}
                  </Text>
                </View>

                <Text style={styles.sectionLabel}>Summary</Text>
                <Text style={styles.summaryText}>{analysis.professionalSummary}</Text>

                {analysis.skills.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>Skills on your resume</Text>
                    <View style={styles.chipWrap}>
                      {analysis.skills.map((skill) => (
                        <View key={`${skill.name}-${skill.category}`} style={styles.chip}>
                          <Text style={styles.chipText}>{skill.name}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {analysis.strengths.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>Strengths</Text>
                    <View style={styles.bulletList}>
                      {analysis.strengths.map((strength) => (
                        <View key={strength} style={styles.bulletRow}>
                          <Ionicons name="ellipse" size={7} color={colors.accent} />
                          <Text style={styles.bulletText}>{strength}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            <Text style={styles.sectionLabel}>Compare with a saved job</Text>
            {jobsError && <Text style={styles.stateText}>{jobsError}</Text>}
            {savedJobs.length === 0 && !jobsError && (
              <Text style={styles.stateText}>
                No saved job descriptions yet. Add one from the Job-Specific Interview flow and
                compare it against your resume here.
              </Text>
            )}
            <View style={styles.jobList}>
              {savedJobs.map((job) => {
                const score = matchScores[job.id];
                return (
                  <PressableScale
                    key={job.id}
                    onPress={() => {
                      if (!resume || resume.processing_status !== "completed") {
                        setError(
                          resume
                            ? "Analyze your resume before comparing it to a job."
                            : "Upload a resume before comparing it to a job.",
                        );
                        return;
                      }
                      router.push({
                        pathname: "/resume/match",
                        params: { resumeId: resume.id, jobId: job.id },
                      } as Href);
                    }}
                    accessibilityLabel={`Compare resume with ${job.title ?? "saved job"}`}
                    style={styles.jobRow}
                  >
                    <View style={styles.jobInfo}>
                      <Text style={styles.jobTitle} numberOfLines={1}>
                        {job.title ?? "Saved job description"}
                      </Text>
                      {job.companyName && (
                        <Text style={styles.jobMeta} numberOfLines={1}>
                          {job.companyName}
                        </Text>
                      )}
                    </View>
                    {score != null ? (
                      <View
                        style={[
                          styles.scoreBadge,
                          score >= 75
                            ? styles.scoreStrong
                            : score >= 50
                              ? styles.scorePartial
                              : styles.scoreWeak,
                        ]}
                      >
                        <Text style={styles.scoreText}>{score}%</Text>
                      </View>
                    ) : (
                      <View style={styles.scorePlaceholder}>
                        <Text style={styles.scorePlaceholderText}>Compare</Text>
                      </View>
                    )}
                  </PressableScale>
                );
              })}
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case "uploaded":
      return "Uploaded";
    case "extracting":
      return "Extracting text";
    case "analyzing":
      return "Analyzing";
    case "completed":
      return "Analyzed";
    case "extract_failed":
      return "Couldn't read this PDF";
    case "failed":
      return "Analysis failed";
    default:
      return "Pending";
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
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
    lineHeight: 22,
    color: colors.secondary,
    marginTop: 5,
    marginBottom: 4,
  },
  stateText: {
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.secondary,
  },
  stateCard: {
    marginTop: 26,
    gap: 16,
    marginBottom: 10,
  },
  emptyCard: {
    marginTop: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.ink,
    marginTop: 12,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20.5,
    color: colors.secondary,
    textAlign: "center",
    marginTop: 8,
  },
  emptyCta: {
    alignSelf: "stretch",
    marginTop: 22,
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
    marginTop: 18,
  },
  fileIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FBEEE9",
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
  },
  fileMeta: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.muted,
    marginTop: 3,
  },
  processingCard: {
    marginTop: 14,
    alignItems: "center",
    gap: 14,
    paddingVertical: 10,
  },
  processingText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.secondary,
    textAlign: "center",
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
  jobList: {
    gap: 10,
  },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  jobInfo: {
    flex: 1,
  },
  jobTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
  },
  jobMeta: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    marginTop: 2,
  },
  scoreBadge: {
    minWidth: 56,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  scoreStrong: {
    backgroundColor: "#E7F5EE",
  },
  scorePartial: {
    backgroundColor: "#FDF1DF",
  },
  scoreWeak: {
    backgroundColor: "#FBEEE9",
  },
  scoreText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.ink,
  },
  scorePlaceholder: {
    paddingHorizontal: 4,
  },
  scorePlaceholderText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.accentDark,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 13,
  },
  secondaryLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.accentDark,
  },
});
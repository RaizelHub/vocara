import { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { router, type Href } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LiveWaveform } from "@/components/interview/LiveWaveform";
import { AppHeader } from "@/components/ui/AppHeader";
import { PressableScale } from "@/components/ui/PressableScale";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { colors } from "@/theme/colors";
import {
  getResumeErrorMessage,
  resumeService,
  discardPickedResumeCopy,
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
    let pickedCopy: string | null = null;
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      pickedCopy = asset.uri;
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
      discardPickedResumeCopy(pickedCopy);
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
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <AppHeader subtitle="Resume Intelligence" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Resume Intelligence</Text>
          <Text style={styles.subtitle}>
            Upload your resume once and every practice interview becomes tailored to your experience.
          </Text>
        </View>

        {loading && (
          <View style={styles.loadingBox}>
            <Text style={styles.stateText}>Loading your resume profile…</Text>
          </View>
        )}

        {!loading && error && (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton label="Try again" onPress={() => void load()} />
          </View>
        )}

        {!loading && !error && !resume && (
          <Animated.View entering={FadeInDown.duration(360)}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="document-text-outline" size={36} color={colors.accent} />
              </View>
              <Text style={styles.emptyTitle}>Upload your resume</Text>
              <Text style={styles.emptyText}>
                Vocara will extract your skills, roles, and strengths — tailoring every interview question and evaluation to your exact profile.
              </Text>

              <View style={styles.benefitsRow}>
                <View style={styles.benefitChip}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={styles.benefitText}>Role-specific prompts</Text>
                </View>
                <View style={styles.benefitChip}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={styles.benefitText}>Match scoring</Text>
                </View>
                <View style={styles.benefitChip}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={styles.benefitText}>Instant coaching</Text>
                </View>
              </View>

              <View style={styles.emptyCta}>
                <PrimaryButton
                  label={picking ? "Opening file picker…" : "Upload PDF Resume"}
                  icon="cloud-upload-outline"
                  onPress={() => void pickAndUpload()}
                  disabled={picking || processing}
                />
              </View>
            </View>
          </Animated.View>
        )}

        {!loading && !error && resume && (
          <Animated.View entering={FadeInDown.duration(360)}>
            <View style={styles.fileCard}>
              <View style={styles.fileIcon}>
                <Ionicons name="document-text" size={22} color={colors.accentDark} />
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
              <PressableScale
                onPress={() => void pickAndUpload()}
                disabled={picking || processing}
                accessibilityLabel="Replace resume"
                collapsed
                activeScale={0.92}
              >
                <View style={styles.replaceBtn}>
                  <Ionicons name="refresh-outline" size={16} color={colors.secondary} />
                </View>
              </PressableScale>
            </View>

            {processingActive && (
              <View style={styles.processingCard}>
                <LiveWaveform active barCount={22} height={36} intensity={0.6} />
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
                  activeScale={0.97}
                  style={styles.secondaryButton}
                >
                  <Ionicons name="arrow-up-circle-outline" size={16} color={colors.accentDark} />
                  <Text style={styles.secondaryLabel}>Upload a different PDF</Text>
                </PressableScale>
              </View>
            )}

            {resume.processing_status === "completed" && analysis && (
              <>
                <View style={styles.heroCard}>
                  <Text style={styles.heroRole}>
                    {analysis.currentOrLatestRole ?? "Your Profile"}
                  </Text>
                  <View style={styles.heroBadgesRow}>
                    <View style={styles.seniorityBadge}>
                      <Text style={styles.seniorityText}>
                        {RESUME_SENIORITY_LABELS[analysis.seniorityLevel]}
                      </Text>
                    </View>
                    {analysis.yearsExperienceEstimate != null && (
                      <View style={styles.expBadge}>
                        <Text style={styles.expText}>
                          ~{analysis.yearsExperienceEstimate} yrs experience
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.sectionWrap}>
                  <Text style={styles.sectionLabel}>Executive Summary</Text>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryText}>{analysis.professionalSummary}</Text>
                  </View>
                </View>

                {analysis.skills.length > 0 && (
                  <View style={styles.sectionWrap}>
                    <Text style={styles.sectionLabel}>Skills Extracted</Text>
                    <View style={styles.chipWrap}>
                      {analysis.skills.map((skill) => (
                        <View key={`${skill.name}-${skill.category}`} style={styles.chip}>
                          <Text style={styles.chipText}>{skill.name}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {analysis.strengths.length > 0 && (
                  <View style={styles.sectionWrap}>
                    <Text style={styles.sectionLabel}>Core Strengths</Text>
                    <View style={styles.strengthList}>
                      {analysis.strengths.map((strength) => (
                        <View key={strength} style={styles.strengthRow}>
                          <View style={styles.strengthIconWrap}>
                            <Ionicons name="checkmark" size={13} color={colors.success} />
                          </View>
                          <Text style={styles.strengthText}>{strength}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </>
            )}

            <View style={styles.sectionWrap}>
              <Text style={styles.sectionLabel}>Compare with a Saved Job</Text>
              {jobsError && <Text style={styles.stateText}>{jobsError}</Text>}
              {savedJobs.length === 0 && !jobsError && (
                <View style={styles.noJobsCard}>
                  <Ionicons name="briefcase-outline" size={22} color={colors.muted} />
                  <Text style={styles.noJobsText}>
                    No saved jobs yet. Add a job description from the Practice tab to compare your resume against job requirements.
                  </Text>
                </View>
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
                      activeScale={0.98}
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
                          <Text style={styles.scoreText}>{score}% match</Text>
                        </View>
                      ) : (
                        <View style={styles.scorePlaceholder}>
                          <Text style={styles.scorePlaceholderText}>Compare →</Text>
                        </View>
                      )}
                    </PressableScale>
                  );
                })}
              </View>
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
      return "Extracting text…";
    case "analyzing":
      return "Analyzing skills…";
    case "completed":
      return "Ready & Analyzed";
    case "extract_failed":
      return "Couldn't read PDF";
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
    paddingBottom: 48,
  },
  titleBlock: {
    marginTop: 14,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.7,
    color: colors.ink,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.secondary,
    marginTop: 4,
  },
  loadingBox: {
    paddingVertical: 32,
    alignItems: "center",
  },
  stateText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.secondary,
  },
  stateCard: {
    marginTop: 20,
    gap: 14,
    marginBottom: 10,
  },
  emptyCard: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.04,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 4px 16px rgba(21, 21, 21, 0.04)",
      },
      default: {},
    }),
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: colors.ink,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.secondary,
    textAlign: "center",
    marginTop: 6,
    maxWidth: 300,
  },
  benefitsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 20,
  },
  benefitChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  benefitText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.ink,
  },
  emptyCta: {
    alignSelf: "stretch",
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 20,
    padding: 16,
    marginTop: 14,
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
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 15.5,
    fontWeight: "800",
    color: colors.ink,
  },
  fileMeta: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.accentDark,
    marginTop: 3,
  },
  replaceBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  processingCard: {
    marginTop: 16,
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  processingText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.secondary,
    textAlign: "center",
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 22,
    padding: 20,
    marginTop: 18,
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
  heroRole: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  heroBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  seniorityBadge: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
  },
  seniorityText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: colors.accentDark,
  },
  expBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  expText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.secondary,
  },
  sectionWrap: {
    marginTop: 26,
  },
  sectionLabel: {
    marginBottom: 12,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 18,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  summaryText: {
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.ink,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
  },
  strengthList: {
    gap: 10,
  },
  strengthRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  strengthIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.successLight,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  strengthText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  noJobsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 16,
  },
  noJobsText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.secondary,
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
    borderColor: colors.borderSubtle,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#151515",
        shadowOpacity: 0.03,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: "0 2px 8px rgba(21, 21, 21, 0.03)",
      },
      default: {},
    }),
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
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.secondary,
    marginTop: 2,
  },
  scoreBadge: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    alignItems: "center",
  },
  scoreStrong: {
    backgroundColor: colors.successLight,
  },
  scorePartial: {
    backgroundColor: colors.warningLight,
  },
  scoreWeak: {
    backgroundColor: colors.accentLight,
  },
  scoreText: {
    fontSize: 12.5,
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
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 24,
    height: 48,
  },
  secondaryLabel: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.accentDark,
  },
});
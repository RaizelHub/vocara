import type { Difficulty, InterviewerStyle } from "@/types/interview";

export type {
  ResumeAnalysisRecord,
  ResumeJobMatchRecord,
  ResumeRecord,
} from "@/types/database";

export const MAX_RESUME_FILE_BYTES = 5 * 1024 * 1024;
export const RESUME_ALLOWED_MIME_TYPES = ["application/pdf"] as const;
export type ResumeMimeType = (typeof RESUME_ALLOWED_MIME_TYPES)[number];

export const RESUME_PROCESSING_STATUSES = [
  "pending",
  "uploaded",
  "extracting",
  "extract_failed",
  "analyzing",
  "completed",
  "failed",
] as const;
export type ResumeProcessingStatus = (typeof RESUME_PROCESSING_STATUSES)[number];

export const MATCH_STATUSES = [
  "strong_match",
  "partial_match",
  "not_found",
  "transferable",
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  strong_match: "Strong match",
  partial_match: "Partial match",
  not_found: "Not found",
  transferable: "Transferable",
};

export type ResumeSeniority =
  | "intern"
  | "entry"
  | "junior"
  | "mid"
  | "senior"
  | "lead"
  | "manager"
  | "unknown";

export const RESUME_SENIORITY_LABELS: Record<ResumeSeniority, string> = {
  intern: "Intern",
  entry: "Entry level",
  junior: "Junior",
  mid: "Mid level",
  senior: "Senior",
  lead: "Lead",
  manager: "Manager",
  unknown: "Not specified",
};

export type ResumeSkill = {
  name: string;
  category: string;
  evidence: string;
};

export type ResumeWorkExperience = {
  role: string | null;
  company: string | null;
  startDate: string | null;
  endDate: string | null;
  summary: string | null;
  responsibilities: string[];
};

export type ResumeProject = {
  name: string;
  description: string | null;
  technologies: string[];
};

export type ResumeEducation = {
  degree: string | null;
  institution: string | null;
  year: string | null;
};

export type ResumeCertification = {
  name: string;
  issuer: string | null;
  year: string | null;
};

export type ResumeAnalysis = {
  professionalSummary: string;
  currentOrLatestRole: string | null;
  seniorityLevel: ResumeSeniority;
  yearsExperienceEstimate: number | null;
  skills: ResumeSkill[];
  technologies: string[];
  workExperience: ResumeWorkExperience[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  certifications: ResumeCertification[];
  strengths: string[];
};

export type RequirementMatch = {
  requirement: string;
  status: MatchStatus;
  evidence: string | null;
};

export type ResumeMatch = {
  overallMatchScore: number;
  skillMatchScore: number | null;
  experienceAlignmentScore: number | null;
  matchingSkills: { name: string; evidence: string }[];
  missingRequirements: RequirementMatch[];
  transferableStrengths: { strength: string; evidence: string | null }[];
  experienceAlignment: {
    requirement: string;
    match: MatchStatus;
    evidence: string | null;
  }[];
  interviewRisks: { risk: string; preparation: string }[];
  recommendedFocusAreas: string[];
  summary: string;
};

export type ProcessResumeResponse = {
  resumeId: string;
  analysisVersion: string;
  analysis: ResumeAnalysis;
};

export type CompareResumeJobResponse = {
  resumeId: string;
  jobDescriptionId: string;
  matchId: string | null;
  match: ResumeMatch;
};

export type PersonalizedInterviewSettings = {
  questionCount: number;
  difficultyMode: "match" | "easier" | "harder";
  interviewerStyle: InterviewerStyle;
};

export type GeneratedPersonalizedInterview = {
  session: {
    id: string;
    role: string;
    interviewType: string;
    difficulty: Difficulty;
    interviewerStyle: InterviewerStyle;
    totalQuestions: number;
    status: string;
    jobDescriptionId: string;
  };
  questions: {
    id: string;
    questionNumber: number;
    questionText: string;
    questionType: string;
    focusArea: string;
    difficulty: Difficulty;
    reason: string;
    expectedTopics: string[];
  }[];
};

export function getResumeMatchLabel(score: number): {
  label: string;
  colorKey: "strong" | "partial" | "weak";
} {
  if (score >= 75) return { label: "Strong fit", colorKey: "strong" };
  if (score >= 50) return { label: "Partial fit", colorKey: "partial" };
  return { label: "Needs work", colorKey: "weak" };
}

export const RESUME_SENIORITY_DIFFICULTY: Record<ResumeSeniority, Difficulty> = {
  intern: "beginner",
  entry: "beginner",
  junior: "beginner",
  mid: "intermediate",
  senior: "advanced",
  lead: "advanced",
  manager: "advanced",
  unknown: "intermediate",
};
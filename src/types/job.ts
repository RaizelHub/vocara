import type { Json } from "@/types/database";
import type { Difficulty, InterviewerStyle, InterviewType } from "@/types/interview";

export const MIN_JOB_CHARS = 100;
export const MAX_JOB_CHARS = 12_000;

export const MIN_QUESTION_COUNT = 5;
export const MAX_QUESTION_COUNT = 12;

export const QUESTION_COUNT_OPTIONS = [5, 6, 7, 8, 9, 10, 11, 12] as const;

export type DifficultyMode = "match" | "easier" | "harder";

export type JobSeniority =
  | "intern"
  | "entry"
  | "junior"
  | "mid"
  | "senior"
  | "lead"
  | "manager"
  | "unknown";

export type JobSkillImportance = "high" | "medium" | "low";

export type JobSkill = {
  name: string;
  importance: JobSkillImportance;
};

export type JobAnalysis = {
  detectedRole: string | null;
  companyName: string | null;
  seniorityLevel: JobSeniority | null;
  summary: string;
  technicalSkills: JobSkill[];
  softSkills: JobSkill[];
  responsibilities: string[];
  requiredExperience: string[];
  preferredExperience: string[];
  interviewFocusAreas: string[];
  keywords: string[];
};

export type JobDescription = {
  id: string;
  title: string | null;
  companyName: string | null;
  analysisStatus: "pending" | "processing" | "completed" | "failed";
  created_at: string;
};

export type JobAnalysisRecord = {
  id: string;
  job_description_id: string;
  detected_role: string | null;
  seniority_level: string | null;
  summary: string | null;
  technical_skills: Json | null;
  soft_skills: Json | null;
  responsibilities: Json | null;
  required_experience: Json | null;
  preferred_experience: Json | null;
  interview_focus_areas: Json | null;
  keywords: Json | null;
  created_at: string;
};

export type JobInterviewSettings = {
  questionCount: number;
  difficultyMode: DifficultyMode;
  interviewerStyle: InterviewerStyle;
  sessionDifficulty: Difficulty;
};

export type GeneratedInterviewQuestion = {
  id: string;
  questionNumber: number;
  questionText: string;
  questionType: string;
  focusArea: string;
  difficulty: Difficulty;
  reason: string;
  expectedTopics: string[];
};

export type GeneratedJobInterview = {
  session: {
    id: string;
    role: string;
    interviewType: InterviewType;
    difficulty: Difficulty;
    interviewerStyle: InterviewerStyle;
    totalQuestions: number;
    status: string;
    jobDescriptionId: string;
  };
  questions: GeneratedInterviewQuestion[];
};

export const SENIORITY_DIFFICULTY: Record<JobSeniority, Difficulty> = {
  intern: "beginner",
  entry: "beginner",
  junior: "beginner",
  mid: "intermediate",
  senior: "advanced",
  lead: "advanced",
  manager: "advanced",
  unknown: "intermediate",
};

export const DIFFICULTY_MODE_LABELS: Record<DifficultyMode, string> = {
  match: "Same as the role",
  easier: "A bit easier",
  harder: "A bit harder",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

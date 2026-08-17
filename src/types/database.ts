import type {
  SpeakingAttemptRecord,
  SpeakingSessionRecord,
} from "@/types/speaking";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type FocusArea =
  | "confidence"
  | "english_fluency"
  | "grammar"
  | "clearer_answers"
  | "interview_structure"
  | "technical_questions"
  | "pronunciation"
  | "speaking_naturally";

export type InterviewSessionStatus =
  | "created"
  | "in_progress"
  | "completed"
  | "abandoned";

export type AnswerTranscriptionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type Profile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  target_role: string | null;
  experience_level: string | null;
  interview_timeline: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type UserFocusArea = {
  id: string;
  user_id: string;
  focus_area: FocusArea;
  created_at: string;
};

export type UserPreference = {
  user_id: string;
  default_difficulty: string;
  default_interviewer_style: string;
  daily_goal_minutes: number;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type InterviewSessionRecord = {
  id: string;
  user_id: string;
  role: string;
  interview_type: string;
  difficulty: string;
  interviewer_style: string;
  status: InterviewSessionStatus;
  total_questions: number;
  overall_score: number | null;
  duration_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
  evaluation_version: string | null;
  evaluation_model: string | null;
  job_description_id: string | null;
  job_context: Json | null;
  created_at: string;
};

export type InterviewQuestionRecord = {
  id: string;
  session_id: string;
  question_number: number;
  question_text: string;
  question_type: string | null;
  focus_area: string | null;
  generation_reason: string | null;
  expected_topics: Json | null;
  difficulty: string | null;
  source: string;
  created_at: string;
};

export type JobDescriptionRecord = {
  id: string;
  user_id: string;
  title: string | null;
  company_name: string | null;
  raw_text: string;
  normalized_text: string | null;
  analysis_status: "pending" | "processing" | "completed" | "failed";
  analysis_model: string | null;
  analysis_version: string | null;
  analysis_error: string | null;
  analysis_attempt_count: number;
  created_at: string;
  updated_at: string;
};

export type JobAnalysisRecord = {
  id: string;
  job_description_id: string;
  user_id: string;
  detected_role: string | null;
  seniority_level: string;
  summary: string | null;
  technical_skills: Json | null;
  soft_skills: Json | null;
  responsibilities: Json | null;
  required_experience: Json | null;
  preferred_experience: Json | null;
  interview_focus_areas: Json | null;
  keywords: Json | null;
  analysis_model: string | null;
  analysis_version: string;
  created_at: string;
  updated_at: string;
};

export type ResumeRecord = {
  id: string;
  user_id: string;
  is_active: boolean;
  deleted_at: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  extracted_text: string | null;
  processing_status: string;
  processing_error: string | null;
  analysis_model: string | null;
  analysis_version: string | null;
  created_at: string;
  updated_at: string;
};

export type ResumeAnalysisRecord = {
  id: string;
  resume_id: string;
  user_id: string;
  professional_summary: string | null;
  current_or_latest_role: string | null;
  seniority_level: string | null;
  years_experience_estimate: number | null;
  skills: Json | null;
  technologies: Json | null;
  work_experience: Json | null;
  projects: Json | null;
  education: Json | null;
  certifications: Json | null;
  strengths: Json | null;
  analysis_model: string | null;
  analysis_version: string;
  created_at: string;
  updated_at: string;
};

export type ResumeJobMatchRecord = {
  id: string;
  user_id: string;
  resume_id: string;
  job_description_id: string;
  overall_match_score: number;
  skill_match_score: number | null;
  experience_alignment_score: number | null;
  matching_skills: Json | null;
  missing_requirements: Json | null;
  transferable_strengths: Json | null;
  experience_alignment: Json | null;
  interview_risks: Json | null;
  recommended_focus_areas: Json | null;
  summary: string | null;
  analysis_model: string | null;
  analysis_version: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type InterviewAnswerRecord = {
  id: string;
  session_id: string;
  question_id: string;
  user_id: string;
  transcript: string | null;
  audio_path: string | null;
  duration_seconds: number | null;
  word_count: number | null;
  speaking_pace: number | null;
  score: number | null;
  transcription_status: AnswerTranscriptionStatus;
  transcription_error: string | null;
  transcription_retryable: boolean;
  transcription_attempt_count: number;
  transcription_attempt_id: string | null;
  transcription_started_at: string | null;
  transcription_completed_at: string | null;
  transcription_model: string | null;
  transcription_provider_request_id: string | null;
  audio_mime_type: string | null;
  audio_size_bytes: number | null;
  audio_sha256: string | null;
  audio_generation: number;
  audio_attached_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AnswerFeedbackRecord = {
  id: string;
  answer_id: string;
  overall_score: number | null;
  clarity_score: number | null;
  grammar_score: number | null;
  confidence_score: number | null;
  structure_score: number | null;
  relevance_score: number | null;
  vocabulary_score: number | null;
  feedback_summary: string | null;
  strengths: Json | null;
  improvements: Json | null;
  better_approach: string | null;
  improved_answer: string | null;
  filler_words: Json | null;
  evaluation_status: "pending" | "processing" | "completed" | "failed";
  evaluation_model: string | null;
  evaluation_version: string;
  evaluation_retryable: boolean;
  evaluation_error: string | null;
  evaluation_attempt_count: number;
  evaluation_attempt_id: string | null;
  evaluation_started_at: string | null;
  evaluated_at: string | null;
  provider_request_id: string | null;
  source_audio_generation: number;
  source_transcript_sha256: string | null;
  ai_input_tokens: number | null;
  ai_output_tokens: number | null;
  created_at: string;
  updated_at: string;
};

export type InterviewSessionFeedbackRecord = {
  id: string;
  session_id: string;
  user_id: string;
  overall_score: number | null;
  clarity_score: number | null;
  grammar_score: number | null;
  confidence_score: number | null;
  structure_score: number | null;
  relevance_score: number | null;
  vocabulary_score: number | null;
  summary: string | null;
  performance_label: string | null;
  strengths: Json | null;
  focus_areas: Json | null;
  recommended_practice_type: string | null;
  recommended_practice_reason: string | null;
  strongest_answer_id: string | null;
  focus_answer_id: string | null;
  evaluation_model: string | null;
  evaluation_version: string;
  evaluation_status: "pending" | "processing" | "completed" | "failed";
  evaluation_retryable: boolean;
  evaluation_error: string | null;
  evaluation_attempt_count: number;
  evaluation_attempt_id: string | null;
  evaluation_started_at: string | null;
  evaluated_at: string | null;
  provider_request_id: string | null;
  source_fingerprint: string | null;
  ai_input_tokens: number | null;
  ai_output_tokens: number | null;
  created_at: string;
  updated_at: string;
};

export type UserSubscription = {
  id: string;
  user_id: string;
  plan: "free" | "pro";
  rc_app_user_id: string | null;
  rc_original_app_user_id: string | null;
  rc_entitlement_id: string | null;
  rc_entitlement_source: string | null;
  rc_entitlement_created_at: string | null;
  rc_entitlement_expires_at: string | null;
  rc_management_url: string | null;
  rc_last_event: string | null;
  synced_at: string;
  updated_at: string;
};

export type FeatureUsageSummary = {
  feature: string;
  plan: "free" | "pro";
  allowed: boolean;
  period: "day" | "month" | null;
  limit_value: number | null;
  used: number | null;
  period_start: string | null;
  period_end: string | null;
};

type ProfileInsert = Omit<Profile, "created_at" | "updated_at"> & {
  created_at?: string;
  updated_at?: string;
};

type ProfileUpdate = Partial<Omit<Profile, "id" | "created_at">>;

type UserFocusAreaInsert = Omit<UserFocusArea, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

type UserPreferenceInsert = Omit<UserPreference, "created_at" | "updated_at"> & {
  created_at?: string;
  updated_at?: string;
};

type UserPreferenceUpdate = Partial<Omit<UserPreference, "user_id" | "created_at">>;

type InterviewSessionInsert = Pick<
  InterviewSessionRecord,
  | "user_id"
  | "role"
  | "interview_type"
  | "difficulty"
  | "interviewer_style"
  | "status"
  | "total_questions"
> &
  Partial<
    Pick<
      InterviewSessionRecord,
      | "overall_score"
      | "duration_seconds"
      | "started_at"
      | "completed_at"
      | "job_description_id"
    >
  > & {
  id?: string;
  created_at?: string;
};

type InterviewQuestionInsert = Omit<
  InterviewQuestionRecord,
  "id" | "created_at" | "focus_area" | "generation_reason" | "expected_topics" | "difficulty" | "source"
> &
  Partial<
    Pick<
      InterviewQuestionRecord,
      "focus_area" | "generation_reason" | "expected_topics" | "difficulty" | "source"
    >
  > & {
  id?: string;
  created_at?: string;
};

type InterviewAnswerInsert = Pick<
  InterviewAnswerRecord,
  "session_id" | "question_id" | "user_id"
> &
  Partial<
    Omit<
      InterviewAnswerRecord,
      "id" | "session_id" | "question_id" | "user_id" | "created_at" | "updated_at"
    >
  > & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

type AnswerFeedbackInsert = Omit<AnswerFeedbackRecord, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

type InterviewSessionFeedbackInsert = Omit<
  InterviewSessionFeedbackRecord,
  "id" | "created_at"
> & {
  id?: string;
  created_at?: string;
};

type SpeakingSessionInsert = Omit<
  SpeakingSessionRecord,
  "id" | "status" | "evaluation_version" | "created_at" | "completed_at" | "updated_at"
> & {
  id?: string;
  status?: SpeakingSessionRecord["status"];
  evaluation_version?: string;
  created_at?: string;
  completed_at?: string;
  updated_at?: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      user_focus_areas: {
        Row: UserFocusArea;
        Insert: UserFocusAreaInsert;
        Update: Partial<Pick<UserFocusArea, "focus_area">>;
        Relationships: [];
      };
      user_preferences: {
        Row: UserPreference;
        Insert: UserPreferenceInsert;
        Update: UserPreferenceUpdate;
        Relationships: [];
      };
      interview_sessions: {
        Row: InterviewSessionRecord;
        Insert: InterviewSessionInsert;
        Update: Partial<Omit<InterviewSessionRecord, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      interview_questions: {
        Row: InterviewQuestionRecord;
        Insert: InterviewQuestionInsert;
        Update: Partial<Omit<InterviewQuestionRecord, "id" | "session_id" | "created_at">>;
        Relationships: [];
      };
      interview_answers: {
        Row: InterviewAnswerRecord;
        Insert: InterviewAnswerInsert;
        Update: Partial<
          Omit<
            InterviewAnswerRecord,
            "id" | "session_id" | "question_id" | "user_id" | "created_at"
          >
        >;
        Relationships: [];
      };
      answer_feedback: {
        Row: AnswerFeedbackRecord;
        Insert: AnswerFeedbackInsert;
        Update: Partial<Omit<AnswerFeedbackRecord, "id" | "answer_id" | "created_at">>;
        Relationships: [];
      };
      interview_session_feedback: {
        Row: InterviewSessionFeedbackRecord;
        Insert: InterviewSessionFeedbackInsert;
        Update: Partial<
          Omit<InterviewSessionFeedbackRecord, "id" | "session_id" | "user_id" | "created_at">
        >;
        Relationships: [];
      };
      job_descriptions: {
        Row: JobDescriptionRecord;
        Insert: Partial<JobDescriptionRecord>;
        Update: Partial<Omit<JobDescriptionRecord, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      job_analyses: {
        Row: JobAnalysisRecord;
        Insert: Partial<JobAnalysisRecord>;
        Update: Partial<Omit<JobAnalysisRecord, "id" | "job_description_id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      resumes: {
        Row: ResumeRecord;
        Insert: Partial<ResumeRecord>;
        Update: Partial<
          Pick<
            ResumeRecord,
            | "is_active"
            | "file_name"
            | "storage_path"
            | "mime_type"
            | "file_size_bytes"
            | "processing_status"
            | "processing_error"
            | "analysis_model"
            | "analysis_version"
          >
        >;
        Relationships: [];
      };
      resume_analyses: {
        Row: ResumeAnalysisRecord;
        Insert: Partial<ResumeAnalysisRecord>;
        Update: Partial<Omit<ResumeAnalysisRecord, "id" | "resume_id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      resume_job_matches: {
        Row: ResumeJobMatchRecord;
        Insert: Partial<ResumeJobMatchRecord>;
        Update: Partial<
          Omit<ResumeJobMatchRecord, "id" | "user_id" | "resume_id" | "job_description_id" | "created_at">
        >;
        Relationships: [];
      };
      speaking_sessions: {
        Row: SpeakingSessionRecord;
        Insert: SpeakingSessionInsert;
        Update: Partial<Omit<SpeakingSessionRecord, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      speaking_attempts: {
        Row: SpeakingAttemptRecord;
        Insert: Partial<SpeakingAttemptRecord>;
        Update: Partial<
          Omit<SpeakingAttemptRecord, "id" | "session_id" | "user_id" | "created_at">
        >;
        Relationships: [];
      };
      user_subscriptions: {
        Row: UserSubscription;
        Insert: Partial<UserSubscription>;
        Update: Partial<Omit<UserSubscription, "id" | "user_id">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      complete_career_setup: {
        Args: {
          p_target_role: string;
          p_experience_level: string;
          p_interview_timeline: string;
          p_focus_areas: FocusArea[];
        };
        Returns: Profile;
      };
      attach_answer_audio: {
        Args: {
          p_answer_id: string;
          p_audio_path: string;
          p_duration_seconds: number;
          p_audio_mime_type: string;
          p_audio_size_bytes: number;
        };
        Returns: InterviewAnswerRecord;
      };
      start_interview_session: {
        Args: { p_session_id: string };
        Returns: InterviewSessionRecord;
      };
      abandon_interview_session: {
        Args: { p_session_id: string };
        Returns: InterviewSessionRecord;
      };
      get_interview_result: {
        Args: { p_session_id: string };
        Returns: Json;
      };
      get_user_practice_metrics: {
        Args: Record<string, never>;
        Returns: Json;
      };
      reserve_speaking_attempt: {
        Args: { p_attempt_id: string; p_session_id: string; p_user_id: string };
        Returns: SpeakingAttemptRecord;
      };
      attach_speaking_audio: {
        Args: {
          p_attempt_id: string;
          p_audio_path: string;
          p_duration_seconds: number;
          p_audio_mime_type: string;
          p_audio_size_bytes: number;
        };
        Returns: SpeakingAttemptRecord;
      };
      close_speaking_session: {
        Args: { p_session_id: string; p_status: "completed" | "abandoned" };
        Returns: SpeakingSessionRecord;
      };
      get_speaking_session: {
        Args: { p_session_id: string };
        Returns: Json;
      };
      get_speaking_history: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_user_practice_summary: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_feature_usage_summary: {
        Args: Record<string, never>;
        Returns: FeatureUsageSummary[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

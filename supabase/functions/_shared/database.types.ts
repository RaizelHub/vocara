export type AnswerTranscriptionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type SpeakingSessionRow = {
  id: string;
  user_id: string;
  category: string;
  prompt_id: string;
  prompt_text: string;
  prompt_tip: string | null;
  difficulty: string;
  time_limit_seconds: number;
  evaluation_version: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
};

export type SpeakingAttemptRow = {
  id: string;
  session_id: string;
  user_id: string;
  attempt_number: number;
  audio_path: string | null;
  audio_mime_type: string | null;
  audio_size_bytes: number | null;
  audio_sha256: string | null;
  audio_generation: number;
  audio_attached_at: string | null;
  duration_seconds: number | null;
  transcription_status: AnswerTranscriptionStatus;
  transcript: string | null;
  word_count: number | null;
  speaking_pace: number | null;
  transcription_error: string | null;
  transcription_retryable: boolean;
  transcription_attempt_count: number;
  transcription_attempt_id: string | null;
  transcription_started_at: string | null;
  transcription_completed_at: string | null;
  transcription_model: string | null;
  transcription_provider_request_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SpeakingFeedbackRow = {
  id: string;
  attempt_id: string;
  user_id: string;
  attempt_number: number;
  clarity_score: number | null;
  fluency_score: number | null;
  grammar_score: number | null;
  vocabulary_score: number | null;
  structure_score: number | null;
  conciseness_score: number | null;
  overall_score: number | null;
  feedback_summary: string | null;
  strengths: unknown;
  improvements: unknown;
  grammar_corrections: unknown;
  natural_phrasing: unknown;
  better_version: string | null;
  filler_words: unknown;
  evaluation_status: AnswerTranscriptionStatus;
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

export type UserPracticeDayRow = {
  user_id: string;
  practice_date: string;
  practice_seconds: number;
  sources: string[];
  created_at: string;
  updated_at: string;
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type InterviewAnswerRow = {
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

export type InterviewSessionRow = {
  id: string;
  user_id: string;
  role: string;
  interview_type: string;
  difficulty: string;
  interviewer_style: string;
  status: string;
  total_questions: number;
  overall_score: number | null;
  duration_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  evaluation_version: string | null;
  evaluation_model: string | null;
  job_description_id: string | null;
  job_context: unknown;
};

export type InterviewQuestionRow = {
  id: string;
  session_id: string;
  question_number: number;
  question_text: string;
  question_type: string | null;
  focus_area: string | null;
  generation_reason: string | null;
  expected_topics: unknown;
  difficulty: string | null;
  source: string;
  created_at: string;
};

export type JobDescriptionRow = {
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

export type JobAnalysisRow = {
  id: string;
  job_description_id: string;
  user_id: string;
  detected_role: string | null;
  seniority_level: string;
  summary: string | null;
  technical_skills: unknown;
  soft_skills: unknown;
  responsibilities: unknown;
  required_experience: unknown;
  preferred_experience: unknown;
  interview_focus_areas: unknown;
  keywords: unknown;
  analysis_model: string | null;
  analysis_version: string;
  created_at: string;
  updated_at: string;
};

export type ResumeRow = {
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

export type ResumeAnalysisRow = {
  id: string;
  resume_id: string;
  user_id: string;
  professional_summary: string | null;
  current_or_latest_role: string | null;
  seniority_level: string;
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

export type ResumeJobMatchRow = {
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
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AnswerFeedbackRow = {
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
  strengths: unknown;
  improvements: unknown;
  better_approach: string | null;
  improved_answer: string | null;
  filler_words: unknown;
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

export type InterviewSessionFeedbackRow = {
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
  strengths: unknown;
  focus_areas: unknown;
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

export type ProfileRow = {
  id: string;
  target_role: string | null;
  experience_level: string | null;
};

export type UserFocusAreaRow = {
  id: string;
  user_id: string;
  focus_area: string;
  created_at: string;
  updated_at: string;
};

export type UserSubscriptionRow = {
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

export type PlanFeatureLimitRow = {
  plan: "free" | "pro";
  feature: string;
  allowed: boolean;
  period: "day" | "month" | null;
  limit_value: number | null;
};

export type FeatureUsageRow = {
  user_id: string;
  feature: string;
  period_start: string;
  period_end: string;
  usage_count: number;
};

export type FeatureUsageEventRow = {
  id: string;
  user_id: string;
  feature: string;
  event_key: string;
  plan: "free" | "pro";
  counted: boolean;
  created_at: string;
};

export type RevenueCatWebhookEventRow = {
  event_id: string;
  received_at: string;
  processed_at: string | null;
};

export type FeatureUsageSummaryRow = {
  feature: string;
  plan: "free" | "pro";
  allowed: boolean;
  period: "day" | "month" | null;
  limit_value: number | null;
  used: number | null;
  period_start: string | null;
  period_end: string | null;
};

type TableDefinition<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      interview_answers: TableDefinition<InterviewAnswerRow>;
      interview_sessions: TableDefinition<InterviewSessionRow>;
      interview_questions: TableDefinition<InterviewQuestionRow>;
      answer_feedback: TableDefinition<AnswerFeedbackRow>;
      interview_session_feedback: TableDefinition<InterviewSessionFeedbackRow>;
      speaking_sessions: TableDefinition<SpeakingSessionRow>;
      speaking_attempts: TableDefinition<SpeakingAttemptRow>;
      speaking_feedback: TableDefinition<SpeakingFeedbackRow>;
      user_practice_days: TableDefinition<UserPracticeDayRow>;
      profiles: TableDefinition<ProfileRow>;
      user_focus_areas: TableDefinition<UserFocusAreaRow>;
      job_descriptions: TableDefinition<JobDescriptionRow>;
      job_analyses: TableDefinition<JobAnalysisRow>;
      resumes: TableDefinition<ResumeRow>;
      resume_analyses: TableDefinition<ResumeAnalysisRow>;
      resume_job_matches: TableDefinition<ResumeJobMatchRow>;
      user_subscriptions: TableDefinition<UserSubscriptionRow>;
      plan_feature_limits: TableDefinition<PlanFeatureLimitRow>;
      feature_usage: TableDefinition<FeatureUsageRow>;
      feature_usage_events: TableDefinition<FeatureUsageEventRow>;
      revenuecat_webhook_events: TableDefinition<RevenueCatWebhookEventRow>;
    };
    Views: Record<string, never>;
    Functions: {
      claim_job_analysis: {
        Args: {
          p_job_description_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_analysis_version: string;
          p_model: string;
        };
        Returns: JobAnalysisRow | null;
      };
      complete_job_analysis: {
        Args: {
          p_job_description_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_analysis_version: string;
          p_model: string;
          p_detected_role: string | null;
          p_company_name: string | null;
          p_seniority_level: string;
          p_summary: string;
          p_technical_skills: unknown;
          p_soft_skills: unknown;
          p_responsibilities: unknown;
          p_required_experience: unknown;
          p_preferred_experience: unknown;
          p_interview_focus_areas: unknown;
          p_keywords: unknown;
        };
        Returns: JobAnalysisRow;
      };
      fail_job_analysis: {
        Args: {
          p_job_description_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_error_code: string;
          p_error_message: string;
          p_analysis_version: string;
        };
        Returns: null;
      };
      claim_job_interview_generation: {
        Args: {
          p_job_description_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_analysis_version: string;
          p_model: string;
        };
        Returns: unknown;
      };
      fail_job_interview_generation: {
        Args: {
          p_job_description_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_error_code: string;
        };
        Returns: null;
      };
      create_job_interview_session: {
        Args: {
          p_job_description_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_analysis_version: string;
          p_model: string;
          p_question_count: number;
          p_difficulty_mode: string;
          p_interviewer_style: string;
          p_session_difficulty: string;
          p_questions: unknown;
        };
        Returns: unknown;
      };
      claim_answer_transcription: {
        Args: { p_answer_id: string; p_user_id: string; p_attempt_id: string };
        Returns: InterviewAnswerRow;
      };
      complete_answer_transcription: {
        Args: {
          p_answer_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_transcript: string;
          p_duration_seconds: number;
          p_word_count: number;
          p_speaking_pace: number;
          p_audio_sha256: string;
          p_model: string;
          p_provider_request_id: string | null;
        };
        Returns: InterviewAnswerRow;
      };
      verify_answer_audio: {
        Args: {
          p_answer_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_audio_sha256: string;
          p_duration_seconds: number;
        };
        Returns: boolean;
      };
      fail_answer_transcription: {
        Args: {
          p_answer_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_error_code: string;
          p_error_message: string;
          p_retryable: boolean;
        };
        Returns: InterviewAnswerRow | null;
      };
      claim_answer_evaluation: {
        Args: {
          p_answer_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_evaluation_version: string;
          p_model: string;
        };
        Returns: AnswerFeedbackRow;
      };
      complete_answer_evaluation: {
        Args: {
          p_answer_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_evaluation_version: string;
          p_source_audio_generation: number;
          p_relevance_score: number;
          p_structure_score: number;
          p_clarity_score: number;
          p_grammar_score: number;
          p_vocabulary_score: number;
          p_confidence_score: number;
          p_feedback_summary: string;
          p_strengths: unknown;
          p_improvements: unknown;
          p_better_approach: string;
          p_improved_answer: string;
          p_filler_words: unknown;
          p_model: string;
          p_provider_request_id: string | null;
          p_ai_input_tokens: number | null;
          p_ai_output_tokens: number | null;
        };
        Returns: AnswerFeedbackRow;
      };
      fail_answer_evaluation: {
        Args: {
          p_answer_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_error_code: string;
          p_error_message: string;
          p_retryable: boolean;
        };
        Returns: AnswerFeedbackRow | null;
      };
      claim_interview_finalization: {
        Args: {
          p_session_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_evaluation_version: string;
          p_model: string;
        };
        Returns: InterviewSessionFeedbackRow;
      };
      complete_interview_finalization: {
        Args: {
          p_session_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_evaluation_version: string;
          p_summary: string;
          p_strengths: unknown;
          p_focus_areas: unknown;
          p_recommended_practice_type: string;
          p_recommended_practice_reason: string;
          p_model: string;
          p_provider_request_id: string | null;
          p_ai_input_tokens: number | null;
          p_ai_output_tokens: number | null;
        };
        Returns: InterviewSessionFeedbackRow;
      };
      fail_interview_finalization: {
        Args: {
          p_session_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_error_code: string;
          p_error_message: string;
          p_retryable: boolean;
        };
        Returns: InterviewSessionFeedbackRow | null;
      };
      claim_resume_analysis: {
        Args: {
          p_resume_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_analysis_version: string;
          p_model: string;
        };
        Returns: Json | null;
      };
      complete_resume_analysis: {
        Args: {
          p_resume_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_analysis_version: string;
          p_model: string;
          p_professional_summary: string;
          p_current_or_latest_role: string;
          p_seniority_level: string;
          p_years_experience_estimate: number;
          p_skills: Json;
          p_technologies: Json;
          p_work_experience: Json;
          p_projects: Json;
          p_education: Json;
          p_certifications: Json;
          p_strengths: Json;
        };
        Returns: Json;
      };
      fail_resume_analysis: {
        Args: {
          p_resume_id: string;
          p_user_id: string;
          p_attempt_id: string;
          p_error_code: string;
          p_error_message: string;
          p_analysis_version: string;
        };
        Returns: unknown;
      };
      claim_resume_job_match: {
        Args: {
          p_resume_id: string;
          p_job_description_id: string;
          p_user_id: string;
          p_analysis_version: string;
          p_model: string;
        };
        Returns: Json | null;
      };
      complete_resume_job_match: {
        Args: {
          p_resume_id: string;
          p_job_description_id: string;
          p_user_id: string;
          p_analysis_version: string;
          p_model: string;
          p_overall_match_score: number;
          p_skill_match_score: number | null;
          p_experience_alignment_score: number | null;
          p_matching_skills: Json;
          p_missing_requirements: Json;
          p_transferable_strengths: Json;
          p_experience_alignment: Json;
          p_interview_risks: Json;
          p_recommended_focus_areas: Json;
          p_summary: string;
        };
        Returns: string;
      };
      fail_resume_job_match: {
        Args: {
          p_resume_id: string;
          p_job_description_id: string;
          p_user_id: string;
          p_error_code: string;
          p_error_message: string;
        };
        Returns: unknown;
      };
      reserve_speaking_attempt: {
        Args: {
          p_attempt_id: string;
          p_session_id: string;
          p_user_id: string;
        };
        Returns: SpeakingAttemptRow;
      };
      attach_speaking_audio: {
        Args: {
          p_attempt_id: string;
          p_audio_path: string;
          p_duration_seconds: number;
          p_audio_mime_type: string;
          p_audio_size_bytes: number;
        };
        Returns: SpeakingAttemptRow;
      };
      close_speaking_session: {
        Args: { p_session_id: string; p_status: string };
        Returns: SpeakingSessionRow;
      };
      record_practice_day: {
        Args: {
          p_practice_date: string;
          p_practice_seconds: number;
          p_source: string;
        };
        Returns: UserPracticeDayRow;
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
      claim_speaking_transcription: {
        Args: {
          p_attempt_id: string;
          p_user_id: string;
          p_attempt_number: number;
          p_transcription_attempt_id: string;
        };
        Returns: SpeakingAttemptRow;
      };
      verify_speaking_audio: {
        Args: {
          p_attempt_id: string;
          p_user_id: string;
          p_transcription_attempt_id: string;
          p_audio_sha256: string;
          p_duration_seconds: number;
        };
        Returns: boolean;
      };
      complete_speaking_transcription: {
        Args: {
          p_attempt_id: string;
          p_user_id: string;
          p_transcription_attempt_id: string;
          p_transcript: string;
          p_duration_seconds: number;
          p_word_count: number;
          p_speaking_pace: number;
          p_audio_sha256: string;
          p_model: string;
          p_provider_request_id: string | null;
        };
        Returns: SpeakingAttemptRow;
      };
      fail_speaking_transcription: {
        Args: {
          p_attempt_id: string;
          p_user_id: string;
          p_transcription_attempt_id: string;
          p_error_code: string;
          p_error_message: string;
          p_retryable: boolean;
        };
        Returns: SpeakingAttemptRow | null;
      };
      claim_speaking_evaluation: {
        Args: {
          p_attempt_id: string;
          p_user_id: string;
          p_evaluation_attempt_id: string;
          p_evaluation_version: string;
          p_model: string;
        };
        Returns: SpeakingFeedbackRow;
      };
      complete_speaking_evaluation: {
        Args: {
          p_attempt_id: string;
          p_user_id: string;
          p_evaluation_attempt_id: string;
          p_evaluation_version: string;
          p_source_audio_generation: number;
          p_clarity_score: number;
          p_fluency_score: number;
          p_grammar_score: number;
          p_vocabulary_score: number;
          p_structure_score: number;
          p_conciseness_score: number;
          p_feedback_summary: string;
          p_strengths: unknown;
          p_improvements: unknown;
          p_grammar_corrections: unknown;
          p_natural_phrasing: unknown;
          p_better_version: string;
          p_filler_words: unknown;
          p_model: string;
          p_provider_request_id: string | null;
          p_ai_input_tokens: number | null;
          p_ai_output_tokens: number | null;
        };
        Returns: SpeakingFeedbackRow;
      };
      fail_speaking_evaluation: {
        Args: {
          p_attempt_id: string;
          p_user_id: string;
          p_evaluation_attempt_id: string;
          p_error_code: string;
          p_error_message: string;
          p_retryable: boolean;
        };
        Returns: SpeakingFeedbackRow | null;
      };
      check_feature_access: {
        Args: {
          p_user_id: string;
          p_feature: string;
          p_event_key: string;
        };
        Returns: Json;
      };
      sync_user_subscription: {
        Args: {
          p_user_id: string;
          p_plan: string;
          p_rc_app_user_id?: string | null;
          p_rc_original_app_user_id?: string | null;
          p_rc_entitlement_id?: string | null;
          p_rc_entitlement_source?: string | null;
          p_rc_entitlement_created_at?: string | null;
          p_rc_entitlement_expires_at?: string | null;
          p_rc_management_url?: string | null;
          p_rc_last_event?: string | null;
        };
        Returns: UserSubscriptionRow;
      };
      get_feature_usage_summary: {
        Args: Record<string, never>;
        Returns: FeatureUsageSummaryRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

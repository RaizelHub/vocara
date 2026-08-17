import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import type { FocusArea } from "@/types/database";

const LABEL_TO_FOCUS_AREA: Record<string, FocusArea> = {
  Confidence: "confidence",
  "English fluency": "english_fluency",
  Grammar: "grammar",
  "Clearer answers": "clearer_answers",
  "Interview structure": "interview_structure",
  "Technical questions": "technical_questions",
  Pronunciation: "pronunciation",
  "Speaking naturally": "speaking_naturally",
};

export const FOCUS_AREA_LABELS: Record<FocusArea, string> = {
  confidence: "Confidence",
  english_fluency: "English fluency",
  grammar: "Grammar",
  clearer_answers: "Clearer answers",
  interview_structure: "Interview structure",
  technical_questions: "Technical questions",
  pronunciation: "Pronunciation",
  speaking_naturally: "Speaking naturally",
};

export type CompleteCareerSetupInput = {
  targetRole: string;
  experienceLevel: string;
  interviewTimeline: string;
  goals: string[];
};

export const careerSetupService = {
  async complete(input: CompleteCareerSetupInput) {
    assertSupabaseConfigured();

    const focusAreas = input.goals.map((goal) => {
      const value = LABEL_TO_FOCUS_AREA[goal];
      if (!value) throw new Error(`Unsupported focus area: ${goal}`);
      return value;
    });

    const { data, error } = await supabase.rpc("complete_career_setup", {
      p_target_role: input.targetRole.trim(),
      p_experience_level: input.experienceLevel,
      p_interview_timeline: input.interviewTimeline,
      p_focus_areas: focusAreas,
    });

    if (error) throw error;
    return data;
  },
};

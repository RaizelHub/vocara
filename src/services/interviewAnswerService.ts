import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import type { InterviewAnswerRecord } from "@/types/database";

type ReserveAnswerInput = {
  sessionId: string;
  questionId: string;
  userId: string;
};

type AttachAudioInput = {
  answerId: string;
  audioPath: string;
  durationSeconds: number;
  mimeType: string;
  sizeBytes: number;
};

export const interviewAnswerService = {
  async reserve(input: ReserveAnswerInput): Promise<InterviewAnswerRecord> {
    assertSupabaseConfigured();

    const existing = await getByQuestionId(input.questionId);
    if (existing) return existing;

    const { data, error } = await supabase
      .from("interview_answers")
      .insert({
        session_id: input.sessionId,
        question_id: input.questionId,
        user_id: input.userId,
      })
      .select("*")
      .single();

    if (!error) return data;
    if (error.code !== "23505") throw error;

    const concurrentAnswer = await getByQuestionId(input.questionId);
    if (!concurrentAnswer) throw error;
    return concurrentAnswer;
  },

  async attachAudio(input: AttachAudioInput): Promise<InterviewAnswerRecord> {
    assertSupabaseConfigured();

    const { data, error } = await supabase.rpc("attach_answer_audio", {
      p_answer_id: input.answerId,
      p_audio_path: input.audioPath,
      p_duration_seconds: input.durationSeconds,
      p_audio_mime_type: input.mimeType,
      p_audio_size_bytes: input.sizeBytes,
    });

    if (error) throw error;
    return data;
  },
};

async function getByQuestionId(questionId: string) {
  const { data, error } = await supabase
    .from("interview_answers")
    .select("*")
    .eq("question_id", questionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

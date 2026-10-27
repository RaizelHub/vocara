import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import { interviewStartError } from "@/lib/interviewErrors";
import type { InterviewRecovery } from "@/lib/interviewRecovery";
import type { InterviewSession } from "@/types/interview";

export const interviewSessionService = {
  async ensureCreated(session: InterviewSession, _userId: string) {
    assertSupabaseConfigured();

    // The RPC performs creation and full-session allowance reservation in one
    // transaction. Generated job/resume sessions already have server questions.
    const { error } = session.type === "job_specific"
      ? await supabase.rpc("start_interview_session", { p_session_id: session.id })
      : await supabase.rpc("create_reserved_interview", {
          p_session_id: session.id,
          p_role: session.role,
          p_type: session.type,
          p_difficulty: session.difficulty,
          p_style: session.interviewerStyle,
          p_questions: session.questions.map((text, index) => ({ id: session.questionIds[index], text })),
        });
    if (error) throw interviewStartError(error);
  },

  async recover(sessionId?: string): Promise<InterviewRecovery | null> {
    assertSupabaseConfigured();
    const { data, error } = await supabase.rpc("get_interview_recovery", {
      ...(sessionId ? { p_session_id: sessionId } : {}),
    });
    if (error) throw error;
    return data as unknown as InterviewRecovery | null;
  },

  async resume(sessionId: string) {
    assertSupabaseConfigured();
    const { error } = await supabase.rpc("start_interview_session", { p_session_id: sessionId });
    if (error) throw interviewStartError(error);
  },

  async abandon(sessionId: string) {
    assertSupabaseConfigured();
    const { error } = await supabase.rpc("abandon_interview_session", {
      p_session_id: sessionId,
    });
    if (error) throw error;
  },

};

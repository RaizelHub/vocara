import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import type { InterviewSession } from "@/types/interview";

export const interviewSessionService = {
  async ensureCreated(session: InterviewSession, userId: string) {
    assertSupabaseConfigured();

    const existing = await supabase
      .from("interview_sessions")
      .select("id")
      .eq("id", session.id)
      .maybeSingle();

    if (existing.error) throw existing.error;

    if (!existing.data) {
      const { error } = await supabase.from("interview_sessions").insert({
        id: session.id,
        user_id: userId,
        role: session.role.trim(),
        interview_type: session.type,
        difficulty: session.difficulty,
        interviewer_style: session.interviewerStyle,
        status: "in_progress",
        total_questions: session.totalQuestions,
        started_at: new Date().toISOString(),
      });

      if (error && error.code !== "23505") throw error;
    }

    const questionResult = await supabase
      .from("interview_questions")
      .select("id,question_number,question_text")
      .eq("session_id", session.id);

    if (questionResult.error) throw questionResult.error;

    if (session.type === "job_specific") {
      const questionsById = new Map(
        (questionResult.data ?? []).map((question) => [question.id, question]),
      );
      const matchesGeneratedSession =
        questionResult.data?.length === session.questionIds.length &&
        session.questionIds.every((id, index) => {
          const question = questionsById.get(id);
          return (
            question?.question_number === index + 1 &&
            question.question_text === session.questions[index]
          );
        });
      if (!matchesGeneratedSession) {
        throw new Error("The generated questions no longer match this interview session.");
      }
    }

    const existingIds = new Set((questionResult.data ?? []).map((row) => row.id));
    const missingQuestions = session.type === "job_specific" ? [] : session.questions.flatMap((questionText, index) => {
      const id = session.questionIds[index];
      if (!id || existingIds.has(id)) return [];
      return [
        {
          id,
          session_id: session.id,
          question_number: index + 1,
          question_text: questionText,
          question_type: session.type,
        },
      ];
    });

    if (missingQuestions.length > 0) {
      const { error } = await supabase.from("interview_questions").insert(missingQuestions);
      if (error && error.code !== "23505") throw error;
    }

    const { error: startError } = await supabase.rpc("start_interview_session", {
      p_session_id: session.id,
    });
    if (startError) throw startError;
  },

  async abandon(sessionId: string) {
    assertSupabaseConfigured();
    const { error } = await supabase.rpc("abandon_interview_session", {
      p_session_id: sessionId,
    });
    if (error) throw error;
  },

};

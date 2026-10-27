import type { AnswerFeedbackRecord, InterviewAnswerRecord, InterviewQuestionRecord, InterviewSessionFeedbackRecord, InterviewSessionRecord } from "@/types/database";
import type { AnswerEvaluationResult } from "@/services/evaluationService";
import type { TranscriptionResult } from "@/services/transcriptionService";
import type { InterviewSession, SessionState } from "@/types/interview";

export type InterviewRecovery = {
  session: InterviewSessionRecord;
  questions: { question: InterviewQuestionRecord; answer: InterviewAnswerRecord | null; feedback: AnswerFeedbackRecord | null; retryExhausted?: boolean }[];
  finalization: InterviewSessionFeedbackRecord | null;
};

export type RecoveredRoom = {
  phase: SessionState;
  index: number;
  countdown: null;
  answer: InterviewAnswerRecord | null;
  audioPath: string | null;
  transcript: TranscriptionResult | null;
  evaluation: AnswerEvaluationResult | null;
  failure: { stage: "transcription" | "evaluation" | "finalization"; message: string; retryable: boolean; code?: string } | null;
};

export function recoverySession(data: InterviewRecovery): InterviewSession {
  const s = data.session;
  if (data.questions.length !== s.total_questions || !data.questions.length) throw new Error('Incomplete saved interview. Please retry loading.');
  if (!(['beginner', 'intermediate', 'advanced'] as string[]).includes(s.difficulty)
    || !(['supportive', 'balanced', 'challenging'] as string[]).includes(s.interviewer_style)) throw new Error('Invalid saved interview settings.');
  return {
    id: s.id, role: s.role, type: s.interview_type as InterviewSession['type'],
    difficulty: s.difficulty as InterviewSession['difficulty'], interviewerStyle: s.interviewer_style as InterviewSession['interviewerStyle'],
    length: s.total_questions <= 5 ? 'quick' : s.total_questions <= 8 ? 'standard' : 'deep',
    totalQuestions: s.total_questions,
    questions: data.questions.map(q => q.question.question_text),
    questionIds: data.questions.map(q => q.question.id),
  };
}

const LEASE_MS = 8 * 60 * 1000;
function pending(status: string | undefined, started: string | null | undefined, now: number) {
  return status === 'processing' && !!started && Date.parse(started) + LEASE_MS > now;
}

/** Never invokes AI. Active leases wait; expired/failed work requires explicit retry. */
export function planInterviewRecovery(data: InterviewRecovery, now = Date.now()):
  | { kind: 'completed' }
  | { kind: 'waiting'; message: string }
  | { kind: 'room'; state: RecoveredRoom } {
  if (data.session.status === 'completed') return { kind: 'completed' };
  if (data.session.status === 'abandoned') throw new Error('This interview was ended. Start a new interview.');
  recoverySession(data);
  const done = (q: InterviewRecovery['questions'][number]) => q.feedback?.evaluation_status === 'completed'
    && q.feedback.source_audio_generation === q.answer?.audio_generation
    && q.feedback.evaluation_version === data.session.evaluation_version
    && q.feedback.evaluation_model === data.session.evaluation_model;
  const incomplete = data.questions.findIndex(q => !done(q));
  const index = incomplete === -1 ? data.questions.length - 1 : incomplete;
  const { answer, feedback } = data.questions[index];
  const stage = incomplete === -1 ? 'finalization' : answer?.transcription_status === 'completed' ? 'evaluation' : 'transcription';
  const operation = stage === 'finalization' ? data.finalization : feedback;
  const waiting = stage === 'transcription'
    ? pending(answer?.transcription_status, answer?.transcription_started_at, now)
    : pending(operation?.evaluation_status, operation?.evaluation_started_at, now);
  if (waiting) return { kind: 'waiting', message: `Your answer is saved. ${stage === 'finalization' ? 'The interview summary' : stage === 'evaluation' ? 'Feedback' : 'The transcript'} is still processing. Checking saved progress without sending another AI request…` };
  const transcript = answer?.transcription_status === 'completed' && answer.transcript ? {
    answerId: answer.id, transcript: answer.transcript, durationSeconds: answer.duration_seconds ?? 0,
    wordCount: answer.word_count ?? 0, speakingPace: Number(answer.speaking_pace ?? 0),
  } : null;
  const evaluation: AnswerEvaluationResult | null = done(data.questions[index]) && feedback ? {
    answerId: answer!.id, overallScore: feedback.overall_score!,
    scores: { relevance: feedback.relevance_score!, structure: feedback.structure_score!, clarity: feedback.clarity_score!, grammar: feedback.grammar_score!, vocabulary: feedback.vocabulary_score!, confidence: feedback.confidence_score! },
    summary: feedback.feedback_summary ?? '', strengths: (feedback.strengths ?? []) as AnswerEvaluationResult['strengths'],
    improvements: (feedback.improvements ?? []) as AnswerEvaluationResult['improvements'],
    betterApproach: feedback.better_approach ?? '', improvedAnswer: feedback.improved_answer ?? '',
    fillerWords: (feedback.filler_words ?? []) as AnswerEvaluationResult['fillerWords'], feedbackStatus: feedback.evaluation_status,
  } : null;
  let state: RecoveredRoom = { index, phase: 'question', countdown: null, answer, audioPath: answer?.audio_path ?? null, transcript, evaluation, failure: null };
  if (incomplete === -1) {
    state = { ...state, phase: 'summary' };
    if (data.finalization?.evaluation_status === 'failed' || data.finalization?.evaluation_status === 'processing') {
      state = { ...state, phase: 'error', failure: { stage: 'finalization', retryable: data.finalization.evaluation_retryable, message: data.finalization.evaluation_retryable ? 'All answers are saved. The summary did not finish. Retry to complete this interview without using more allowance.' : 'All answers are saved, but the summary reached its processing limit. Contact support for help with this interview.' } };
    }
  } else if (answer?.audio_path) {
    const retryable = stage === 'transcription' ? answer.transcription_retryable : feedback?.evaluation_retryable ?? true;
    state = { ...state, phase: 'error', failure: { stage, retryable, message: `Your recording${transcript ? ' and transcript are' : ' is'} saved. ${stage === 'evaluation' ? 'Feedback' : 'Transcription'} ${operation?.evaluation_status === 'failed' || answer.transcription_status === 'failed' ? 'failed' : 'is pending'}. ${retryable ? 'Retry to continue without using more allowance.' : 'Record another answer to continue.'}` } };
  }
  if (incomplete !== -1 && data.questions[index].retryExhausted) {
    state = { ...state, phase: 'error', failure: { stage, retryable: false, code: 'answer_retry_exhausted', message: 'This answer reached its processing safety limit. Saved answers remain available. Contact support for help with this interview.' } };
  }
  return { kind: 'room', state };
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInterviewStarter, runInterviewInitialization } from './interviewStarter';
import { interviewStartError } from './interviewErrors';
import { clearCompletedInterviewSession, isInterviewUnrecoverable, planInterviewRecovery, recoverySession, type InterviewRecovery } from './interviewRecovery';
import { createRecoveryReference } from './interviewRecoveryReference';
import { getInterviewSession, resetInterviewSession, startInterviewSession } from '../state/session';
import { canRetryEvaluation } from '../services/evaluationService';
import { interviewSessionService } from '../services/interviewSessionService';

vi.mock('expo-crypto', () => ({ randomUUID: () => 'mock-uuid' }));

const { rpcMock, getSessionMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  getSessionMock: vi.fn().mockResolvedValue({
    data: { session: { user: { id: '22222222-2222-4222-8222-222222222222' } } },
    error: null,
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: rpcMock,
    auth: { getSession: getSessionMock },
  },
  assertSupabaseConfigured: vi.fn(),
}));

function saved(): InterviewRecovery {
  return {
    session: { id: 'session', status: 'in_progress', role: 'Developer', interview_type: 'standard', difficulty: 'intermediate', interviewer_style: 'balanced', total_questions: 2, evaluation_version: 'v1', evaluation_model: 'mock' },
    questions: [1, 2].map(n => ({ question: { id: `q${n}`, question_number: n, question_text: `Question ${n}` }, answer: null, feedback: null })),
    finalization: null,
  } as InterviewRecovery;
}
function completedAnswer(data: InterviewRecovery, index: number) {
  const row = data.questions[index];
  row.answer = { id: `a${index}`, audio_path: 'private/audio.m4a', audio_generation: 1, transcription_status: 'completed', transcript: 'A saved answer', duration_seconds: 20, word_count: 3, speaking_pace: 9 } as typeof row.answer;
  row.feedback = { evaluation_status: 'completed', evaluation_version: 'v1', evaluation_model: 'mock', source_audio_generation: 1, overall_score: 80 } as typeof row.feedback;
}

describe('interview initialization regression', () => {
  it('Quick Practice clears the previous error, shows loading, and navigates once after retry', async () => {
    const starter = createInterviewStarter(() => ({ id: 'quick' }), vi.fn()
      .mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(undefined));
    let error: unknown = null;
    const states: string[] = [];
    const ready = vi.fn();
    const callbacks = {
      loading: () => { error = null; states.push('loading'); },
      failed: (failure: unknown) => { error = failure; states.push('error'); },
      ready,
    };
    await runInterviewInitialization(starter, callbacks);
    expect(error).toBeInstanceOf(Error);
    // The original screen returned early here because its old error was still set.
    const retry = runInterviewInitialization(starter, callbacks);
    expect(error).toBeNull();
    await Promise.all([retry, runInterviewInitialization(starter, callbacks)]);
    expect(states).toEqual(['loading', 'error', 'loading']);
    expect(ready).toHaveBeenCalledExactlyOnceWith({ id: 'quick' });
  });
  it('retries a failed initialization with the same identity and navigates on success', async () => {
    const create = vi.fn(() => ({ id: 'stable-session-id' }));
    const persist = vi.fn().mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce(undefined);
    const navigate = vi.fn();
    const starter = createInterviewStarter(create, persist);
    await expect(starter.run()).rejects.toThrow('response lost');
    expect(starter.busy).toBe(false);
    expect(starter.completed).toBe(false);
    await starter.run().then(navigate);
    expect(navigate).toHaveBeenCalledWith({ id: 'stable-session-id' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0]).toBe(persist.mock.calls[1][0]);
    expect(starter.busy).toBe(false);
    expect(starter.completed).toBe(true);
    await starter.run();
    expect(persist).toHaveBeenCalledTimes(2);
  });
  it('coalesces simultaneous taps into one request', async () => {
    let finish!: () => void;
    const persist = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const starter = createInterviewStarter(() => ({ id: 'one' }), persist);
    const first = starter.run();
    expect(starter.run()).toBe(first);
    expect(starter.busy).toBe(true);
    await Promise.resolve();
    finish();
    await first;
    expect(persist).toHaveBeenCalledTimes(1);
  });
  it('explains insufficient allowance and expired authentication', () => {
    expect(interviewStartError({ message: 'VOCARA_FEATURE_LIMIT_REACHED' }).message).toContain('No allowance was used');
    expect(interviewStartError({ message: 'NOT_AUTHENTICATED' }).message).toContain('Sign in again');
  });
});

describe('server-authoritative recovery', () => {
  it('restores the first unfinished question and preserves prior feedback', () => {
    const data = saved(); completedAnswer(data, 0);
    const before = JSON.stringify(data);
    expect(planInterviewRecovery(data)).toMatchObject({ kind: 'room', state: { index: 1, phase: 'question' } });
    expect(recoverySession(data).questionIds).toEqual(['q1', 'q2']);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('restores uploaded audio awaiting transcription without invoking a provider', () => {
    const data = saved(); completedAnswer(data, 0);
    data.questions[0].feedback = null;
    Object.assign(data.questions[0].answer!, { transcription_status: 'pending', transcript: null, transcription_retryable: true });
    expect(planInterviewRecovery(data)).toMatchObject({ kind: 'room', state: { audioPath: 'private/audio.m4a', phase: 'error', failure: { stage: 'transcription', retryable: true } } });
  });
  it.each(['transcription', 'evaluation', 'finalization'])('waits on an active %s lease rather than resubmitting', stage => {
    const data = saved(); completedAnswer(data, 0);
    const started = new Date().toISOString();
    if (stage === 'transcription') {
      data.questions[0].feedback = null;
      Object.assign(data.questions[0].answer!, { transcription_status: 'processing', transcription_started_at: started });
    } else if (stage === 'evaluation') {
      Object.assign(data.questions[0].feedback!, { evaluation_status: 'processing', evaluation_started_at: started });
    } else {
      completedAnswer(data, 1);
      data.finalization = { evaluation_status: 'processing', evaluation_started_at: started } as InterviewRecovery['finalization'];
    }
    expect(planInterviewRecovery(data).kind).toBe('waiting');
    expect(planInterviewRecovery(data, Date.now() + 9 * 60_000).kind).toBe('room');
  });
  it('retains the transcript after failed evaluation', () => {
    const data = saved(); completedAnswer(data, 0);
    Object.assign(data.questions[0].feedback!, { evaluation_status: 'failed', evaluation_retryable: true });
    expect(planInterviewRecovery(data)).toMatchObject({ kind: 'room', state: { transcript: { transcript: 'A saved answer' }, failure: { stage: 'evaluation', retryable: true } } });
  });
  it('does not reuse feedback from a superseded recording', () => {
    const data = saved(); completedAnswer(data, 0);
    data.questions[0].answer!.audio_generation = 2;
    expect(planInterviewRecovery(data)).toMatchObject({ kind: 'room', state: { index: 0, evaluation: null } });
  });
  it('restores finalization without re-evaluating saved answers', () => {
    const data = saved(); completedAnswer(data, 0); completedAnswer(data, 1);
    expect(planInterviewRecovery(data)).toMatchObject({ kind: 'room', state: { index: 1, phase: 'summary', evaluation: { overallScore: 80 } } });
    data.session.status = 'completed';
    expect(planInterviewRecovery(data)).toEqual({ kind: 'completed' });
  });
  it('does not offer endless retries after the processing safety budget is spent', () => {
    const data = saved(); data.questions[0].retryExhausted = true;
    expect(planInterviewRecovery(data)).toMatchObject({ kind: 'room', state: { failure: { code: 'answer_retry_exhausted', retryable: false } } });
  });
  it('rejects incomplete saved sessions', () => {
    const data = saved(); data.questions.pop();
    expect(() => planInterviewRecovery(data)).toThrow('Incomplete saved interview');
  });
  it('restores transcript attributes from answer record when evaluation is pending or failed', () => {
    const data = saved();
    data.questions[0].answer = {
      id: 'a0',
      audio_path: 'private/audio.m4a',
      audio_generation: 1,
      transcription_status: 'completed',
      transcript: 'Detailed interview answer',
      duration_seconds: 45,
      word_count: 50,
      speaking_pace: 120,
    } as any;
    data.questions[0].feedback = {
      evaluation_status: 'failed',
      evaluation_retryable: true,
      source_audio_generation: 1,
      evaluation_version: 'v1',
      evaluation_model: 'mock',
    } as any;
    const plan = planInterviewRecovery(data);
    expect(plan.kind).toBe('room');
    if (plan.kind === 'room') {
      expect(plan.state.transcript).toEqual({
        answerId: 'a0',
        transcript: 'Detailed interview answer',
        durationSeconds: 45,
        wordCount: 50,
        speakingPace: 120,
      });
      expect(plan.state.failure?.stage).toBe('evaluation');
      expect(plan.state.failure?.retryable).toBe(true);
    }
  });
});

describe('session lifecycle isolation', () => {
  it('resets in-memory current session to prevent stale sessions in subsequent attempts', () => {
    resetInterviewSession();
    expect(getInterviewSession()).toBeNull();

    const session = startInterviewSession({
      role: 'Engineer',
      type: 'standard',
      difficulty: 'intermediate',
      interviewerStyle: 'balanced',
      length: 'quick',
      totalQuestions: 1,
      questions: ['Sample question'],
      questionIds: ['q1'],
    });
    expect(getInterviewSession()?.id).toBe(session.id);

    resetInterviewSession();
    expect(getInterviewSession()).toBeNull();
  });
});

describe('interview recovery and abandonment regression (10 scenarios)', () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  const sessionId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: userId } } },
      error: null,
    });
    rpcMock.mockResolvedValue({ data: null, error: null });
    resetInterviewSession();
  });

  it('1. Recoverable interview resumes normally', () => {
    const data = saved();
    expect(isInterviewUnrecoverable(data)).toBe(false);
    const plan = planInterviewRecovery(data);
    expect(plan.kind).toBe('room');
    if (plan.kind === 'room') {
      expect(plan.state.index).toBe(0);
      expect(plan.state.phase).toBe('question');
      expect(plan.state.failure).toBeNull();
    }
  });

  it('2. Retry-exhausted interview displays an appropriate error', () => {
    const data = saved();
    data.questions[0].retryExhausted = true;
    expect(isInterviewUnrecoverable(data)).toBe(true);

    const plan = planInterviewRecovery(data);
    expect(plan.kind).toBe('room');
    if (plan.kind === 'room') {
      expect(plan.state.phase).toBe('error');
      expect(plan.state.failure).toMatchObject({
        code: 'answer_retry_exhausted',
        retryable: false,
      });
      expect(plan.state.failure?.message).toContain('processing safety limit');
      expect(plan.state.failure?.message).toContain('Saved answers remain available');
    }

    const finalData = saved();
    completedAnswer(finalData, 0);
    completedAnswer(finalData, 1);
    finalData.finalization = {
      evaluation_status: 'failed',
      evaluation_retryable: false,
    } as any;
    expect(isInterviewUnrecoverable(finalData)).toBe(true);
    const finalPlan = planInterviewRecovery(finalData);
    expect(finalPlan.kind).toBe('room');
    if (finalPlan.kind === 'room') {
      expect(finalPlan.state.phase).toBe('error');
      expect(finalPlan.state.failure).toMatchObject({
        stage: 'finalization',
        code: 'finalization_retry_exhausted',
        retryable: false,
      });
    }
  });

  it('3 & 4. User confirms abandonment and backend session status updates correctly', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { id: sessionId, status: 'abandoned' },
      error: null,
    });

    await interviewSessionService.abandon(sessionId, userId);
    expect(rpcMock).toHaveBeenCalledWith('abandon_interview_session', {
      p_session_id: sessionId,
    });
  });

  it('5. Local recovery references are cleared after successful abandonment', async () => {
    const store = new Map<string, string>();
    const ref = createRecoveryReference({
      getItem: async k => store.get(k) ?? null,
      setItem: async (k, v) => { store.set(k, v); },
      removeItem: async k => { store.delete(k); },
    });

    await ref.save(userId, sessionId);
    expect(await ref.read(userId)).toBe(sessionId);

    rpcMock.mockResolvedValueOnce({ data: { id: sessionId, status: 'abandoned' }, error: null });
    await interviewSessionService.abandon(sessionId, userId);
    await ref.clear(userId);

    expect(await ref.read(userId)).toBeNull();
  });

  it('6. Home no longer prompts the abandoned interview', () => {
    const data = saved();
    data.session.status = 'abandoned';

    const isResumable = (d: InterviewRecovery | null) =>
      Boolean(d?.session && !['completed', 'abandoned'].includes(d.session.status));

    expect(isResumable(data)).toBe(false);
    expect(isInterviewUnrecoverable(data)).toBe(true);
    expect(() => planInterviewRecovery(data)).toThrow('This interview was ended. Start a new interview.');
  });

  it('7. A new interview starts with fresh state', () => {
    resetInterviewSession();
    expect(getInterviewSession()).toBeNull();

    const newSession = startInterviewSession({
      role: 'Frontend Engineer',
      type: 'standard',
      difficulty: 'intermediate',
      interviewerStyle: 'supportive',
      length: 'quick',
      totalQuestions: 1,
      questions: ['Tell me about React hooks.'],
      questionIds: ['q-new-1'],
    });

    expect(newSession.id).toBeDefined();
    expect(getInterviewSession()?.id).toBe(newSession.id);
    expect(getInterviewSession()?.role).toBe('Frontend Engineer');

    resetInterviewSession();
    expect(getInterviewSession()).toBeNull();
  });

  it('8. Failed abandonment does not falsely clear important data', async () => {
    const store = new Map<string, string>();
    const ref = createRecoveryReference({
      getItem: async k => store.get(k) ?? null,
      setItem: async (k, v) => { store.set(k, v); },
      removeItem: async k => { store.delete(k); },
    });

    await ref.save(userId, sessionId);
    startInterviewSession({
      role: 'Staff Engineer',
      type: 'standard',
      difficulty: 'advanced',
      interviewerStyle: 'challenging',
      length: 'quick',
      totalQuestions: 1,
      questions: ['System design question'],
      questionIds: ['q1'],
    });

    rpcMock.mockResolvedValueOnce({
      error: { message: 'Network connection lost' },
    });

    let failed = false;
    try {
      await interviewSessionService.abandon(sessionId, userId);
      await ref.clear(userId);
      resetInterviewSession();
    } catch {
      failed = true;
    }

    expect(failed).toBe(true);
    expect(await ref.read(userId)).toBe(sessionId);
    expect(getInterviewSession()).not.toBeNull();
    expect(getInterviewSession()?.role).toBe('Staff Engineer');
  });

  it('9. Unauthorized abandonment is rejected', async () => {
    getSessionMock.mockResolvedValueOnce({
      data: { session: { user: { id: 'attacker-uuid' } } },
      error: null,
    });

    await expect(
      interviewSessionService.abandon(sessionId, 'victim-uuid')
    ).rejects.toThrow('UNAUTHORIZED_ABANDONMENT');

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('10. Previously implemented evaluation retry behavior remains functional', () => {
    const data = saved();
    completedAnswer(data, 0);
    Object.assign(data.questions[0].feedback!, {
      evaluation_status: 'failed',
      evaluation_retryable: true,
    });

    const plan = planInterviewRecovery(data);
    expect(plan.kind).toBe('room');
    if (plan.kind === 'room') {
      expect(plan.state.failure?.stage).toBe('evaluation');
      expect(plan.state.failure?.retryable).toBe(true);
      expect(plan.state.transcript?.transcript).toBe('A saved answer');
    }

    expect(canRetryEvaluation(new Error('Transient gateway timeout'))).toBe(true);
    expect(isInterviewUnrecoverable(data)).toBe(false);
  });

  it('11. Completed interviews clear both stale in-memory session state and local recovery references', async () => {
    const store = new Map<string, string>();
    const ref = createRecoveryReference({
      getItem: async k => store.get(k) ?? null,
      setItem: async (k, v) => { store.set(k, v); },
      removeItem: async k => { store.delete(k); },
    });
    const otherUserId = '33333333-3333-4333-8333-333333333333';
    const otherSessionId = '44444444-4444-4444-8444-444444444444';

    const activeSession = startInterviewSession({
      id: sessionId,
      role: 'Backend Engineer',
      type: 'standard',
      difficulty: 'intermediate',
      interviewerStyle: 'balanced',
      length: 'quick',
      totalQuestions: 1,
      questions: ['Describe an outage you resolved.'],
      questionIds: ['q-1'],
    });
    await ref.save(userId, activeSession.id);
    await ref.save(otherUserId, otherSessionId);
    expect(getInterviewSession()?.id).toBe(sessionId);
    expect(await ref.read(userId)).toBe(sessionId);

    await clearCompletedInterviewSession(userId, {
      clearRecoveryReference: ownerId => ref.clear(ownerId),
      resetSession: resetInterviewSession,
    });

    expect(getInterviewSession()).toBeNull();
    expect(await ref.read(userId)).toBeNull();
    expect(await ref.read(otherUserId)).toBe(otherSessionId);
  });

  it('12. Completed interview cleanup tolerates local storage clear errors while still resetting memory', async () => {
    startInterviewSession({
      id: sessionId,
      role: 'Product Manager',
      type: 'behavioral',
      difficulty: 'beginner',
      interviewerStyle: 'supportive',
      length: 'quick',
      totalQuestions: 1,
      questions: ['Tell me about a product tradeoff.'],
      questionIds: ['q-2'],
    });

    await expect(
      clearCompletedInterviewSession(userId, {
        clearRecoveryReference: async () => {
          throw new Error('SecureStore unavailable');
        },
        resetSession: resetInterviewSession,
      }),
    ).resolves.toBeUndefined();

    expect(getInterviewSession()).toBeNull();
  });
});

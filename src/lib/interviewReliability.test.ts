import { describe, expect, it, vi } from 'vitest';
import { createInterviewStarter, runInterviewInitialization } from './interviewStarter';
import { interviewStartError } from './interviewErrors';
import { planInterviewRecovery, recoverySession, type InterviewRecovery } from './interviewRecovery';

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
});

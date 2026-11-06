import { beforeEach, expect, it, vi } from 'vitest';
import { interviewSessionService } from './interviewSessionService';
import type { InterviewSession } from '@/types/interview';
const { rpc, configured, getSession } = vi.hoisted(() => ({
  rpc: vi.fn(),
  configured: vi.fn(),
  getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user' } } }, error: null }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc, auth: { getSession } },
  assertSupabaseConfigured: configured,
}));
const session: InterviewSession = { id: 'stable', role: 'Developer', type: 'standard', difficulty: 'intermediate', interviewerStyle: 'balanced', length: 'quick', totalQuestions: 1, questions: ['Tell me about yourself'], questionIds: ['question'] };
beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ data: null, error: null }); });
it('creates questions and reserves quota in one server transaction', async () => {
  await interviewSessionService.ensureCreated(session, 'user');
  expect(rpc).toHaveBeenCalledExactlyOnceWith('create_reserved_interview', { p_session_id: 'stable', p_role: 'Developer', p_type: 'standard', p_difficulty: 'intermediate', p_style: 'balanced', p_questions: [{ id: 'question', text: 'Tell me about yourself' }] });
});
it('does not recreate a generated session when reserving its allowance', async () => {
  await interviewSessionService.ensureCreated({ ...session, type: 'job_specific' }, 'user');
  expect(rpc).toHaveBeenCalledExactlyOnceWith('start_interview_session', { p_session_id: 'stable' });
});
it('uses a read-only recovery RPC and preserves server errors', async () => {
  const data = { session: { id: 'stable' } };
  rpc.mockResolvedValueOnce({ data, error: null });
  expect(await interviewSessionService.recover('stable')).toBe(data);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('get_interview_recovery', { p_session_id: 'stable' });
  rpc.mockResolvedValueOnce({ error: { message: 'network failure' } });
  await expect(interviewSessionService.recover()).rejects.toEqual({ message: 'network failure' });
});
it('reports insufficient allowance without falling back to unreserved creation', async () => {
  rpc.mockResolvedValueOnce({ error: { message: 'VOCARA_FEATURE_LIMIT_REACHED' } });
  await expect(interviewSessionService.ensureCreated(session, 'user')).rejects.toThrow('Not enough answer allowance');
  expect(rpc).toHaveBeenCalledTimes(1);
});
it('restoring uses the original session ID', async () => {
  await interviewSessionService.resume('stable');
  expect(rpc).toHaveBeenCalledExactlyOnceWith('start_interview_session', { p_session_id: 'stable' });
});
it('abandons an interview session via authoritative RPC and preserves failures', async () => {
  await interviewSessionService.abandon('stable');
  expect(rpc).toHaveBeenCalledWith('abandon_interview_session', { p_session_id: 'stable' });

  rpc.mockResolvedValueOnce({ error: { message: 'abandonment failed' } });
  await expect(interviewSessionService.abandon('stable')).rejects.toEqual({ message: 'abandonment failed' });
});
it('rejects unauthorized abandonment when expected user does not match session owner', async () => {
  getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'attacker' } } }, error: null });
  await expect(interviewSessionService.abandon('stable', 'victim')).rejects.toThrow('UNAUTHORIZED_ABANDONMENT');
  expect(rpc).not.toHaveBeenCalled();
});

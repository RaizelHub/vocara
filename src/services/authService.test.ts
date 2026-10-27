import { beforeEach, expect, it, vi } from 'vitest';
import { authService } from './authService';

const { auth } = vi.hoisted(() => ({ auth: {
  signInWithPassword: vi.fn(), signUp: vi.fn(), signOut: vi.fn(),
  exchangeCodeForSession: vi.fn(), setSession: vi.fn(), verifyOtp: vi.fn(),
} }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth }, assertSupabaseConfigured: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); });

it('preserves existing sign-in normalization and authentication errors', async () => {
  const data = { session: { access_token: 'synthetic-test-token' }, user: { id: 'test-user' } };
  auth.signInWithPassword.mockResolvedValueOnce({ data, error: null });
  expect(await authService.signIn(' Test@Example.invalid ', 'synthetic-password')).toEqual(data);
  expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'test@example.invalid', password: 'synthetic-password' });
  auth.signInWithPassword.mockResolvedValueOnce({ data: null, error: new Error('Invalid credentials') });
  await expect(authService.signIn('test@example.invalid', 'incorrect')).rejects.toThrow('Invalid credentials');
});

it('preserves email confirmation and the app callback on signup', async () => {
  auth.signUp.mockResolvedValueOnce({ data: { session: null, user: { id: 'test-user' } }, error: null });
  expect(await authService.signUp({ fullName: ' Test User ', email: ' TEST@example.invalid ', password: 'synthetic' }))
    .toMatchObject({ requiresEmailConfirmation: true, email: 'test@example.invalid' });
  expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
    options: { data: { full_name: 'Test User' }, emailRedirectTo: 'vocara://auth/callback?flow=verification' },
  }));
});

it('coalesces duplicate recovery callbacks into one code exchange', async () => {
  auth.exchangeCodeForSession.mockResolvedValueOnce({ error: null });
  const url = 'vocara://auth/callback?flow=recovery&code=synthetic-code-one';
  const first = authService.consumeCallback(url);
  expect(authService.consumeCallback(url)).toBe(first);
  await expect(first).resolves.toBe('recovery');
  expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
});

it('allows authentication callback retry after a network failure', async () => {
  auth.exchangeCodeForSession.mockResolvedValueOnce({ error: new Error('Offline') }).mockResolvedValueOnce({ error: null });
  const url = 'vocara://auth/callback?code=synthetic-code-two';
  await expect(authService.consumeCallback(url)).rejects.toThrow('Offline');
  await expect(authService.consumeCallback(url)).resolves.toBe('verification');
  expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(2);
});

it('preserves local sign-out', async () => {
  auth.signOut.mockResolvedValueOnce({ error: null });
  await authService.signOut();
  expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
});

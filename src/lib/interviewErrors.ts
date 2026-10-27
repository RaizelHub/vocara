export class InterviewStartError extends Error {}

export function interviewStartError(error: unknown): InterviewStartError {
  const message = String((error as { message?: string })?.message ?? error);
  if (message.includes('VOCARA_FEATURE_LIMIT_REACHED')) {
    return new InterviewStartError('Not enough answer allowance for this interview. Choose a shorter interview or try again when your allowance resets. No allowance was used.');
  }
  if (message.includes('INTERVIEW_START_DAILY_LIMIT')) {
    return new InterviewStartError('You have reached today’s new-interview limit. You can still resume an interview you already started.');
  }
  if (message.includes('VOCARA_PRO_REQUIRED')) return new InterviewStartError('Your current plan does not include this interview.');
  if (/NOT_AUTHENTICATED|JWT|session expired/i.test(message)) return new InterviewStartError('Your session expired. Sign in again to continue.');
  if (message.includes('INTERVIEW_REQUEST_CONFLICT')) return new InterviewStartError('This interview was already created with different settings. Return home and resume it.');
  return new InterviewStartError('We couldn’t prepare your interview. Check your connection and retry. If it was saved, the same interview will be restored without using more allowance.');
}

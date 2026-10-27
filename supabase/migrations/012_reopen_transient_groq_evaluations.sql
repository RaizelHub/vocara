begin;

-- Groq structured-output 400/422 responses can be transient generation
-- failures. Older function versions incorrectly marked them non-retryable.
update public.answer_feedback
set evaluation_retryable = true
where evaluation_status = 'failed'
  and evaluation_retryable = false
  and evaluation_error like 'GROQ_INVALID_REQUEST:%'
  and evaluation_attempt_count < 3;

update public.speaking_feedback
set evaluation_retryable = true
where evaluation_status = 'failed'
  and evaluation_retryable = false
  and evaluation_error like 'GROQ_INVALID_REQUEST:%'
  and evaluation_attempt_count < 3;

update public.interview_session_feedback
set evaluation_retryable = true
where evaluation_status = 'failed'
  and evaluation_retryable = false
  and evaluation_error like 'GROQ_INVALID_REQUEST:%'
  and evaluation_attempt_count < 3;

commit;

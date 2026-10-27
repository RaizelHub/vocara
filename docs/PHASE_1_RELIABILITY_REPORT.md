# Phase 1 reliability report

All changes remain local and uncommitted. No deployment, hosted configuration
change, real-user data modification, payment implementation, or paid AI request
was performed. Pre-existing UI edits were preserved.

## 1. Confirmed root causes

- `.gitignore` excluded the entire Supabase backend and documentation. The local
  migrations, functions, shared code and backend tests were absent from tracked
  files, so a checkout could not reproduce this workspace's backend.
- Normal interviews defaulted to eight questions while free users had five daily
  AI-feedback units. Admission did not reserve the complete interview. Feedback
  allowance was charged per evaluation attempt, so failed attempts/retries could
  consume additional allowance. Rolling provider quotas could also interrupt an
  already-started interview.
- Quick Practice retry changed an attempt counter while the initialization effect
  returned early whenever the old error remained set.
- The room depended on a module-global session and started its reducer at question
  zero. Persisted answers/feedback existed, but there was no reconstruction path.
  Leaving explicitly abandoned the session. Late retry responses could continue
  chaining work after leaving the screen.

## 2. Files changed or added by this work

Backend and documentation:

- `.gitignore`
- `supabase/migrations/013_interview_reservations_and_recovery.sql`
- `supabase/functions/_shared/groq.ts`
- `supabase/functions/evaluate-answer/index.ts`
- `supabase/functions/finalize-interview/index.ts`
- `supabase/functions/transcribe-answer/index.ts`
- `supabase/functions/tests/evaluation_test.ts`
- `supabase/tests/database/interview_reliability.test.sql`
- `supabase/.env.example`
- `scripts/test_interview_concurrency.py`
- `docs/BACKEND_REPRODUCTION.md`
- `docs/PHASE_1_RELIABILITY_REPORT.md`
- `docs/ENVIRONMENT.md`, `docs/PRODUCTION_CHECKLIST.md` (project references replaced
  with placeholders before exposing these previously ignored documents)

Client:

- `src/app/(tabs)/home.tsx` (Resume action only, preserving existing UI work)
- `src/app/interview/quick.tsx`, `session.tsx`, `setup.tsx`, `job-preview.tsx`
- `src/app/resume/personalized.tsx`
- `src/components/interview/ResumeInterview.tsx`, `InterviewExitModal.tsx`
- `src/lib/interviewStarter.ts`, `interviewRecovery.ts`, `interviewErrors.ts`,
  `interviewReliability.test.ts`, `dataErrors.ts`
- `src/services/interviewSessionService.ts`, `interviewSessionService.test.ts`,
  `jobInterviewService.ts`, `resumeService.ts`, `authService.test.ts`
- `src/types/database.ts`

The remaining pre-existing Supabase source (migrations 001–012, twelve function
entrypoints, shared utilities, lockfile, tests and config) is now visible to Git
for the owner's review. It is **not committed or staged**. Temporary backend state,
snippets and secret environment files remain ignored. Credential-pattern checks
reported no matches in the backend/documentation files eligible for inclusion.

## 3. Fixes

- Full interview allowance is reserved atomically with creation using the existing
  shared allowance lock. Insufficient requests roll back entirely; duplicate IDs
  reuse the reservation and conflicting payloads are rejected. Direct client
  session/question insertion is revoked.
- Five-question default fits an unused free allowance. Server errors explain
  insufficient allowance; setup displays the current allowance when available.
- Reserved interviews use prepaid entitlement for transcription, evaluation and
  summary generation across day/plan changes. Migration 013 honors existing valid
  active interviews with a reservation, without charging again.
- Admission-level abuse bounds replace rolling quota stops during the interview;
  explicit processing retry limits remain. One interview evaluation claim makes
  one provider attempt, avoiding hidden retries after uncertain failures.
- Quick Practice uses the same initialization path for first attempt and retry,
  clears errors, updates loading, retains its session UUID and coalesces taps.
- Recovery reads owned server state, restores the first unfinished question,
  preserves completed feedback, waits on active leases and offers explicit retry
  for failed/expired operations. Home offers Resume Interview. Leaving pauses the
  session. Route IDs and lifecycle guards prevent dependence on the old singleton
  and prevent late callbacks from launching follow-on requests.
- Saved, pending, failed and terminally exhausted processing states have distinct
  messages. No sensitive interview content was added to persistent client storage.

## 4. Regression coverage added

- 19 client tests: initialization failure/success retry, loading/error transitions,
  duplicate taps, stable identities, allowance/auth messages, authoritative RPC
  selection, generated-session admission, first unfinished question, saved audio,
  transcript/feedback recovery, active and expired leases for all three operations,
  stale recording generations, completion and terminal retry limits.
- One Deno test: a mocked Groq timeout makes one attempt in interview mode.
- Five existing-authentication regression tests: login/error handling, signup
  confirmation, duplicate recovery callbacks, failed callback retry and local logout.
- 18 pgTAP assertions: exact free allowance, insufficient allowance rollback,
  idempotency/conflicts, restricted privileges, ownership/authentication, resume at
  zero remaining allowance, five completed answers and finalization using mocked
  provider results, interrupted transcription/evaluation retries and duplicate
  in-flight/cached claims.
- A real multi-connection local PostgreSQL harness: six-question partial rollback,
  simultaneous three-question admissions, simultaneous duplicate starts, lost
  response retry and shared speaking allowance.

## 5. Verification results

- Vitest: **40 passed**, including existing feature/pricing tests and new
  authentication coverage. These are automated unit/service tests, not device or
  hosted-auth tests.
- Deno: **41 passed**, with test network access denied and provider behavior mocked.
- TypeScript: passed.
- ESLint: full source run had zero errors; seven warnings introduced by the new
  code were fixed, and the affected-file follow-up passed without warnings.
- Changed-file whitespace check passed. The whole working tree still contains
  three pre-existing trailing blank lines in unrelated UI files; they were preserved.
- Python concurrency harness compiles, but could not execute: `psql` is absent.
- PostgreSQL migration/pgTAP/concurrency execution and a fresh local reset remain
  **unverified**: Docker's local Linux-engine pipe is unavailable. No remote DB was
  used as a substitute.
- Full Edge Function entrypoint type checking remains blocked by uncached Deno npm
  dependencies (`unpdf@1.8.0`; a no-lock check also lacked `@supabase/server`). Shared
  helper/test type checking passed. No dependency or lockfile changes were made.

## 6. Limitations

- Only uploaded/attached recordings survive process death. Unsent or currently
  recording audio must be recorded again. Existing recorder background handling
  remains in place; real device lifecycle testing is still needed.
- Reservations do not guarantee provider availability. Safety retry exhaustion is
  terminal and needs support. Already-saved answers remain available.
- A provider response lost before database persistence may require a second paid
  call after lease expiry and explicit retry; exactly-once external billing cannot
  be guaranteed by database leases alone.
- Home resumes the latest active interview; older active sessions remain stored
  and accessible by ID.
- No automatic allowance refunds on abandonment. Valid legacy active sessions are
  grandfathered when migration 013 is eventually applied; malformed legacy sessions
  require separate review.
- A truly reproducible fresh checkout is ready for owner validation, not yet proven
  by a local reset. Backend source must be included in the owner's eventual commit.

## 7. Next improvements

1. Run the local reset, pgTAP and concurrent-connection tests in
   `BACKEND_REPRODUCTION.md` before release, and add them to CI.
2. Run physical-device force-close, background, airplane-mode and login-expiry
   checks, including a complete five-question free interview.
3. Add operational reconciliation for uncertain provider outcomes and a deliberate
   support/refund policy for permanently failed reserved sessions.
4. Coordinate migration 013, the changed functions and the client release; older
   clients that insert sessions directly are incompatible with the new privileges.

## 8. Suggested commit message

`fix(interviews): reserve allowance atomically and restore interrupted sessions`

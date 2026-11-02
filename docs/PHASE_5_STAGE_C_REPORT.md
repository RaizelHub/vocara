# Phase 5 Stage C — browser voice interviews

Validation date: 2026-10-31. Local changes only; no commit, push, deployment,
remote migration, real user modification, payment change or paid AI request.

## A. Confirmed blockers and causes

- Native recording/upload APIs did not provide the browser capture path.
- Browser MediaRecorder containers cannot safely be renamed M4A: existing backend
  validation expects real AAC/M4A structures.
- Speaking uploads used four path segments while server authorization requires
  three, preventing otherwise valid native speaking uploads.
- Speaking retry could allocate another attempt after a lost reservation response;
  unfinished saved audio was not restored for explicit processing retry.
- Browser decoding can stall; an unbounded conversion promise leaves the UI waiting.

## B–D. Implementation and files

- `src/hooks/useAnswerRecorder.web.ts`: permission handling, bounded MediaRecorder
  capture, background stop, stream cleanup, cancellation generation and unload notice.
- `src/lib/browserAudio.ts`: decode the actual browser container, downmix/resample
  to mono 16 kHz PCM16 WAV, 120-second ceiling and 30-second conversion timeout.
  Blob URLs and audio live only in page memory and are explicitly released.
- `src/services/audioService.web.ts`: authenticated private WAV upload, timeout,
  cancellation and byte-hash verification of duplicate storage responses.
- `src/services/audioErrors.ts`, `src/services/audioService.ts`: shared controlled
  errors and corrected native speaking path. Native interview M4A remains unchanged.
- `src/services/speakingService.ts`, `src/app/speaking/session.tsx`: stable reservation
  IDs, saved-attempt lookup and explicit processing retry from persisted audio.
- `src/components/interview/MicrophonePermissionState.tsx`: browser permission guidance.
- `supabase/functions/_shared/wav.ts`, both `transcribe-answer/index.ts` and
  `transcribe-speaking/index.ts`: strict canonical WAV validation, duration from
  PCM sample count, extension/MIME agreement; existing M4A validation retained.
- `supabase/migrations/017_browser_speech_wav.sql`: private bucket/attachment WAV
  support, ownership-preserving storage checks and idempotent speaking reservations.
  Existing account-active guards, quota accounting and AI claims are retained.

The interview UI, recovery planner, authenticated backend services, AI evaluation,
quota controls and session/result routes remain shared. No parallel web database.

## E. Authentication

Reuses Stage B browser session storage and existing Supabase authentication/RLS.
Browser integration tests use a synthetic authenticated session with all backend
responses intercepted. Live web/Android sign-in and account switching remain manual
acceptance checks; this stage makes no claim of live cross-device verification.

## F. Audio and AI

Chrome produced WebM/Opus in the real synthetic-microphone test. Browser decoding
and rendering produced valid mono 16 kHz PCM WAV (1.8 seconds, 57,644 bytes).
The format preference list also includes Ogg/Opus and MP4, but those browser paths
have not been exercised here. Unsupported APIs/formats produce controlled errors.

All AI calls remain authenticated server operations. Tests mock provider responses.
Groq documents WAV support: https://console.groq.com/docs/speech-to-text

Server-attached audio survives refresh. Unuploaded audio is intentionally memory
only: a force-close loses that unsaved recording and requires recording it again.
Completed answers and server-attached recordings remain recoverable. Timeout stops
waiting for conversion; Web Audio has no cancellation API for an already-running decode.

## G. Tests and results

- Client: **67 tests passed**, including encoding bounds, memory cleanup, conversion
  timeout, authenticated WAV upload, cancellation and duplicate content verification.
- TypeScript: passed (`tsc --noEmit`).
- Both modified transcription Edge Functions: `deno check` passed.
- Backend suite from this Stage C work: **63 Deno tests passed**, network denied.
- Isolated PostgreSQL smoke from this Stage C work: **17 migrations and 116 pgTAP
  assertions passed**, including 12 browser-audio assertions. This is a single-
  connection harness, not proof of live Supabase concurrency behavior.
- `scripts/browser-audio-smoke.cjs`: passed real Chrome synthetic microphone,
  container decoding, WAV format, stopped tracks and released memory assertions.
- `scripts/web-voice-smoke.cjs`: passed exported interview UI capture, upload,
  mocked transcription/evaluation and completion navigation; one request per step.
  With `VOCARA_TEST_RECOVERY=1`, playback plus failed transcription → refresh →
  explicit retry also passed, without another upload or automatic AI request.
- New test files: `src/lib/browserAudio.test.ts`,
  `src/services/audioService.web.test.ts`, `supabase/functions/tests/wav_test.ts`,
  `supabase/tests/database/browser_audio.test.sql`; registered in `databaseSmoke.ts`.

The first unit attempt was blocked by Windows sandbox temporary-cache rename
permissions; the rerun passed. The first browser export smoke exposed stale Metro
configuration; a clean export with synthetic settings passed. A duplicate heading
selector in the smoke script was corrected. These were not hidden passing runs.

Configured Expo lint passed with no errors or warnings. A broader `eslint .`
reported 50 errors and six warnings across the separate example project, Deno
`npm:` import resolution and other files. That broad check remains failing;
the configured app scope and targeted browser-script checks passed.

To rerun browser tests, install/use Playwright with Chrome and set
`VOCARA_PLAYWRIGHT_MODULE` if it is not in normal module resolution. Export the app
to `dist/stage-c-web` with `EXPO_NO_DOTENV=1`,
`EXPO_PUBLIC_SUPABASE_URL=https://vocara-stage-a.invalid`, and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_synthetic_stage_a_only`.
Use `--clear` when changing export environment. The test scripts block nonfixture
external requests. Do not publish these synthetic-config artifacts.

## H–I. Builds and platform coverage

Production web export passed: 41 static routes, approximately 5.5 MB entry bundle.
Chrome exercised the exported interview route directly. Result navigation was
asserted; result-page content uses separate coverage and is not asserted here.

Android local export passed (Hermes bundle, approximately 8.5 MB). No physical
Android microphone/auth/RevenueCat test or iOS device test was performed in this
stage. A successful bundle alone does not establish device regression safety.

## J. Remaining acceptance and next work

Owner must review and deploy migration 017 and the two transcription functions
together before real web WAV uploads can work. Nothing was applied remotely.

Still required: Edge/Firefox/Safari and mobile browser audio acceptance, real
permission denial/revocation, device background/force-close behavior, speaking UI
recovery end-to-end, prolonged/offline upload tests and live database concurrency.
Existing privacy contact placeholders, dependency advisories and deletion-worker
deployment evidence remain release concerns documented in earlier reports.

Next planned implementation stage: **Stage D — responsive results/history and
accessible navigation**, while retaining this acceptance checklist. Stage E covers
hosting/security headers and release preparation. This is not a release-ready claim.

## K. Suggested commit message

`feat(web): add browser voice interviews and recoverable WAV uploads`

No Git mutation executed. Earlier Phase 4 and Stage A/B changes remain in the worktree.

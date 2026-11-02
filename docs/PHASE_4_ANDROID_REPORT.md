# Phase 4 Android beta report — 2026-10-30

## A. Executive summary

Local preparation is complete; **private beta distribution is BLOCKED pending the
release evidence below**. No APK was built, installed, signed, uploaded, or shared.
No Git staging/commit/push, cloud build, deployment, hosted DB change, real purchase,
live Groq request or user-data deletion occurred. Earlier Git authorization is
superseded by this phase's explicit local-only instructions.

Working tree was clean at entry. Source and tests, not previous report claims, were
checked. Preview now explicitly selects the preview EAS environment and a non-dev APK.
The old generated native manifest contained SYSTEM_ALERT_WINDOW; supported Expo
blocking configuration now emits its removal directive. No generated native folder
was overwritten. A recorder teardown rejection is now handled safely.

## B. Files modified / added

| File | Reason |
|---|---|
| app.json | Block unnecessary Android overlay permission through supported config |
| eas.json | Explicit preview environment/developmentClient=false; disable automatic Sentry uploads in preview only |
| package.json | Add preview EAS post-install environment guard and its test command |
| scripts/check-beta-env.cjs | Fail preview build on invalid/private backend key, missing/non-HTTPS/local URL, unreviewed public variables or production billing key; never print values |
| scripts/check-beta-env.test.cjs | Five synthetic regression tests for build-time credential/configuration boundaries |
| src/hooks/useAnswerRecorder.ts | Catch best-effort audio-mode reset failure during teardown instead of unhandled rejection |
| docs/ENVIRONMENT.md | Make current Test Store-only beta policy override historical production setup notes |
| docs/ANDROID_BETA_GUIDE.md | Manual build/signature/manifest/install/update/private distribution instructions and feedback questionnaire |
| docs/ANDROID_DEVICE_TEST_MATRIX.md | 22 reproducible scenarios with honest pending evidence |
| docs/PHASE_4_ANDROID_REPORT.md | Findings, checks, limits and release decisions |

## C. Android configuration

* Installed Expo 57.0.12 (SDK 57), React Native 0.86.2, React 19.2.3,
  TypeScript ~6.0.3; strict mode; Expo Router entry and typed routes.
* Vocara / com.vocara.app / 1.0.0 / versionCode 1 unchanged.
* Portrait, automatic theme, existing Vocara icon/adaptive icon and splash preserved.
  Image files exist; main icon and splash visually inspected. Launcher masking and
  monochrome/themed icon rendering require actual Android verification.
* Installed React Native and Expo Gradle defaults indicate minSdk 24 (Android 7.0).
  Dependency manifest merge and final APK minSdk remain authoritative and untested.
* Preview: internal APK, environment preview, developmentClient false. Development
  and production profiles preserved. Existing EAS project linkage present; remote
  project ownership and signing key availability NOT VERIFIED.
* Config introspection succeeded: INTERNET, MODIFY_AUDIO_SETTINGS, RECORD_AUDIO,
  VIBRATE; removal directives for SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE.
  Background audio is disabled in the plugin and recorder mode. Final dependency
  merged manifest still needs inspection; no final permission claim is made.
* Sentry's installed Gradle script supports SENTRY_DISABLE_AUTO_UPLOAD=true. This
  avoids automatic source uploads from preview; runtime monitoring behavior remains
  opt-in by existing DSN and has not been enabled or remotely changed.

## D. Interview functionality and previous-phase verification

Phase 1: migration 013 contains reservation/admission enforcement and restricted
client creation; SQL verified exact allowance, rejection rollback, repeated identity,
five prepaid answers and finalization at zero allowance. Client tests verify Quick
Practice's shared retry initialization, concurrent-tap coalescing, recovery question
selection and saved/pending/failed operation states. Home Resume action and room
server recovery implementation exist. Real simultaneous DB connections remain untested.

Phase 2: migration 014 and provider tests verify dispatch accounting, bounded claims,
capacity protection, cooldowns, malformed responses, deadline/body timeout and no
hidden paid retry. Unknown outcomes keep their lease. Reservation protects application
allowance, not provider uptime or provider spend limits.

Phase 3: migrations 015/016 and tests verify owner isolation, service-only ledgers,
pending-account restrictions, deletion claims/leases, processor-review prerequisite,
Auth cascade, orphan cleanup claim races and preservation of referenced files.
SecureStore auth persistence and telemetry redaction tests pass. Hosted deployment
and worker scheduling are NOT established by these local tests.

Recorder checks permission before each start; distinguishes denial/permanent denial,
offers Settings, serializes operations, stops on background, uses cache mono AAC/m4a
at 64 kbps with duration limit. Upload caps 5 MiB, uses authentication/45-second
timeout and verifies duplicate paths by content; completed upload reuse is tested.
No full recording is persisted insecurely for recovery. Completed attached server
answers survive restart; unuploaded recordings can be lost after process death.
Phone-call handling, permission dialogs and foreground restoration need devices.

No full offline mode exists or is promised. Authentication/retry/error states and
server-authoritative resume are present; offline UX is not certified by unit tests.
No measured startup/RAM/frame-rate evidence exists. Avoided speculative performance
refactors. Cache audio is bounded; actual peak memory requires profiling.

## E. Test results

| Check | Result / evidence |
|---|---|
| Vitest, threads pool | PASS: 51 tests / 9 files, authentication, retry, upload reuse, recovery, quota service, secure storage, privacy |
| Backend Deno, network denied | PASS: 61 tests; Groq mocked |
| Isolated PostgreSQL/PGlite | PASS: all 16 migrations; 104 pgTAP assertions (20 reliability, 30 AI, 45 privacy, 9 retention) |
| Beta environment guard | PASS: 5 new Node tests |
| Offline cost report | PASS: 3 Python tests |
| TypeScript | PASS: noEmit |
| Full existing lint | PASS; affected/new-file lint also passed after explicit Node Buffer import |
| Expo dependency local map | PASS against installed SDK's bundled map; offline result alone insufficient |
| Expo Doctor online | FAIL: 20/21 checks; 22 patch mismatches against current SDK57 recommendations (Expo ~57.0.31, RN 0.86.3) |
| npm audit | FAIL/review required: 26 advisories, 5 low / 9 moderate / 11 high / 1 critical; critical transitive shell-quote |
| Expo config introspection | PASS; overlay removal directive verified, not final APK merge |
| Android release JavaScript/Hermes export | PASS: 2,381 modules, one 8.5 MB bytecode bundle plus assets; no local .env loaded |
| Git diff whitespace | PASS |
| Real local Supabase HTTP tests | NOT TESTED: 3 skipped; local credentials/stack unavailable |
| Real parallel requests | NOT TESTED; PGlite uses one connection |
| Android devices | NOT TESTED: ADB daemon failed to connect |
| APK/signature/install | NOT TESTED: no cloud or native APK build executed |

Default Vitest fork workers initially failed sandbox temporary-file renames before
running tests; the supported threads pool passed all 51. SQL dependencies required
registry access, then isolated execution passed. These were environment failures,
not silently counted as successful test runs. The initial Android Hermes export
also hit sandbox temporary bytecode write denial; the authorized local rerun passed
and wrote `dist/beta-check` (ignored by Git). This export intentionally disabled
dotenv loading and therefore does not validate the eventual EAS preview credentials.
It is not an APK, native compilation, startup test or physical-device result.
No dependencies were upgraded merely to suppress patch warnings. Advisory review
must distinguish shipped runtime code from build tooling and resolve applicable risk.

## F. Security and privacy

Client environment references inspected: public Supabase config, Test Store SDK key,
optional Sentry DSN. Privileged Groq access remains authenticated Edge Functions.
No new private values were added or printed. The build guard rejects accidental
service-role/secret use in the public key slot and unexpected nonempty public fields.
It does not scan a final APK or prove a project is staging. Local .env is ignored;
do not upload private local configuration or include it via a custom build archive.

Sentry remains aggressively redacted, native monitoring disabled, no breadcrumbs,
transcripts/audio/user IDs. RevenueCat accepts only test_ keys and has no new override.
Its Test Store is distinct from Google Play sandbox billing; no purchases tested.
The test key must remain restricted to this private beta distribution.

Privacy/Terms screens and account-deletion entry exist, but operator/contact remain
placeholders. Pending deletion is not completion. Processor review, a running worker,
the configured worker secret and deployed functions are required. Retention cleanup
is disabled by default; referenced history remains. Review retention/processor and
backup notices before testers supply data. No claim of legal/store compliance.

## G. APK build instructions

Use ANDROID_BETA_GUIDE.md for prerequisites and exact commands. After blockers:
`npx eas-cli build --platform android --profile preview`.
Run manually, confirm existing project/signing credentials, inspect the resulting
APK, then `adb install -r .\Vocara-beta.apk` or use its real private install link.
No EAS cloud action or remote credential inspection was done by this task.

## H. Distribution instructions

Use 5–10 trusted testers, reviewed Expo internal-build access controls, a real
successful build link, existing signing identity and incremented update versionCode.
Complete the matrix first. The guide contains consent/privacy limits, install/update/
uninstall instructions and a non-sensitive feedback template. No public hosting or
invented download URL. Source: [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/)
and [RevenueCat Test Store](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store).

## I. Release blockers and evidence checklist

Critical sign-off gates: review/remediate applicable dependency vulnerabilities;
verify intended backend migration/function parity and deletion processing; replace
privacy contact/operator placeholders; build/inspect actual release APK and complete
a physical-device free interview plus recovery/permission tests. No remote access
was attempted to bypass the user's authorization rules.

Important: review current SDK patch alignment, real multi-connection concurrency,
low-memory profiling, recovery links/SMTP, final permission merge and signing key.
Optional: broader device coverage, hosted feedback form, future Play/web/iOS work.

| Release requirement | Status | Evidence/next gate |
|---|---|---|
| APK profile configured | PASS | app/eas config and introspection |
| Authentication validated on APK | NOT TESTED | unit coverage only; synthetic device login needed |
| Groq backend secure in beta environment | BLOCKED | source safeguards pass; hosted deployment unverified |
| Microphone/transcription/feedback working | NOT TESTED | real APK required |
| Interview completion/recovery | NOT TESTED | local regression coverage passes; device workflow pending |
| Quotas enforced | PASS locally | SQL admission/completion tests; hosted and parallel verification pending |
| No private keys bundled | NOT TESTED | source/build guard reviewed; final artifact absent |
| Relevant privacy disclosure | BLOCKED | draft available; contact and operations missing |
| RevenueCat test-only configuration | PASS | source key gate; no purchase-flow certification |
| No unintended APK permissions | NOT TESTED | config removal verified only |
| Automated application tests | PASS | 51 + 61 + 104 + 5 + 3 |
| Dependency/release checks | FAIL | Doctor patch drift and npm advisories |
| Physical-device testing complete | NOT TESTED | matrix prepared |
| Beta installation instructions | PASS | guide and questionnaire prepared |

## J. Suggested commit

`chore(android): prepare guarded private beta APK workflow`

All changes remain locally uncommitted for owner review.

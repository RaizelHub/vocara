# Phase 5 — Stage A: web compatibility

2026-10-30. Stage A only, as requested. Existing Phase 4 uncommitted changes were
preserved. No app rebuild, SDK upgrade, deployment, Git mutation, real account access,
paid AI call or billing action occurred.

## A. Initial compatibility audit

Installed Expo 57.0.12, React Native 0.86.2, React 19.2.3, react-dom 19.2.3,
react-native-web 0.21.2, TypeScript ~6.0.3, Expo Router 57.0.12. Strict TypeScript,
Metro/Sentry configuration, Router entry, web script and static output already exist.
@expo/metro-runtime 57.0.9 is installed and locked through Expo Router; no duplicate
direct dependency is needed to make the current build work.

| Category | Assessment |
|---|---|
| Shared unchanged | Supabase client, authenticated API services, reservation/recovery business rules, evaluation/results/history, design tokens, Auth/Subscription providers |
| Responsive work | Signed-in dashboard, tabs/sidebar, interview setup/workspace/results; existing auth form already constrains desktop width |
| Web-specific work | Email callback origin, browser recording/blob upload, permission UX, browser session limitations, hosting headers/fallbacks |
| Native-specific paths | SecureStore, native recording/files, purchase UI and Android signing/permissions; installed SDKs currently provide sufficient web import shims for public routes |
| Android regression risk | Shared recorder/upload contracts, MIME validation, callback selection, platform file resolution and responsive styles must be tested when changed |
| Manual validation | Real authentication, cross-device history/resume, microphones/codecs, browser variants, narrow widths, physical Android and billing sandbox |

Confirmed existing source includes migrations 013–016, quota reservations, recovery
and duplicate-request controls, privacy/deletion/retention gates, and Phase 4 preview
APK settings/build environment guard. These are not proof of hosted deployment.
Phase 4 dependency advisories and SDK patch drift remain open; not upgraded in Stage A.

## B. Changes implemented

* `scripts/web-smoke.cjs`: repeatable headless Chrome smoke check for login, signup,
  privacy and Terms, plus login-to-signup navigation. Accepts only a local HTTP test
  server and blocks all requests outside that origin. Closes browser in finally.
  Requires separately available Playwright and installed Chrome; no new app package.
* `docs/PHASE_5_STAGE_A_REPORT.md`: compatibility evidence, commands and staged work.

No application-source or dependency changes were necessary: the existing web export
and public browser routes work. Avoided refactoring merely to create a code diff.
Logs, screenshot, temporary harness and exports are under ignored `dist/`.

## C. Shared architecture

One Expo Router application remains. AuthProvider and SubscriptionProvider wrap the
shared route tree. Supabase services use the same owner-scoped tables/RPCs and Edge
Functions; no new backend, project, scoring logic, client quota authority or schema.
Local session state remains a module plus React state; persisted recovery uses server
records. Native cache recordings are not durable server answers.

## D. Platform-specific behavior

Existing browser branch uses sessionStorage; native uses SecureStore with legacy
migration. RevenueCat 10.7.0 imports load through its browser/preview implementation;
application configuration still accepts Test Store keys only. This is import/loading
evidence, not purchase compatibility. Do not enable web billing. Stage B/C should
isolate unsupported actions without changing backend entitlements.

Browser warnings observed: deprecated shadow styling and RevenueCat browser/preview
mode diagnostics. No uncaught page exception appeared on the checked public routes.
No styling rewrite was justified by these warnings. Desktop signup screenshot was
inspected at 1280x720; this is not full responsive/accessibility coverage.

## E. Authentication

Login/signup forms render and navigation works with synthetic backend configuration.
No login, registration, email, profile or password request was submitted. Browser
sessions survive reload within a tab but are not persistent native SecureStore sessions.
Storage may throw when browser policy blocks it; fallback behavior needs Stage B review.
Email confirmation/recovery currently hardcode `vocara://auth/callback`: confirmed
Stage B blocker. Use reviewed same-origin HTTPS callbacks on web and retain native
deep links; owner must manually configure the Supabase redirect allowlist.
Public routes currently sit behind the global bootstrap/configuration gate; an export
with missing config renders a configuration error rather than a functional login.

## F. Microphone and AI

Web voice interviews are NOT implemented by Stage A. `useAnswerRecorder.ts` explicitly
rejects web; audioService expects native `.m4a` File data and audio/mp4. Backend
`inspectM4a` validates MP4 structure, AAC sample tables and actual duration. Browser
WebM cannot simply be renamed. Stage C must reconcile genuine browser format/codec,
size/duration validation, private Storage MIME policy and provider acceptance.
Existing authenticated AI endpoints/claims/accounting stay authoritative. No Groq
request was sent. Web microphone/AI completion is NOT TESTED.

## G. Testing

* PASS: TypeScript noEmit and all 51 existing Vitest client tests (threads pool).
* PASS: development server starts with `expo start --web --localhost`.
* PASS: headless installed Chrome renders /login, /signup, /privacy, /terms with no
  uncaught page errors. External requests blocked; only synthetic public settings.
* Browser navigation assertion uses the actual `Create account` label, not an
  assumed `Sign up` label. Initial harness selector was corrected.
* PASS: full Expo lint; no errors or warnings emitted.
* PASS: repeatable login-to-signup client navigation assertion.
* NOT TESTED: real Supabase Auth, authenticated dashboard, cross-device records,
  recording, signed media, billing, Android hardware, Edge/Firefox/Safari/mobile Chrome.
* Sandbox browser access was initially denied/timed out; local server/browser were
  rerun with approved access outside that isolation. Not counted as application bugs.

## H. Web build and reproduction

Production static export PASS: 2,018 web modules, one approximately 5.5 MB JS bundle,
HTML routes and assets in `dist/web-stage-a`. No local dotenv credentials loaded.
This is a substantial initial bundle; defer measured splitting/native-import review
to later stages. No hosting/output rewrite needed for Stage A. Protected records must
remain protected by backend RLS, not by assuming generated HTML is secret.

Manual local smoke setup (PowerShell, fictional settings; no real account):

```powershell
$env:EXPO_NO_DOTENV='1'
$env:EXPO_PUBLIC_SUPABASE_URL='https://vocara-stage-a.invalid'
$env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_synthetic_stage_a_only'
npx expo start --web --localhost --port 8092
```

In another terminal with Playwright available (or set VOCARA_PLAYWRIGHT_MODULE to
its installed module path):

```powershell
node scripts/web-smoke.cjs
npx tsc --noEmit
npx vitest run --pool=threads
npm run lint
```

Credential-free export in a separate terminal:

```powershell
$env:EXPO_NO_DOTENV='1'
npx expo export --platform web --output-dir dist/web-stage-a
```

Before a real hosting build, deliberately supply reviewed public settings; never use
the synthetic fixture in a published app. Stage E will select host/fallbacks/HTTPS/
security headers and validate production refresh/callback behavior. Nothing published.
References: [Expo static rendering](https://docs.expo.dev/router/web/static-rendering/)
and [protected routes](https://docs.expo.dev/router/advanced/protected/). Current online
docs also discuss SDK58; this audit uses the installed SDK57 behavior.

## I. Android regression status

No Android or shared app runtime code changed in Stage A. Shared TypeScript/tests
pass. Phase 4 Android Hermes export passed previously; NOT rerun or treated as a
physical-device check here. Native authentication/microphone/AI/history/navigation/
RevenueCat remain device-test pending. No APK created.

## J. Remaining work

Next is **Stage B — Authentication and Shared Screens**: platform-aware callbacks,
browser persistence/error paths, shared user-specific history and responsive dashboard/
setup. Then Stage C recording, Stage D responsive polish, Stage E landing/hosting.
Stop after Stage A rather than silently extending scope. Phase 4 security/deployment/
privacy contact/physical-device release gates still apply to both platforms.

## K. Suggested commit

`test(web): verify Expo browser compatibility and document Stage A`

All changes remain locally uncommitted, including the pre-existing Phase 4 work.

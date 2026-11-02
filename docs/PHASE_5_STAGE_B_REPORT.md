# Phase 5 — Stage B: authentication and shared screens

2026-10-30. Local-only continuation of Stage A. No deployment, Git staging/commit/
push, real account changes, billing activation or Groq calls. Phase 4 and Stage A
working-tree changes preserved. Browser recording remains Stage C.

## A. Compatibility findings

Stage A already established SDK57 web export and public route compatibility.
Confirmed Stage B defects: email redirects always used the native scheme; browser
storage accessed native modules through a shared adapter and unhandled Storage
exceptions obscured browser configuration failures; callback URL credentials were
not cleared; home fetched metrics only on mount; missing skill measurements became
zero-valued skill cards. Native callbacks/storage and shared RPCs already worked.
The password-login regression also confirmed that removing the signed-out route
group selected account deletion as its fallback. The navigator now prefers the
allowed tabs group, then career setup for new users.

## B. Files changed in Stage B

| File | Change |
|---|---|
| src/lib/authRedirect.ts | Preserve native verification/recovery deep links |
| src/lib/authRedirect.web.ts | Derive web callbacks from current origin |
| src/lib/webAuth.ts | HTTPS/localhost callback rules and browser session-storage adapter |
| src/lib/authStorage.web.ts | Browser-only adapter; no native storage imports or shared SSR token map |
| src/lib/authStorage.ts | Retain native SecureStore/migration implementation; remove superseded browser branch |
| src/services/authService.ts | Reuse platform callback helper for signup, recovery, resend |
| src/app/auth/callback.tsx | Read browser hash/query, clear successfully consumed credentials from history, avoid consuming credential-free callback URLs |
| src/app/_layout.tsx | Correct authenticated initial route and onboarding fallback; preserve explicit public/callback links |
| src/lib/authErrors.ts | Actionable browser-storage and HTTPS errors without raw token details |
| src/providers/AuthProvider.tsx | Storage bootstrap message and mounted-ref initialization for effect re-entry |
| src/app/(tabs)/_layout.tsx | Web desktop sidebar; existing bottom tabs on Android and narrow web |
| src/app/(tabs)/home.tsx | Web columns/bounded width/server allowance; reload metrics on focus; omit unknown skill measurements |
| src/app/interview/setup.tsx | Web readable max-width; native layout preserved |
| src/lib/webAuth.test.ts | Six browser callback/storage tests |
| src/services/authService.web.test.ts | Two web service tests covering email redirects and duplicate fragment consumption |
| scripts/web-shared-smoke.cjs | Local-only intercepted Auth/metrics browser fixture across six widths |
| docs/PHASE_5_STAGE_B_REPORT.md | Evidence, manual setup and remaining limits |

## C. Shared architecture

No new backend or scoring/entitlement authority. Web and native use the same
Supabase client configuration, AuthProvider, profile services, metrics/result RPCs,
quota reservation and recovery services. RPCs get_user_practice_metrics and
get_interview_result remain server-authorized. UI fixtures do not prove RLS; existing
SQL ownership tests and real cross-device tests remain separate evidence.

## D. Platform behavior

At web widths >=1024 tabs become a sidebar with existing routes only. Home uses
two columns at >=1200; smaller web retains vertical content. Setup is capped at
900 pixels on web. Android retains bottom tabs, original setup width, native
recording and SecureStore. No new purchase routes or entitlement flags added.
Unknown skills are hidden on both platforms instead of shown as measured zeros.

## E. Authentication and manual configuration

Signup, resend and password recovery now use:

* Native: `vocara://auth/callback?flow=verification` or `flow=recovery`.
* Web: current HTTPS origin plus `/auth/callback?flow=...`.
* Development: HTTP permitted only for localhost/127.0.0.1/IPv6 loopback.

No caller-provided return URL is followed. Supabase must allow the actual origin.
Owner action before live testing: in Authentication URL Configuration, keep native
callback entries and add exact reviewed web callback URLs for verification/recovery
and the exact local port used during testing. Avoid wildcard production domains.
Check email templates honor RedirectTo rather than a hardcoded native/SiteURL path.
Configure actual deployed Site URL and hosting route refresh only when reviewed;
no dashboard settings were changed here.

Browser tokens remain in sessionStorage (tab-scoped), never moved to localStorage.
Reload restores that tab's session; another browser/device signs in independently
to the same backend. Closing a tab normally ends its storage lifetime, subject to
browser session restoration behavior. Browser JavaScript/XSS can access these tokens;
this is not an HttpOnly-cookie architecture. CSP/hosting controls remain Stage E.
Legacy localStorage values are removed without being read. If sessionStorage is
blocked or full, authentication fails explicitly rather than silently using a
persistent plaintext fallback. SSR holds no shared in-memory session values.

Successful callbacks clear token/code parameters from the address bar. Failed links
remain available for retry; users should never share authentication URLs. Existing
code-exchange, fragment and OTP processing remain shared. PKCE links require the
original verifier context; arbitrary cross-device email code exchange is not promised.
No OAuth/MFA implementation was added.

References: [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
and [Expo platform modules](https://docs.expo.dev/router/advanced/platform-specific-modules/).

## F. Microphone and AI

Unchanged. Web recording still explicitly unavailable, and native M4A/AAC validation
must not be bypassed by renaming browser WebM. Stage C must implement actual browser
capture, MIME/codec/duration validation, upload compatibility and safe interruption
handling against existing authenticated AI endpoints. No live AI request made.

## G. Test evidence

* PASS: 59 Vitest tests, including eight new browser/service cases and existing
  native signup callback, authentication, recovery, quota service and storage tests.
* PASS: TypeScript noEmit.
* PASS: intercepted browser history/session reload/allowance/setup at 320, 390,
  768, 1024, 1366 and 1440 pixels; no page-level horizontal overflow or uncaught
  page exceptions in that run. Source data is explicitly synthetic.
* Screenshots of desktop home/setup inspected locally; generated under ignored dist.
* PASS: full lint and focused browser harness lint.
* PASS: intercepted browser recovery fragment, URL credential cleanup, callback
  reload and navigation to password reset.
* PASS: final complete Chrome fixture run: password sign-in reaches home, logout
  removes the session-storage token and protected home redirects to login, and an
  incomplete profile reaches career setup. No uncaught page errors. Final log:
  `dist/stage-b-browser-final.log` (ignored). All backend responses were intercepted.
  Earlier local-server connection failures/compilation timeouts were rerun; an
  intermediate unsupported initial-route setting was replaced by screen ordering.
* PASS: final web/Android/iOS exports after route-order correction: approximately
  5.5 MB web JavaScript, 8.5 MB Android Hermes, 8.4 MB iOS Hermes. Exports do not
  create native binaries or validate real-device behavior.
* NOT TESTED: real SMTP/Auth, live cross-device account/history access, signed media,
  browser recording, actual backend deployment, other browser engines and Android
  physical devices. Browser fixture responses are not actual authorization tests.

Fixture reproduction: start local Expo web on port8093 with EXPO_NO_DOTENV=1,
EXPO_PUBLIC_SUPABASE_URL=https://vocara-stage-a.invalid and
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_synthetic_stage_a_only, then run
`node scripts/web-shared-smoke.cjs` with Playwright available (or its module path in
VOCARA_PLAYWRIGHT_MODULE). Never use these dummy settings in a real build.
The harness intercepts only that dummy backend and blocks every other external URL.

## H. Web build

Uses existing static Expo export and shared route tree; no server or hosting added.
Local export command: `npx expo export --platform all --output-dir dist/stage-b-export`.
This tests bundling only, with dotenv disabled, not hosted authentication/redirects.

## I. Android status

Native callback test remains passing. Platform filenames keep browser APIs out of
native execution. No Android app/package/version/payment settings changed in Stage B.
Native export is a compile check, not APK installation or physical-device verification.
Retest native login, email recovery, navigation, recording and resume on hardware
before release because shared components/AuthProvider did change.

## J. Remaining work

Next: Stage C — browser voice interviews. Then Stage D responsive results/history
polish and Stage E landing/hosting/security headers. Live cross-device acceptance
still requires owner-approved synthetic accounts in the intended environment.
Phase 4 dependency advisories, privacy contact placeholders, deletion processing
and deployment/device evidence remain release blockers. No beta readiness claim.

Owner-supervised live acceptance still needed: use two synthetic accounts; sign in
to Android and web with the same account, compare history/allowance and resume a
server-saved interview; verify the second account cannot read the first account's
result; test actual verification/recovery emails in the same and a different browser;
test expired/invalid links, blocked storage, token refresh after idle, and local logout.
Do not use real applicant records or spend AI quota without explicit authorization.

## K. Suggested commit

`feat(web): add browser auth callbacks and responsive shared screens`

No commit executed. Review Stage B separately from pre-existing Phase 4/Stage A work.

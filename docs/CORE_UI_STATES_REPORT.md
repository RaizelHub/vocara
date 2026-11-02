# Core UI states review — 2026-11-03

## Coverage

| State | Vocara behavior |
| --- | --- |
| Empty | Existing recent-practice and speaking history guide users to their first interview/recording. |
| Loading | Existing animation and operation labels retained; shared wait guidance added. |
| Error | Existing controlled messages and retry/sign-in actions retained. No raw backend errors exposed. |
| Offline | New browser connection notice preserves the current view, explains reconnect/retry and warns to keep unsaved work open. Native uses existing request-error handling; no native reachability detector added. |
| Slow network | At 10 and 30 seconds, pending operations show truthful guidance. No invented completion percentages or automatic duplicate submissions. Each operation restarts its timer and cleans it up on unmount. |
| Zero search results | Not applicable: there is no current user search feature. No unrelated search UI added. |
| Permission denied | Existing microphone rationale and browser site-settings/native settings recovery retained. |
| Session expiry | Persist only the current interview ID, scoped to its owner, while the route is active. Resume revalidates server state after sign-in; completed/abandoned references are cleared. Explicit logout clears the reference. |
| Form validation | Existing inline errors now expose `aria-invalid` and associate each field with its own error text. Auth submit buttons expose busy state. |
| Success | Existing interview result, answer-ready and password-reset success views provide next actions. |

## Privacy and limitations

The recovery reference uses existing storage adapters: SecureStore on native and
sessionStorage in browsers. It contains no answer, audio, transcript, password or
token. Server authorization and saved answers remain authoritative. References
never grant access or reserve another allowance.

**Unsaved drafts are not fully persistent.** Unsaved recordings and unsaved form
content can still be lost on force-close or auth-driven unmount. This change
preserves a safe session reference and server-saved work, not arbitrary sensitive
draft content. Full encrypted draft persistence requires a separate implementation.
Browser online status is a hint, not proof that the backend is reachable.
If reference storage is unavailable, existing latest-server-session recovery remains.

## Changed areas

- New `ConnectionNotice`, `WaitNotice`, and platform-specific `useBrowserOffline`.
- Integrated with root layout, data loading, auth bootstrap/buttons and answer processing.
- Improved `AuthInput` validation semantics.
- Added `interviewRecoveryReference`, adapter binding, owner-isolation tests and
  server-verified reference selection in `ResumeInterview`; explicit logout cleanup.
- Extended `scripts/web-voice-smoke.cjs` with `VOCARA_TEST_STATES=1`.

## Validation

- 68 client tests passed (14 suites), including owner isolation and content rejection.
- Chrome fixture checks passed: inline validation association, offline/reconnect
  notice, delayed response guidance and eventual result display.
- Local web export passed; no live AI/backend requests in browser fixtures.
- Initial React lint found synchronous effect state resets. Replaced with keyed
  timer lifecycle and owner-scoped rendered recovery state before final validation.
- Final TypeScript, configured Expo lint and browser-script lint passed.
- Android local export passed. Physical-device reachability, force-close and
  screen-reader acceptance remain manual checks; no device-level pass is claimed.

Reproduce browser checks using the synthetic public environment from the Stage C
report, export to `dist/ui-states-web`, set `VOCARA_WEB_EXPORT` to that path and
`VOCARA_TEST_STATES=1`, then run `node scripts/web-voice-smoke.cjs` with Playwright.

No deployment, real user modification, payment change or paid AI request. The user
explicitly requested GitHub publication for this change, superseding the earlier
local-only Git instruction for this task.

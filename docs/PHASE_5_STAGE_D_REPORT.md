# Phase 5 Stage D — responsive layouts and accessibility

Validated locally on 2026-11-02. No commit, push, deployment, cloud APK build,
remote configuration change, real user modification or paid AI request.

## A. Confirmed issues

- Results, speaking results and progress content stretched across wide browser windows.
- Share preview stretched across desktop width and did not close with Escape in Chrome.
- Result score-comparison text was clipped at 320px. Screenshot inspection found
  this even though document-level horizontal-overflow checks passed.
- Answer accordions did not expose expanded state in the browser DOM. The installed
  React Native Web uses explicit ARIA props rather than the native state object here.
- Shared buttons lacked an intentional visible focus treatment; section titles
  lacked heading semantics. History titles were limited to one line.
- History detail used a non-scrolling content view, unsuitable for short windows.

## B. Modified files

| File | Change |
| --- | --- |
| `src/app/interview/results.tsx` | Centered 900px browser content, top home navigation, heading semantics, 44px share control. |
| `src/app/interview/result/[id].tsx` | Scrollable, centered history detail and semantic title. |
| `src/app/speaking/results.tsx` | Centered 900px browser content. |
| `src/app/(tabs)/progress.tsx` | Centered 960px browser content and semantic title. |
| `src/components/home/RecentPractice.tsx` | Two-line history titles and shrinkable text column. |
| `src/components/results/ShareResultModal.tsx` | 560px browser sheet, 44px close target, visible-only Escape handler with cleanup. |
| `src/components/results/ResultHero.tsx` | Wrapping score row and shrinkable comparison text. |
| `src/components/ui/PressableScale.tsx` | Inset web focus outline and explicit expanded/selected/busy/checked ARIA state; native accessibility state retained. |
| `src/components/ui/SectionHeader.tsx` | Heading semantics and wrapping/shrinkable title group. |
| `scripts/web-voice-smoke.cjs` | Optional layout mode, synthetic results/history fixtures and six-width keyboard/layout regression checks. |

## C–F. Architecture, platforms, authentication and AI

Existing routes, Supabase accounts, result queries, history, quota services and
Groq pipeline remain shared. No backend or authentication changes in Stage D.
Desktop max widths and focus styling are web-only. Text wrapping, scrollable
history detail, heading semantics and accessible control sizing also benefit native.
The Stage C browser audio implementation is unchanged. RevenueCat stays in test mode.

## G. Verification

- **67 existing client tests passed** across 13 suites.
- TypeScript passed after the accessibility and modal changes.
- Configured Expo lint passed; targeted lint passed for the final score-layout
  change and browser test script.
- Chrome exported-app fixture passed at **320, 390, 768, 1024, 1366 and 1440px**:
  - history item keyboard activation → history detail → full review;
  - visible button focus and keyboard answer expansion;
  - correct `aria-expanded=true` after expansion;
  - long feedback and expanded answer without document horizontal overflow;
  - score-comparison text inside the viewport (separate clipping assertion);
  - share-preview open and Escape dismissal;
  - progress heading/content and no document horizontal overflow.
- Inspected screenshots at 320px and 1440px. The final 320px screenshot confirms
  the score comparison now wraps below the score rather than clipping.
- Browser tests block nonfixture external requests and use synthetic account/results.

During test development, the history test initially skipped the actual intermediate
detail route; the test was corrected. Subsequent failures exposed real missing
expanded state and Escape dismissal, both fixed and retested. Screenshot review
then exposed the comparison clipping, followed by a new assertion and passing rerun.

Browser screenshots are local ignored artifacts:
`dist/stage-d-result-320.png` and `dist/stage-d-result-1440.png`.

Reproduce with Stage C's documented synthetic export settings, exporting to
`dist/stage-d-web`. Set `VOCARA_WEB_EXPORT=dist/stage-d-web` and
`VOCARA_TEST_LAYOUT=1`, then run `node scripts/web-voice-smoke.cjs`.
Set `VOCARA_PLAYWRIGHT_MODULE` to the installed Playwright module if necessary.
Do not publish the synthetic-config export.

## H–I. Build and native regression status

Production web export passed: 41 static routes, approximately 5.5 MB entry bundle.
Android local export passed: approximately 8.5 MB Hermes bundle; no APK or cloud build.
No physical Android/iOS, screen-reader, Firefox, Edge or Safari acceptance was run.
Chrome keyboard/DOM evidence does not establish full accessibility conformance.
Speaking-results width is covered by compilation, not a dedicated speaking fixture.

## J. Remaining work

Next: **Stage E — landing page, privacy/release checks and manual hosting instructions**.
Keep the Stage C audio/browser/device acceptance checklist and earlier privacy,
dependency and deployment limitations open. This stage does not claim release readiness.
No new design system, subscription package, live billing or backend architecture.

## K. Suggested commit message

`fix(web): improve responsive results and keyboard accessibility`

All changes remain locally uncommitted, alongside earlier Phase 4 and Phase 5 work.

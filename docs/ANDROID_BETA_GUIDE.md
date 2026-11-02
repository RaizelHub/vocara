# Vocara private Android beta

Prepared 2026-10-30. No APK or download link exists from this work. Do not invite
testers until the blockers in PHASE_4_ANDROID_REPORT.md are resolved.

## Owner preparation and manual build

1. Review the local diff and dependency advisories. Keep signing credentials private.
2. Verify ownership of the existing EAS project ID in app.json. Do not relink blindly.
3. In Expo's dashboard, review the **preview** environment: HTTPS Supabase URL,
   public publishable/anon key, optional RevenueCat **test_** SDK key. Leave Sentry
   DSN unset unless existing monitoring is explicitly approved for this beta.
   Never supply Groq, SMTP, service-role, or RevenueCat secret keys as public values.
   Remove obsolete nonempty public platform billing keys: the build guard rejects them.
4. Prefer staging. Verify migrations 001–016 and all corresponding Edge Functions
   match this checkout. Verify Auth redirects `vocara://auth/callback*`, SMTP,
   private bucket policies, deletion worker secret/scheduler and processor review.
   These cloud checks and any deployment are OWNER actions, not performed here.
5. If staging is unavailable, do not point new testers at an unreviewed live project.
   Obtain owner authorization first; use only synthetic accounts, no real CVs or
   employer/customer data, bounded quotas, and no destructive tests of existing users.
6. Run checks, then manually build when blockers are cleared:

```powershell
npm ci
npx expo-doctor
npx tsc --noEmit
npx vitest run --pool=threads
npm run test:beta
npm run lint
npx eas-cli login
npx eas-cli project:info
npx eas-cli credentials --platform android
npx eas-cli build --platform android --profile preview
```

The last command uploads source and can use EAS build quota: run it yourself only
after reviewing the project/environment/signing prompts. No forced commit is needed
from this task. Preview is internal, developmentClient=false, APK, environment=preview.
The post-install guard checks actual build variables; it does not attest remote RLS
or cryptographically validate a public JWT. A missing backend fails the build guard.
Do not use an Expo Go QR code or a development-client artifact for this test.

The repository ignores generated android/ios directories. EAS should prebuild from
app.json. A stale local android folder is NOT proof of the resulting manifest.
Do not upload an old native directory accidentally through a custom .easignore.

Retain the same Android signing key for future updates to com.vocara.app. Review
existing EAS credentials; do not replace an established key. Never commit keystores
or passwords. Version 1.0.0/code 1 is preserved; increment versionCode for each new
distributed APK after checking the last distributed code. No remote signing status
or last published code was verified here.

## Inspect the actual APK before sharing

Download the successful preview artifact from your real EAS build page. Record its
build ID, source revision, SHA-256, version/code and environment label (no credentials).
Use Android SDK tools, substituting actual paths:

```powershell
Get-FileHash -Algorithm SHA256 .\Vocara-beta.apk
apkanalyzer manifest print .\Vocara-beta.apk
apkanalyzer manifest min-sdk .\Vocara-beta.apk
apksigner verify --verbose --print-certs .\Vocara-beta.apk
adb install -r .\Vocara-beta.apk
```

Verify package com.vocara.app, Vocara label/icon, release debuggable=false,
RECORD_AUDIO/INTERNET, and no SYSTEM_ALERT_WINDOW or broad external-storage access.
Inspect all merged permissions, including dependency contributions. Installed source
defaults suggest API 24 / Android 7.0 minimum; the APK is authoritative. Native module
requirements may raise it. Inspect JS/assets for private credential patterns locally
without printing matched values. Test cold launch with Metro stopped and computer
disconnected, then complete the device matrix. JavaScript export is not an APK test.

## Private installation and updates

Start with 5–10 trusted testers. In Expo project settings disable unauthenticated
internal build access where available and invite authorized testers. Internal URLs
must not be treated as secrets or posted publicly. Review actual access settings.
Share ONLY the real successful build installation link privately; none is fabricated here.

On Android: open that trusted link, download the APK, allow installation from that
browser/file manager only when prompted, install, and turn that permission off again.
Do not disable Play Protect. If Android warns or refuses installation, report the
exact non-sensitive message to the owner rather than bypassing protections.
The app needs internet for authentication and AI; it needs no Metro or Expo Go.
Microphone permission is requested when recording. Denying it should leave a usable
permission screen; permanent denial uses Android Settings.

For updates, install the new APK over the old one with the same package/signature
and newer version code. Do not uninstall to resolve signature mismatch: ask the owner,
because uninstalling clears local state and may destroy unsent recordings.
Uninstall through Settings > Apps > Vocara > Uninstall. Uninstalling does NOT delete
the server account. Use Profile > Delete Account for the verified deletion request;
pending is not completion. Operator review and the worker must be operational.

## Limits and privacy

Use fictional practice answers and synthetic resumes. Submitted audio/transcripts
are processed by Supabase/Groq; retain no real customer or applicant records in beta.
Saved server answers can resume. An unuploaded cache recording can be lost on force
close, uninstall, or OS eviction. Provider outages/cooldowns can delay feedback even
with reserved allowance. Never promise offline AI or exactly-once provider execution
after uncertain network failure. Retention cleanup is disabled until reviewed.
Legal/operator/contact placeholders must be completed before inviting testers.

RevenueCat Test Store simulates purchases with its test key and does not use real
Google Play billing. A direct APK does not validate Play license-testing purchases.
Keep beta access controlled; Test Store users can simulate entitlement changes.
Never enable production credentials/offerings or trust client-only entitlement flags.
Missing billing must not block a free interview. No purchase was executed here.

## Feedback template

Do not send passwords, tokens, emails, private recordings, transcripts, resumes,
raw logs, or screenshots containing personal data.

* App version/code and build ID:
* Device model / Android version / approximate RAM:
* Screen or feature; Wi-Fi or mobile data:
* Steps to reproduce using synthetic content:
* Expected result / actual result / sanitized error category:
* Time and timezone; reproducible always/sometimes/once:
* Installation and startup: easy? Any warning/crash?
* Navigation and setup: anything confusing?
* Microphone: permission, recording, playback and submission clear?
* AI questions and feedback: useful, understandable, inappropriate or incorrect?
* Performance: slow screens or interrupted operations?
* Recovery: was saved work restored and retry understandable?
* Overall usefulness (1–5); most important improvement:

Send this directly to the owner through the agreed private channel. No new analytics
or feedback service is installed.

References: [Expo APK builds](https://docs.expo.dev/build-reference/apk/),
[internal distribution](https://docs.expo.dev/build/internal-distribution/),
[RevenueCat Test Store](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store).

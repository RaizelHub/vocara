# Android APK 1.0.1 (2)

Requested 2026-11-04. Internal standalone APK, not a Play Store release.

- Package: `com.vocara.app`
- Version: `1.0.1`, Android version code `2`
- Source base: `91ed603f7e31ec26f1ab744116a2f0efaf301b4f`, plus local app.json version increment.
- EAS profile/environment: `preview`; development client disabled.
- Build ID: `397e13ab-715b-413f-8785-c05c891a747c`
- Build page: https://expo.dev/accounts/janjandev00/projects/vocara/builds/397e13ab-715b-413f-8785-c05c891a747c
- Existing remote Android signing configuration reused; no replacement keystore generated.
- Existing local public Supabase settings and RevenueCat Test Store key added to
  the previously unconfigured EAS preview environment, with sensitive visibility.
  No production environment or backend configuration changed. No private keys uploaded.
- Pre-build verification: 68 client tests and five beta-environment tests passed.

Includes the previously committed UI-state, browser compatibility, accessibility
and reliability changes. Review the existing Android device test matrix before
distributing beyond a private beta. No physical-device test is implied by a cloud
build. Existing backend deployment and privacy-contact limitations remain.

Build status at preparation: queued. Artifact verification will be recorded once available.

# VOCARA Environment & Secrets

Everything you need to stand up the app, edge functions, and the RevenueCat
integration. Secrets never ship in the client bundle: client code only reads
`EXPO_PUBLIC_*` variables; everything else lives in Supabase function secrets.

## Client (`.env` / `.env.example`)

Copied from `.env.example` and filled in locally. Injected at bundle time by
Metro; safe to include in a committed `.env.example` **with empty values only**.

| Variable | Required | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (PostgREST base) |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase anon/publishable key (RLS-scoped) |
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | no | RevenueCat public SDK key (iOS) |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` | no | RevenueCat public SDK key (Android) |
| `EXPO_PUBLIC_SENTRY_DSN` | no | Sentry client key; when unset Sentry is a no-op |

In Supabase Dashboard → Authentication → URL Configuration, add
`vocara://auth/callback*` to **Additional Redirect URLs**. VOCARA explicitly
uses the stable `vocara` scheme in development and production builds.
VOCARA uses this callback for email verification and password recovery.

## Supabase Auth email delivery

Email confirmation and password recovery are sent by **Supabase Auth**, not by
an Expo environment variable or an Edge Function secret. Before testing with
arbitrary email addresses, configure a custom SMTP provider in Supabase
Dashboard → Authentication → SMTP Settings.

The built-in Supabase mailer is development-only: it sends only to organization
team addresses and is currently limited to two messages per hour. A failed
confirmation send rolls back signup, so no user account is created.

For Resend SMTP, use the credentials shown by Resend's Supabase SMTP guide:

- Host: `smtp.resend.com`
- Port: `465` (implicit TLS) or `587` (STARTTLS)
- Username: `resend`
- Password: a server-side Resend API key
- Sender: an address on a domain verified in Resend

After enabling custom SMTP, confirm Authentication → Rate Limits has an
appropriate email-send limit and send a test confirmation from the dashboard.
Never prefix the SMTP password with `EXPO_PUBLIC_` or bundle it in the app.

`EXPO_PUBLIC_REVENUECAT_*` keys are **public SDK keys** — they are embedded in
the binary by design (RevenueCat public keys are not secrets). Configure
RevenueCat with at least one platform key or the subscription UI shows the
"not configured" state.

## Supabase function secrets (server-only)

Set with the Supabase CLI; never in `.env`:

```sh
npx supabase secrets set GROQ_API_KEY=<...> --project-ref YOUR_PROJECT_REF
npx supabase secrets set REVENUECAT_SECRET_API_KEY=<...> --project-ref YOUR_PROJECT_REF
npx supabase secrets set REVENUECAT_WEBHOOK_SECRET=<...> --project-ref YOUR_PROJECT_REF
```

| Secret | Required | Used by | Purpose |
| --- | --- | --- | --- |
| `GROQ_API_KEY` | yes (AI features) | all Groq functions | Provider auth for transcriptions, evaluations, analyses |
| `GROQ_EVALUATION_MODEL` | no | evaluate-answer, evaluate-speaking | Overrides the default evaluation model |
| `GROQ_EVALUATION_REASONING` | no | evaluation functions | Reasoning effort for evaluations |
| `GROQ_JOB_ANALYSIS_MODEL` | no | analyze-job | Overrides the job analysis model |
| `GROQ_RESUME_MODEL` | no | process-resume, compare-resume-job | Overrides the resume model |
| `GROQ_SPEAKING_MODEL` | no | evaluate-speaking | Overrides the speaking model |
| `GROQ_TRANSCRIPTION_MODEL` | no | transcribe-answer, transcribe-speaking | Overrides the default transcription model |
| `VOCARA_EVALUATION_VERSION` | no | evaluation functions | Schema/behavior version tag |
| `VOCARA_JOB_ANALYSIS_VERSION` | no | analyze-job | Schema/behavior version tag |
| `VOCARA_RESUME_ANALYSIS_VERSION` | no | resume functions | Schema/behavior version tag |
| `VOCARA_SPEAKING_EVALUATION_VERSION` | no | evaluate-speaking | Schema/behavior version tag |
| `REVENUECAT_SECRET_API_KEY` | yes (subscriptions) | sync-subscription | Server-to-server RevenueCat API key |
| `REVENUECAT_WEBHOOK_SECRET` | yes (subscriptions) | revenuecat-webhook | Webhook HMAC/legacy secret (must match RevenueCat dashboard) |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_DB_URL`, `SUPABASE_JWKS` are injected automatically at deploy time —
never set them yourself.

## RevenueCat configuration

- Dashboard → Apps → pick the iOS/Android app → **API Keys**:
  - SDK key → `EXPO_PUBLIC_REVENUECAT_*_API_KEY` (client)
  - Secret key → `REVENUECAT_SECRET_API_KEY` (function secret)
- Products must exist with identifiers `vocara_pro_monthly` and
  `vocara_pro_annual`, and an entitlement named **`pro`** attached to both.
- Webhook → URL `https://YOUR_PROJECT_REF.supabase.co/functions/v1/revenuecat-webhook`
  with the webhook secret matching `REVENUECAT_WEBHOOK_SECRET` (the function
  supports both the modern `X-RevenueCat-Signature` HMAC and the legacy
  `Authorization: Bearer` scheme). Set the project ref above if it changes.

## Sentry configuration

- `EXPO_PUBLIC_SENTRY_DSN` in the client `.env` enables reporting (no-op when
  unset; init is safe in development).
- `app.json` plugin `@sentry/react-native` reads `organization` / `project`;
  replace the placeholders (`vocara` / `vocara-mobile`) with the real slugs.
- EAS builds authenticate source-map uploads via the project secret
  `SENTRY_AUTH_TOKEN` (set with `npx eas-cli secret:create`).

## Rotation & hygiene

- Never commit real values to `.env*`; `.gitignore` already excludes `.env`,
  `.env.*` (except `.env.example`), `*.jks`, `*.p8`, `*.p12`, `*.key`,
  `*.pem`, and the generated `/ios` + `/android` folders.
- Rotate `REVENUECAT_WEBHOOK_SECRET` and `REVENUECAT_SECRET_API_KEY` before a
  public release if they were ever exposed.
- `SUPABASE_SERVICE_ROLE_KEY` must never appear in client code; edge functions
  receive it via the auto-injected secret only.

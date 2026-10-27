# VOCARA Production Checklist

Run through this in order before every release. See `ENVIRONMENT.md` for the
full secret and provider matrix.

## 0. Preconditions (one-time)

- [ ] Supabase project `YOUR_PROJECT_REF` linked (`npx supabase link`)
- [ ] `eas-cli` logged in (`npx eas-cli login`) and the project created on Expo
  (`npx eas-cli init` — requires a first build or `eas init`)
- [ ] `REVENUECAT_SECRET_API_KEY` + `REVENUECAT_WEBHOOK_SECRET` set as Supabase
      function secrets
- [ ] `REVENUECAT_WEBHOOK_SECRET` matches the RevenueCat dashboard webhook
- [ ] RevenueCat products `vocara_pro_monthly` / `vocara_pro_annual` exist with
      the `pro` entitlement attached
- [ ] Sentry project exists; `EXPO_PUBLIC_SENTRY_DSN` set in `.env`;
      `app.json` plugin `organization`/`project` updated;
      `SENTRY_AUTH_TOKEN` set as an EAS project secret
- [ ] iOS/Android identifiers reviewed: `com.vocara.app` (both platforms)

## 1. Automated verification (run locally)

```sh
node node_modules/typescript/bin/tsc --noEmit   # types
npm run lint                                    # eslint + style
npm run test                                    # vitest unit tests
npm run test:evaluation                         # deno edge-function tests
npx expo-doctor                                 # SDK/dependency health
```

All must pass clean.

## 2. Database + functions deploy

```sh
npx supabase db push                     # apply pending migrations
npx supabase functions deploy transcribe-answer transcribe-speaking evaluate-answer evaluate-speaking finalize-interview analyze-job generate-job-interview process-resume compare-resume-job generate-personalized-interview revenuecat-webhook sync-subscription --project-ref YOUR_PROJECT_REF
```

Verify after deploy:

- [ ] `npx supabase migration list` — local == remote for every migration
- [ ] `npx supabase functions list` — all 12 functions ACTIVE
  (`revenuecat-webhook` must show `verify_jwt: false`; every other function
  `verify_jwt: true`)
- [ ] RPC guards: anon call to `check_feature_access` returns 401; anon call to
  `get_feature_usage_summary` returns `NOT_AUTHENTICATED`
- [ ] Webhook smoke test: post a synthetic RevenueCat `INITIAL_PURCHASE` event
  (signed with the webhook secret) → `user_subscriptions.plan = 'pro'`
- [ ] Webhook rejects a request without a signature (HTTP 401)

## 3. Client build

### Development (local)

```sh
npx eas-cli build --profile development --platform android   # dev client .apk
npx expo start --dev-client                                  # run + hot reload
```

### Preview / release

```sh
npx eas-cli build --profile preview --platform android       # internal .apk
npx eas-cli build --profile production --platform android    # store .aab (auto-increments versionCode)
```

- [ ] Production build has `versionCode` incremented (autoIncrement in eas.json)
- [ ] Sentry release appears with symbolicated stack traces
- [ ] Source maps uploaded (requires `SENTRY_AUTH_TOKEN` EAS secret)

## 4. Two-account QA matrix

Run every row on a fresh install (not a dev-client upgrade). Use two accounts:
**FREE** (never paid) and **PRO** (subscription active). Android-first.

| Area | Free account | Pro account |
| --- | --- | --- |
| Sign up → onboarding → career setup | completes | completes |
| Home dashboard loads metrics | ok | ok |
| Interview: answer + AI feedback | first 5/day OK; 6th blocked with upgrade sheet | unlimited |
| Interview: results + share preview | ok | ok |
| Job analysis (paste posting) | first 2/month OK; 3rd blocked | unlimited |
| Resume upload + analysis | first 1/month OK; 2nd blocked | unlimited |
| Personalized interview generation | first 1/month OK; 2nd blocked | unlimited |
| Speaking practice (no feature gate) | ok | ok |
| Usage screen (profile → usage) | shows remaining limits + Upgrade CTA | shows Unlimited + Manage |
| Paywall purchase (Play billing, sandbox) | → PRO instantly, all limits lifted | n/a |
| Restore purchases (reinstall) | n/a | restores PRO |
| Manage subscription link | n/a | opens store management |
| Log out → log back in | limits persist | PRO persists |
| Offline / airplane-mode start | graceful error, no crash | graceful error, no crash |

Monetization flows to test last: paywall appearance, purchase, entitlement
refresh on app foreground, webhook-driven revoke (expire entitlement in
RevenueCat dashboard → app shows Free again after refresh).

## 5. Regression sweep (both accounts)

- [ ] Microphone permission denied → recoverable state, settings deep link
- [ ] Interrupted recording (app backgrounded) → session survives
- [ ] App killed mid-interview → resume/retry flow works
- [ ] Dark mode — automatic system theme renders correctly
- [ ] Screen reader: all primary CTAs labeled, radio/checkbox state announced
- [ ] Landscape or small screens (320pt) — no clipped CTAs

## 6. Release wrap-up

- [ ] `git tag` + version bumped in `app.json` when shipping
- [ ] Sentry alert on: `fatal` level events, `pro_required` spikes
- [ ] RevenueCat webhook delivered (dashboard → Webhooks → recent deliveries)
- [ ] Store listing screenshots/description updated if UI changed

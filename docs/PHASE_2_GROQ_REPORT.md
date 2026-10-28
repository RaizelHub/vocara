# Phase 2: Groq reliability, capacity and cost controls

Verification date: **2026-10-28 (Asia/Taipei)**. All changes are local. No live Groq
request, hosted database query, deployment, secret change or Git write operation
was performed. RevenueCat keys, products, prices and test-mode configuration were
not changed. The working tree was clean when Phase 2 began.

## Phase 1 verification

The code exists: migration 013 has atomic interview reservations and grandfathering
for valid active sessions; `interviewStarter.ts` retains request identities;
`interviewRecovery.ts` rebuilds the room from server records; Home offers Resume;
the quota/recovery/auth tests and local PostgreSQL harness are present. Their
presence does not prove the migration is deployed. No remote deployment state was
inspected. Local Docker remains unavailable. All 14 migrations and the Phase 1/2 pgTAP
assertions passed in isolated in-memory PostgreSQL with minimal Auth/Storage fixtures;
a real Supabase reset and parallel-connection validation remain outstanding.

## A. Changes made

| Files | Purpose |
| --- | --- |
| `supabase/migrations/014_ai_usage_and_capacity.sql` | Administrative usage ledger, atomic shared capacity, one active operation per user, provider dispatch deduplication, comparison leases, price snapshots and cost views |
| `supabase/functions/_shared/aiProvider.ts` | Single provider transport, full response deadline, safe errors, Retry-After handling, token/audio bounds and metadata-only accounting |
| `supabase/functions/_shared/groq.ts` | Existing prompts/model parameters retained; one dispatch per durable claim instead of hidden retries |
| `supabase/functions/_shared/database.types.ts`, `featureAccess.ts` | Types for tracked comparison RPCs; correct the feature-access RPC signature to accept Supabase promise-like builders |
| `supabase/functions/{analyze-job,generate-job-interview,generate-personalized-interview,process-resume,compare-resume-job,evaluate-answer,evaluate-speaking,finalize-interview}/index.ts` | Connect existing authenticated claims to provider accounting and shared-capacity errors |
| `supabase/functions/{transcribe-answer,transcribe-speaking}/index.ts` | Shared transport includes response-body deadline; validated audio duration enters accounting |
| `src/services/audioService.ts`, `src/lib/dataErrors.ts` | Remove raw Storage response bodies and arbitrary backend errors from diagnostics |
| `src/lib/verifiedAudioUpload.ts`, `verifiedAudioUpload.test.ts` | Room-lifetime upload deduplication and confirmed-upload reuse after attachment failure; three regression tests |
| `src/app/interview/session.tsx` | Reuse confirmed uploads, protect ambiguous attachments from premature deletion, and send configuration/model/budget failures Home instead of requesting another recording |
| `supabase/functions/tests/aiProvider_test.ts`, `evaluation_test.ts` | Mocked transport/accounting/error/boundary tests and updated retry regression |
| `supabase/tests/database/ai_usage.test.sql`, `scripts/test_ai_concurrency.py` | Database authorization, quota rollback, duplicate dispatch and concurrent capacity checks |
| `supabase/functions/tests/databaseSmoke.ts` | Optional pinned test-only PostgreSQL/pgTAP runner; in-memory, no real data or runtime network |
| `scripts/ai_cost_report.py`, `scripts/test_ai_cost_report.py` | Offline projections and optional private aggregate-CSV analysis; decimal arithmetic and unknown-cost tests |
| `docs/AI_MONITORING.sql`, this report | Read-only administrative queries, lifecycle, limits, cost assumptions and manual validation instructions |

No new application runtime dependencies were added. The optional SQL runner loads
pinned PGlite/pgTAP tools into Deno's cache without changing package.json or lockfiles.
See [PGlite extensions](https://pglite.dev/extensions/) for the test runtime. The existing evaluation rubric, structured
schemas, deterministic score calculations, temperature, seeds, and completion caps
were preserved. Prompt shortening and a model switch were not justified without
quality comparisons; the significant verified waste was hidden retries and the
missing durable resume/job comparison lease.

## B. Integration and request lifecycle

Normal/Quick Practice questions come from the local question bank. They do not call
Groq to generate questions. The model defaults and output limits are:

| Operation | Default model | Maximum output tokens |
| --- | --- | ---: |
| Job analysis | `openai/gpt-oss-120b` | 2,400 |
| Job/personalized question generation | `openai/gpt-oss-120b` | 3,200 |
| Interview/speaking answer feedback | `openai/gpt-oss-120b` | 1,600 |
| Interview summary | `openai/gpt-oss-120b` | 1,400 |
| Resume analysis | `openai/gpt-oss-120b` | 2,800 |
| Resume/job comparison | `openai/gpt-oss-120b` | 1,400 |
| Interview/speaking transcription | `whisper-large-v3-turbo` | Audio, not a chat token cap |

Official documentation lists both defaults as production models. The code also
allows server-side overrides, including `openai/gpt-oss-20b`, Whisper large-v3 and
`qwen/qwen3.6-27b`. The latter is absent from the current supported-model page;
do not assume that override remains available. No configured secret values or live
model-list endpoint were read. No automatic model replacement was introduced.

Sources: [models](https://console.groq.com/docs/models),
[speech-to-text](https://console.groq.com/docs/speech-to-text),
[rate limits](https://console.groq.com/docs/rate-limits).

Before Phase 2: authenticated Edge Function → owner-scoped resource reads → domain
claim/cache → optional feature allowance → provider → validate → persist result.
Several non-interview operations could make three provider calls inside one claim;
their intermediate costs were not recorded. Transcription stopped its timeout on
receipt of headers, leaving body consumption outside the deadline. Resume/job
comparison's claim checked cache/ownership but did not persist an in-flight lease.

After Phase 2:

1. Supabase `withSupabase({auth:'user'})` and explicit user checks reject unauthenticated
   calls. Existing payload/ownership checks and completed-result caches remain.
2. The existing claim transaction writes its request ledger. A trigger acquires a
   common transaction lock and checks shared capacity. Rejection rolls back domain
   attempt counters and creates no provider attempt. Interview reservation allowance
   is unchanged. Cached results do not need a new provider claim.
3. A metadata-only usage row identifies source, operation, resource, user, interview
   where applicable, attempt and retry status. Resume/job comparison now also has
   a durable, bounded claim.
4. Immediately before fetch, server-side accounting atomically transitions the
   attempt from `not_sent` to `sent`, refusing duplicate dispatch or missing ownership.
   The helper validates a conservative UTF-8-byte token upper bound and output cap.
5. One provider call runs with a deadline that includes response-body consumption.
   The deadline is 75 seconds for chat and transcription. Chat keeps strict JSON schemas, temperature 0.5, reasoning low by default, no
   streaming, deterministic seeds and a hashed user safety identifier.
6. Provider measurements are recorded before domain schema validation, so malformed
   generated content still has a recorded provider cost when usage is supplied.
   Domain completion/failure updates the existing ledger and mirrored usage status.
   Provider completion records bind to the exact usage-row ID returned at dispatch.

### Retry and capacity policy

- **No hidden retries**, including 429, 5xx, invalid JSON, timeouts or network failures.
  Explicit retries use existing domain claims and existing per-recording limits.
- 429 numeric/date Retry-After guidance becomes a shared database cooldown. Requests
  during that cooldown are rejected before another claim commits. Error messages
  explain the wait. Configuration/authentication/model/budget errors are not retried
  automatically and never echo upstream messages, prompts, or keys.
- Timeout/network/5xx results are conservatively uncertain. Their capacity lease
  remains protected for eight minutes even if the feature's domain failure handler
  marks its own record failed. Recovery still reads saved state before explicit retry.
- Defaults: **one active operation per user, four globally, 20 new claims/minute**.
  `ai_capacity_settings` is administrative only. These are shared beta controls,
  not RevenueCat entitlements or guarantees of the organization's Groq quota.
- Chat request envelope: **120,000 conservative input-token upper bound**, including
  serialized schema overhead, and **3,200 output tokens maximum**; smaller existing
  per-operation caps above remain. This upper bound is not measured token usage.
- Interview limits remain 1–12 questions; admission at most 30 questions / 20
  sessions per user per rolling day; three attempts per generation, six total
  transcription/evaluation claims per answer, three summary claims. These are the
  Phase 1 rules. No additional daily budget is charged halfway through a reservation.
- Comparison adds a per-user active lease, up to three requests per resume/job pair
  per day and the existing 40/day ceiling. Capacity rejection consumes none of these.
- This is not a new global dollar-spend ceiling. Organization TPM/TPD/audio limits
  can still cause provider throttling; a provider outage or spend suspension can
  delay a reserved session. A server reservation protects application allowance,
  not external provider availability.

## C. Cost analysis and administrative inspection

Published list rates verified on 2026-10-28: GPT-OSS-120B $0.15 / million input
tokens and $0.60 / million output tokens; Whisper turbo $0.04 / audio hour.
Whisper has a 10-second minimum billed duration per request. Rates are stored with
their source and date and copied to an attempt before dispatch, so later rate edits
do not silently reprice old attempts. Unknown override prices remain unknown.

Usage logs contain no full prompts, transcripts, questions, credentials or audio.
Token counts are provider-reported when present. Audio duration is measured from
validated media, not a provider invoice. Cost is always an estimate: cached discounts,
taxes, special contracts and unknown outcomes are not inferred. Unknown cost stays
NULL and appears as an explicit missing-cost count in every aggregate.

No production consumption was collected. The offline baseline assumes five static
questions, 60 seconds per answer, 2,000 input / 600 output tokens per answer, and
2,500 input / 400 output tokens for the summary. It excludes retries, job generation,
resume work and provider failures. Baseline totals: 12,500 input tokens, 3,400 output
tokens, five audio minutes, six chat calls and five transcription calls.

| Interviews | Estimated USD |
| ---: | ---: |
| 1 | $0.00725 |
| 10 | $0.0725 |
| 100 | $0.7248 |
| 1,000 | $7.2483 |
| 10,000 | $72.4833 |

At 10 interviews/day: approximately **$0.0725/day and $2.1745/30 days**.
At 100/day: approximately **$0.7248/day and $21.745/30 days**. These are paid-tier
equivalents; eligible free-tier usage has no paid charge, subject to provider limits.

The official free limits currently list GPT-OSS-120B at 30 RPM, 1,000 RPD, 8,000 TPM
and 200,000 TPD; Whisper turbo at 20 RPM, 2,000 RPD, 7,200 audio seconds/hour and
28,800/day. With the baseline token assumptions, 200,000 TPD supports roughly 12
complete interviews/day before other AI work and retries. Burst TPM may bind earlier.
Organization-specific limits can differ. Higher volume projections are cost arithmetic,
not a claim that the free tier can support those volumes.

Use `docs/AI_MONITORING.sql` manually as a database administrator. It reports requests,
retries, failures, tokens, audio minutes and known estimated cost daily/monthly and
per interview. The optional CSV excludes sessions started before collection began,
avoiding a misleading complete-interview average from partial historical coverage.
Keep that export private; it contains interview identifiers, though no answer content.

```sh
python scripts/ai_cost_report.py --interviews-per-day 10
python scripts/ai_cost_report.py --usage-csv PRIVATE_AGGREGATE_EXPORT.csv
```

`--rates-json` accepts explicit public-rate overrides. No command connects to Groq
or Supabase. A collected mean is reported only when all included requests have a
known estimate. Source: [official model prices](https://console.groq.com/docs/models)
and [audio billing minimum](https://console.groq.com/docs/speech-to-text).

## D. Security, audio and privacy

- Groq credentials are read only in server functions. Searches found no Groq request
  or private Groq key reference in client code and no embedded credential patterns
  in the inspected source/docs. Existing secret values were not printed or changed.
- All ten AI endpoints retain authenticated middleware, owner-scoped resource reads,
  UUID/body validation and service-only claims. Administrative usage/rate/capacity
  tables use RLS with no ordinary-user policies and explicit revoked grants. Views
  use invoker security and are service-role only. Accounting validates claim ownership.
- Server errors expose controlled codes and safe messages. Raw provider response
  messages are discarded. Storage diagnostics now log only status and a classified
  code; raw Storage bodies are not attached to client errors.
- Android recording settings are unchanged: Expo AAC/M4A in cache, mono, 64 kbps,
  existing HIGH_QUALITY preset/sample rate. A 120-second recording is roughly 0.96 MB
  of encoded audio before container overhead. Existing upload cap is 5 MiB and upload
  deadline 45 seconds. Server media parsing and 120-second limits remain in place.
- Existing immutable upload paths and duplicate-object hash verification are retained;
  a saved server recording is reused for transcription retry and recovery. A confirmed
  upload is now also reused when attaching it needs retry, without another POST.
  Only room-lifetime metadata is cached. Ambiguous attachments are not deleted
  merely because a previous response was lost; they need authoritative reference
  checks during later cleanup. No new
  background upload, codec conversion or retranscription loop was added.
- Empty media/no-speech checks remain. No language hint was forced because mixed or
  non-English speech is supported by the current application.

Retention strategy: the recorder discards local cache recordings on discard/unmount;
force-close cache leftovers remain subject to OS cache eviction. Attached server
audio must remain while an interview is resumable. Do not blindly delete old audio
or Storage metadata rows. A future administrative cleanup should select unreferenced
objects in both private audio buckets older than a conservative grace period (for
example 24 hours), recheck references immediately before removal, and delete through
the Storage API. This phase prepares documentation, not a destructive cleanup job.
Usage rows contain metadata only and cascade on profile deletion; a configurable
90-day raw-metadata policy with longer anonymous aggregates is a recommendation,
not an activated deletion schedule. Account deletion must coordinate Storage objects,
database content, provider retention and exports; that larger work remains separate.

## E. Validation

- Deno helper suite: **52 passing**, network denied, mocked Groq only. New cases cover
  success/usage, 429 + Retry-After dates, uncertain interruption, stalled-body timeout,
  body connection failure, missing claim/accounting failure before fetch, duplicate dispatch, audio/token bounds,
  safe auth/budget/model errors, malformed response accounting and unchanged quality
  parameters. The old automatic-retry expectation was replaced with a one-call test.
- Offline cost tests: **3 passing** (baseline math, minimum audio billing, unknown-cost
  coverage). Projection command runs without network access.
- Client suite: **43 passing**, including three new upload reuse/deduplication cases.
  TypeScript and affected-file ESLint passed; no physical-device test is claimed.
- Isolated PostgreSQL: **all 14 migrations and 48 pgTAP assertions passed** (18 Phase 1,
  30 Phase 2). Tests cover authorization, capacity, rollback, reservations, duplicate
  dispatch, uncertain leases, Retry-After cooldown, rate caps, retries, unknown costs,
  price snapshots, and full free interview completion.
- This uses real PostgreSQL/pgTAP compiled to WASM with minimal Auth/Storage fixtures.
  It does not validate hosted Auth/Storage behavior or real simultaneous database
  connections. Those integration tests remain unexecuted: Docker Linux engine and
  psql are unavailable. The prepared local concurrency harness remains necessary.
- All **12 Edge Function entrypoints type-check successfully** with the frozen
  dependency lockfile. Initial sandbox DNS/cache restrictions were resolved through
  dependency download access; a pre-existing RPC Promise/PromiseLike type mismatch
  was fixed. No lockfile or application dependency changes were made. No functions
  were executed as part of this check.
- Android audio behavior was reviewed statically and encoder/upload settings remain
  unchanged. Physical-device background, force-close and weak-network tests remain.

## F. Remaining issues and manual next steps

**High priority before release:** start a disposable local Supabase stack, apply all
local migrations there, and run the database/parallel tests. Review migration 014 and deploy it together
with the ten changed functions during a controlled maintenance window: pause new AI
requests, allow active claims to settle, apply the migration and update all functions,
then resume traffic. Otherwise old functions could produce incomplete telemetry
during the rollout. The new transport fails closed if accounting is
unavailable. No production migration or deployment was performed by this task.

```sh
# LOCAL disposable stack only; reset destroys that local database.
supabase start
supabase db reset --local
supabase test db --local
python -B scripts/test_interview_concurrency.py
python -B scripts/test_ai_concurrency.py
deno test --config supabase/functions/deno.json --no-prompt --deny-net supabase/functions/tests
python -B scripts/test_ai_cost_report.py
# Optional isolated SQL check; downloads pinned test tools on its first run.
deno run --no-config --no-lock --node-modules-dir=none --allow-read --allow-env=NODE_ENV --deny-net supabase/functions/tests/databaseSmoke.ts
npx vitest run --pool=threads
npx tsc --noEmit
```

**Medium priority:** external provider completion cannot be guaranteed exactly once
after a timeout or a lost persistence response. Unknown dispatches retain an
eight-minute lease and unknown cost. Instrumentation starts with migration 014 and
does not fabricate historical measurements. The global capacity/RPM guard does not
model every organization-specific token/audio bucket; confirm actual provider limits
and use administrative settings and provider spend controls deliberately. Non-interview
features retain their existing per-attempt entitlement behavior. The optional Qwen
override needs model-availability review before use.

**Privacy/operations follow-up:** implement reviewed orphan-audio and account-deletion
jobs, retention schedules, and reconciliation of uncertain provider outcomes. Add
physical-device testing and a representative quality/cost evaluation before considering
model or prompt changes. Do not activate production RevenueCat billing as part of this work.

## G. Suggested commit message

`feat(ai): add safe Groq accounting and shared capacity controls`

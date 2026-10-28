# Vocara privacy operations — review before deployment

No deployment, remote SQL, actual account deletion or processor request was executed
by this task. Examples below are instructions for the owner, not completed actions.

## Release prerequisites

1. Fill the operator/privacy-contact placeholders in the notices. Review international
   processing, lawful basis, age eligibility, support procedures and actual backup
   settings with appropriate counsel. Do not invent retention obligations.
2. Resolve the npm advisory findings and validate the dependency/build toolchain.
3. Test all migrations 001–016 in a disposable local Supabase project. Start local
   functions with local credentials and a synthetic worker secret, never production keys.
4. Run the commands below, then physical Android checks. Confirm all twelve existing
   functions and both new functions are included in the deployment review.
5. Plan coordinated rollout: pause AI requests, let active claims settle, apply reviewed
   migrations, update functions, configure the worker and operator monitoring, and ship
   the compatible client. Older clients that send resume processing-state fields during
   INSERT will need updating; do not reopen those grants to keep an old client working.
6. Rebuild the native development client for SecureStore. Verify migration from existing
   AsyncStorage, login, refresh, logout, cold start and deleted-session handling.
7. Publish `/account/delete`, `/privacy` and `/terms` to an owner-controlled HTTPS host
   when web support is ready. The Expo routes are reusable, but no full web deployment
   or HTTP security configuration is supplied by this task. Put the real URL into Google
   Play only after verifying that it loads and accepts a verified request without the app.

## Configuration

See `PRIVACY_CONFIGURATION.example.env`. Set `PRIVACY_WORKER_SECRET` to at least
32 cryptographically random characters, only in server secrets and the trusted
scheduler. Never put it or the Supabase service key in an `EXPO_PUBLIC_` variable.
Both new endpoints must see the same secret. Configure
`PRIVACY_ALLOWED_WEB_ORIGINS` with exact HTTPS origins; wildcards are unsupported.

The worker endpoint has application-level secret authentication. A scheduler sends
POST with `Authorization: Bearer <worker secret>`. Schedule frequent bounded runs
(for example every five minutes after testing). The source intentionally does not
create cron jobs or activate remote secrets. The request endpoint refuses admission
when the worker secret is absent; a configured secret alone does not prove a schedule
is running. Verify scheduling and alert ownership before exposing the feature.

All current RevenueCat client calls require a test key beginning `test_`. Production
fallback keys are ignored; no keys, package prices, offerings or purchase records were
changed. Do not enable real purchases as part of this rollout.

## Deletion review and monitoring

Use an administrative database connection. Keep query output private. These rows
contain only operational metadata, but pending jobs still identify an account.

```sql
select id,user_id,status,requested_at,available_at,lease_until,attempts,
       processor_erasure_confirmed,last_error_code
from public.account_deletion_jobs
where status <> 'completed'
order by requested_at;

select id,user_id,requested_at,status
from public.account_data_requests where status='pending' order by requested_at;
```

For each deletion request:

1. Match the existing job to the already verified account. Do not accept an arbitrary
   email or user ID from an unauthenticated message as authorization.
2. Review RevenueCat customer mappings, original IDs and aliases. Confirm any external
   erasure through the appropriate provider workflow, taking care not to erase another
   user's shared alias. Test purchases/restoration and account deletion are separate;
   deleting a customer does not substitute for canceling a future store subscription.
3. Review historical Sentry events and applicable Groq settings/retention or erasure
   channels. Do not claim that a local database cascade erased external logs/backups.
   If an exception or hold legitimately applies, obtain policy/legal review and communicate
   it through a verified channel rather than silently marking erasure complete.
4. Only after the relevant processor work is genuinely complete or verified not applicable,
   call `public.confirm_account_processor_erasure(<job UUID>)` as service/admin. This
   intentionally cannot be called by a mobile or web user. It does not itself contact a
   provider. Do not automate blind confirmation.
5. The worker then removes owned files through Storage, deletes Auth, and clears the job's
   account identifier. Monitor failed and stale processing jobs. A job remains recoverable
   until all required steps succeed; do not remove it just to make an alert disappear.
6. Confirm the completed state and communicate completion via a verified support channel
   if needed. There is no automated email or user-facing post-erasure receipt lookup.

When the worker is interrupted, retry its normal endpoint. Do not manually erase
Storage SQL rows. Lease fencing and idempotent listing/removal are designed for lost
responses. Default retry delay is fifteen minutes; crash leases expire after five.
The initial ten-minute drain window reduces overlap with AI work already dispatched.
A user cannot cancel a pending job through the app; any exceptional operator handling
needs a documented review, not removal of account gates.

## Data-copy requests

The in-app Privacy Policy offers authenticated users a request button backed by
`request_account_data_copy()`. The queue contains no exported content. One pending
request per user is deduplicated; new requests are limited to one per day. An operator
must verify the delivery channel, scope an owner-only export using the inventory,
and securely deliver it. Do not publish a bucket or a permanent unauthenticated URL.
Mark a request closed only after fulfilling it. No turnaround deadline or legal
exception is invented by the code.

## Orphan retention

No referenced recording or resume is deleted merely because it is old. Referenced
history and resumable interviews remain available. Cleanup defaults **off** and uses
a seven-day grace for unreferenced files. Changing grace affects only eligibility;
it does not independently start a worker.

Administrative dry run (read-only with respect to deletion claims):

```sql
select public.claim_orphan_private_files(false);
```

Review paths privately. If approved, update the singleton settings row with the
chosen grace (minimum 24 hours) and `orphan_cleanup_enabled=true`, then let the
secret worker handle claims/removal. It runs orphan work only when no deletion job
is due. New attachments to claimed paths fail safely; the user must use a new upload.
A Storage failure preserves the claim for retry. Successful removal clears metadata.
Files belonging to missing profiles or unsupported/legacy path shapes need separate
review; they are not blindly deleted. No default cleanup activation was performed.

The ten-upload per-answer cap prevents accumulating unlimited abandoned recordings
without imposing a maximum on completed history. Existing orphan removal rights
allow normal discard cleanup. The twenty-resume-file cap requires removing old PDFs
before further uploads. Per-file limits and server content validation remain separate.

## Validation commands — local only

```sh
# The following reset destroys ONLY the disposable local database.
supabase start
supabase db reset --local
supabase test db --local
python -B scripts/test_interview_concurrency.py
python -B scripts/test_ai_concurrency.py
# Privately configure loopback-only test keys and serve functions locally first:
python -B scripts/test_privacy_http.py

deno test --config supabase/functions/deno.json --no-prompt --deny-net supabase/functions/tests
# Optional single-connection WASM PostgreSQL; not a substitute for real Storage/Auth:
deno run --no-config --no-lock --node-modules-dir=none --allow-read --allow-env=NODE_ENV --deny-net supabase/functions/tests/databaseSmoke.ts
npx vitest run --pool=threads
npx tsc --noEmit
```

The HTTP test hard-rejects non-loopback hosts/ports. It creates synthetic accounts,
checks cross-user Storage access, expired signed URLs, invalid function credentials,
and duplicate deletion admission, then removes only its own fixture accounts/paths.
It must not receive production keys. Synthetic malformed PDFs test Storage transport,
not AI processing; no test sends a paid Groq request.

Before beta, also verify real AMR after password reauthentication, expired JWT handling,
Storage path validation, partial worker failure/restart, full Auth cascade with every
content type, multiple concurrent claims, signed-URL expiry, and Android force-close
and background recording cleanup. Native Sentry is disabled pending separate privacy
review of native crash payloads; JS telemetry remains tightly allowlisted.

## Rollback

Stop scheduling if a defect appears; preserve job records and account gates. Disable
orphan cleanup to stop new orphan admissions, then inspect existing claims. Deploy a
forward fix. Do not revive old grants, replace an already-applied migration silently,
or restore erased accounts from backups without handling deletion obligations.
Neither Git rollback nor app downgrade reverses actual deletion.

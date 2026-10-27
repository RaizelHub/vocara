# Reproducing the Vocara backend locally

The backend source is under `supabase/`: migrations 001–013, twelve Edge Function
entrypoints, shared utilities, Deno dependency lockfile, tests and config.toml.
These files were previously excluded by `.gitignore`. They are now eligible for
version control, but remain uncommitted for the owner to review and commit.
Generated `.temp`, `.branches`, snippets and local secret files remain ignored.
The client example is `.env.example`; server placeholders are
`supabase/.env.example`. Neither contains credentials.

## Prerequisites and local setup

Use Node/npm compatible with the checked-in package lock, Deno 2, Supabase CLI,
Docker with its engine running, and PostgreSQL client tools (`psql`) for the
concurrency test. Install client dependencies with `npm ci`.

From the repository root, start a **disposable local** backend:

```sh
supabase start
supabase db reset --local
supabase test db --local
python scripts/test_interview_concurrency.py
```

`db reset --local` destroys only the disposable local database. Do not substitute
a linked/remote database. The SQL tests roll back their synthetic records. The
concurrency script is hardcoded to 127.0.0.1:54322 and removes its random test user
in a finally block. It uses the standard local postgres credentials, never a
production URL. Stop the stack when finished with `supabase stop`.

For local manual app testing, copy `.env.example` to `.env`, use the URL and public
key reported by the local stack, and run `npm start`. A physical device needs a
reachable development-machine address. Copy `supabase/.env.example` to
`supabase/.env.local` only if manually serving functions:

```sh
supabase functions serve --env-file supabase/.env.local
```

The automated tests use mocked provider results and need no Groq key:

```sh
npx vitest run --pool=threads
npx tsc --noEmit
npx eslint src
deno test --config supabase/functions/deno.json --no-prompt --deny-net supabase/functions/tests
```

Deno dependency downloads may be needed on a fresh machine; `--deny-net` prevents
network calls from test code. For an offline verification add `--cached-only`.
No hosted SMTP, RevenueCat, Sentry, or provider credentials are needed for these
tests. Hosted service settings are external prerequisites documented in
ENVIRONMENT.md; they are not database migrations.

## Reservation and recovery behavior

Migration 013 and the changed interview Edge Functions must be released together
by the owner. This task does not deploy either. An old client that inserts sessions
directly will need updating: direct creation privileges are removed intentionally.

The existing free allowance is five AI answers per day, shared with speaking
practice. A normal interview now defaults to five questions. A single RPC creates
its immutable question set and reserves one allowance unit per question, atomically.
An insufficient reservation rolls back all creation and usage. A user-level lock
also serializes other consumers of the same allowance. Retries retain the original
session UUID and do not charge again. Generated job/resume interviews reserve their
existing question set when started.

Reservations survive day boundaries and plan changes. Transcription, evaluation
and finalization require the reservation and do not consume more commercial
allowance. Independent abuse controls admit at most 30 questions / 20 sessions per
rolling 24 hours. They apply at admission, never halfway through a reserved session.
Processing retains three attempts per recording generation, with a total of six
transcription/evaluation claims per answer and three summary claims per session.
These are failure/re-record safety limits, not additional interview allowance.
Exhausted processing limits require support; the saved data is retained.
Abandoning does not refund allowance (prevents repeatedly recycling provider work).
Migration 013 grants reservations to existing valid active sessions without charging
again, honoring interviews admitted by the old application. Already-completed
feedback is preserved. Draft sessions that were never started still require admission.

Recovery is owner-scoped and reads server questions, recordings, transcripts and
feedback. It selects the first unfinished question, polls active eight-minute
leases, and asks for explicit retry after failed/expired work. It never automatically
calls Groq. Completed evaluation claims return cached results. The Home action
resumes the latest active session; older active sessions remain accessible by ID.

Only uploaded and attached recordings are recoverable after process death.
An in-progress or unsent local recording must be recorded again. No interview text
or audio is added to AsyncStorage or other persistent client state. Backgrounding
stops the recorder through the existing recorder lifecycle handler. Live audio still
requires device testing on iOS/Android. A provider response lost before its database
commit cannot be recovered from Groq; explicit retry after lease expiry may make a
second provider call. Exactly-once provider billing across that failure window is
not guaranteed.

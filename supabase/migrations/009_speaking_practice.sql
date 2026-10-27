begin;

-- Speaking Practice Mode: a lightweight free-form speaking flow where the
-- user picks a curated prompt, records real answers (one or more attempts per
-- prompt session), and receives deterministic skill coaching on top of the
-- existing Groq transcription and evaluation infrastructure.

-- 1. Speaking sessions -------------------------------------------------------
create table if not exists public.speaking_sessions (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null,
  prompt_id text not null,
  prompt_text text not null,
  prompt_tip text,
  difficulty text not null,
  time_limit_seconds integer not null default 90,
  evaluation_version text not null default 'v1',
  status text not null default 'in_progress',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint speaking_sessions_category_check check (
    category in (
      'everyday',
      'workplace',
      'introduction',
      'storytelling',
      'opinion',
      'explanation',
      'quick_response'
    )
  ),
  constraint speaking_sessions_prompt_length_check check (
    char_length(prompt_text) between 3 and 500
  ),
  constraint speaking_sessions_tip_length_check check (
    prompt_tip is null or char_length(prompt_tip) <= 240
  ),
  constraint speaking_sessions_difficulty_check check (
    difficulty in ('warm_up', 'moderate', 'challenging')
  ),
  constraint speaking_sessions_time_limit_check check (
    time_limit_seconds in (60, 90, 120)
  ),
  constraint speaking_sessions_evaluation_version_check check (
    evaluation_version ~ '^[a-zA-Z0-9._-]{1,40}$'
  ),
  constraint speaking_sessions_status_check check (
    status in ('in_progress', 'completed', 'abandoned')
  )
);

create index if not exists speaking_sessions_user_created_idx
  on public.speaking_sessions (user_id, created_at desc);

alter table public.speaking_sessions enable row level security;

drop policy if exists "speaking_sessions_select_own" on public.speaking_sessions;
create policy "speaking_sessions_select_own"
on public.speaking_sessions for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "speaking_sessions_insert_own" on public.speaking_sessions;
create policy "speaking_sessions_insert_own"
on public.speaking_sessions for insert
to authenticated
with check (user_id = (select auth.uid()));

-- Status changes happen only through close_speaking_session.
revoke update, delete on public.speaking_sessions from anon, authenticated;
grant all privileges on public.speaking_sessions to service_role;

-- 2. Speaking attempts -------------------------------------------------------
create table if not exists public.speaking_attempts (
  id uuid primary key,
  session_id uuid not null references public.speaking_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempt_number integer not null,
  audio_path text,
  audio_mime_type text,
  audio_size_bytes integer,
  audio_sha256 text,
  audio_generation integer not null default 0,
  audio_attached_at timestamptz,
  duration_seconds integer,
  transcription_status text not null default 'pending',
  transcript text,
  word_count integer,
  speaking_pace numeric,
  transcription_error text,
  transcription_retryable boolean not null default true,
  transcription_attempt_count integer not null default 0,
  transcription_attempt_id uuid,
  transcription_started_at timestamptz,
  transcription_completed_at timestamptz,
  transcription_model text,
  transcription_provider_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint speaking_attempts_session_number_unique unique (session_id, attempt_number),
  constraint speaking_attempts_attempt_number_check check (
    attempt_number between 1 and 10
  ),
  constraint speaking_attempts_audio_path_length_check check (
    audio_path is null or char_length(audio_path) <= 1024
  ),
  constraint speaking_attempts_audio_mime_check check (
    audio_mime_type is null
    or audio_mime_type in ('audio/mp4', 'audio/m4a', 'audio/x-m4a')
  ),
  constraint speaking_attempts_audio_size_check check (
    audio_size_bytes is null or audio_size_bytes between 1 and 5242880
  ),
  constraint speaking_attempts_audio_sha256_check check (
    audio_sha256 is null or audio_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint speaking_attempts_audio_generation_check check (audio_generation >= 0),
  constraint speaking_attempts_duration_check check (
    duration_seconds is null or duration_seconds between 1 and 120
  ),
  constraint speaking_attempts_transcription_status_check check (
    transcription_status in ('pending', 'processing', 'completed', 'failed')
  ),
  constraint speaking_attempts_transcript_length_check check (
    transcript is null or char_length(transcript) <= 10000
  ),
  constraint speaking_attempts_word_count_check check (
    word_count is null or word_count between 0 and 5000
  ),
  constraint speaking_attempts_pace_check check (
    speaking_pace is null or speaking_pace between 0 and 1000
  ),
  constraint speaking_attempts_error_length_check check (
    transcription_error is null or char_length(transcription_error) <= 1000
  ),
  constraint speaking_attempts_attempt_count_check check (
    transcription_attempt_count between 0 and 3
  ),
  constraint speaking_attempts_model_length_check check (
    transcription_model is null or char_length(transcription_model) <= 160
  ),
  constraint speaking_attempts_provider_id_length_check check (
    transcription_provider_request_id is null
    or char_length(transcription_provider_request_id) <= 255
  )
);

create index if not exists speaking_attempts_session_idx
  on public.speaking_attempts (session_id, attempt_number);

create index if not exists speaking_attempts_transcription_queue_idx
  on public.speaking_attempts (transcription_status, transcription_started_at)
  where transcription_status in ('pending', 'processing', 'failed');

alter table public.speaking_attempts enable row level security;

drop policy if exists "speaking_attempts_select_own" on public.speaking_attempts;
create policy "speaking_attempts_select_own"
on public.speaking_attempts for select
to authenticated
using (user_id = (select auth.uid()));

-- Attempts are created through reserve_speaking_attempt and updated only by
-- the claim/complete/fail RPCs; clients never mutate them directly.
revoke insert, update, delete on public.speaking_attempts from anon, authenticated;
grant all privileges on public.speaking_attempts to service_role;

-- 3. Speaking feedback -------------------------------------------------------
create table if not exists public.speaking_feedback (
  id uuid primary key,
  attempt_id uuid not null references public.speaking_attempts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempt_number integer not null,
  clarity_score integer,
  fluency_score integer,
  grammar_score integer,
  vocabulary_score integer,
  structure_score integer,
  conciseness_score integer,
  overall_score integer,
  feedback_summary text,
  strengths jsonb,
  improvements jsonb,
  grammar_corrections jsonb,
  natural_phrasing jsonb,
  better_version text,
  filler_words jsonb,
  evaluation_status text not null default 'pending',
  evaluation_model text,
  evaluation_version text,
  evaluation_retryable boolean not null default true,
  evaluation_error text,
  evaluation_attempt_count integer not null default 0,
  evaluation_attempt_id uuid,
  evaluation_started_at timestamptz,
  evaluated_at timestamptz,
  provider_request_id text,
  source_audio_generation integer not null default 0,
  source_transcript_sha256 text,
  ai_input_tokens integer,
  ai_output_tokens integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint speaking_feedback_attempt_version_unique unique (attempt_id, evaluation_version),
  constraint speaking_feedback_attempt_number_check check (
    attempt_number between 1 and 10
  ),
  constraint speaking_feedback_scores_check check (
    clarity_score is null or clarity_score between 0 and 100
  ),
  constraint speaking_feedback_fluency_check check (
    fluency_score is null or fluency_score between 0 and 100
  ),
  constraint speaking_feedback_grammar_score_check check (
    grammar_score is null or grammar_score between 0 and 100
  ),
  constraint speaking_feedback_vocabulary_score_check check (
    vocabulary_score is null or vocabulary_score between 0 and 100
  ),
  constraint speaking_feedback_structure_score_check check (
    structure_score is null or structure_score between 0 and 100
  ),
  constraint speaking_feedback_conciseness_score_check check (
    conciseness_score is null or conciseness_score between 0 and 100
  ),
  constraint speaking_feedback_overall_check check (
    overall_score is null or overall_score between 0 and 100
  ),
  constraint speaking_feedback_status_check check (
    evaluation_status in ('pending', 'processing', 'completed', 'failed')
  ),
  constraint speaking_feedback_version_check check (
    evaluation_version ~ '^[a-zA-Z0-9._-]{1,40}$'
  ),
  constraint speaking_feedback_attempt_count_check check (
    evaluation_attempt_count between 0 and 3
  ),
  constraint speaking_feedback_error_length_check check (
    evaluation_error is null or char_length(evaluation_error) <= 1000
  ),
  constraint speaking_feedback_model_length_check check (
    evaluation_model is null or char_length(evaluation_model) <= 160
  ),
  constraint speaking_feedback_provider_id_length_check check (
    provider_request_id is null or char_length(provider_request_id) <= 255
  ),
  constraint speaking_feedback_sha256_check check (
    source_transcript_sha256 is null or source_transcript_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint speaking_feedback_token_counts_check check (
    (ai_input_tokens is null or ai_input_tokens >= 0)
    and (ai_output_tokens is null or ai_output_tokens >= 0)
  ),
  constraint speaking_feedback_json_check check (
    (strengths is null or (jsonb_typeof(strengths) = 'array'
      and jsonb_array_length(strengths) between 1 and 3))
    and (improvements is null or (jsonb_typeof(improvements) = 'array'
      and jsonb_array_length(improvements) between 1 and 3))
    and (grammar_corrections is null or (jsonb_typeof(grammar_corrections) = 'array'
      and jsonb_array_length(grammar_corrections) between 1 and 5))
    and (natural_phrasing is null or (jsonb_typeof(natural_phrasing) = 'array'
      and jsonb_array_length(natural_phrasing) between 1 and 5))
    and (filler_words is null or (jsonb_typeof(filler_words) = 'array'
      and jsonb_array_length(filler_words) between 1 and 10))
  ),
  constraint speaking_feedback_completed_shape_check check (
    evaluation_status <> 'completed'
    or (
      overall_score is not null
      and clarity_score is not null
      and fluency_score is not null
      and grammar_score is not null
      and vocabulary_score is not null
      and structure_score is not null
      and conciseness_score is not null
      and nullif(btrim(feedback_summary), '') is not null
      and strengths is not null
      and improvements is not null
      and grammar_corrections is not null
      and natural_phrasing is not null
      and nullif(btrim(better_version), '') is not null
      and filler_words is not null
      and source_transcript_sha256 is not null
      and evaluated_at is not null
    )
  )
);

create index if not exists speaking_feedback_user_idx
  on public.speaking_feedback (user_id, evaluated_at desc)
  where evaluation_status = 'completed';

alter table public.speaking_feedback enable row level security;

drop policy if exists "speaking_feedback_select_own" on public.speaking_feedback;
create policy "speaking_feedback_select_own"
on public.speaking_feedback for select
to authenticated
using (user_id = (select auth.uid()));

revoke insert, update, delete on public.speaking_feedback from anon, authenticated;
grant all privileges on public.speaking_feedback to service_role;

-- 4. Internal ledgers (no client access) -------------------------------------
create table if not exists public.speaking_transcription_requests (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempt_id uuid references public.speaking_attempts (id) on delete set null,
  audio_path text not null,
  audio_generation integer not null,
  audio_sha256 text,
  duration_seconds integer not null,
  status text not null default 'processing',
  error_code text,
  model text,
  provider_request_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint speaking_transcription_requests_status_check check (
    status in ('processing', 'completed', 'failed')
  ),
  constraint speaking_transcription_requests_duration_check check (
    duration_seconds between 1 and 120
  ),
  constraint speaking_transcription_requests_generation_check check (
    audio_generation > 0
  ),
  constraint speaking_transcription_requests_sha256_check check (
    audio_sha256 is null or audio_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint speaking_transcription_requests_error_length_check check (
    error_code is null or char_length(error_code) <= 160
  ),
  constraint speaking_transcription_requests_model_length_check check (
    model is null or char_length(model) <= 160
  ),
  constraint speaking_transcription_requests_provider_id_length_check check (
    provider_request_id is null or char_length(provider_request_id) <= 255
  )
);

create index if not exists speaking_transcription_requests_user_created_idx
  on public.speaking_transcription_requests (user_id, created_at desc);

alter table public.speaking_transcription_requests enable row level security;
revoke all on public.speaking_transcription_requests from public, anon, authenticated;
grant all privileges on public.speaking_transcription_requests to service_role;

create table if not exists public.speaking_evaluation_requests (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempt_id uuid references public.speaking_attempts (id) on delete set null,
  evaluation_version text not null,
  model text,
  status text not null default 'processing',
  error_code text,
  provider_request_id text,
  ai_input_tokens integer,
  ai_output_tokens integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint speaking_evaluation_requests_version_check check (
    evaluation_version ~ '^[a-zA-Z0-9._-]{1,40}$'
  ),
  constraint speaking_evaluation_requests_status_check check (
    status in ('processing', 'completed', 'failed')
  ),
  constraint speaking_evaluation_requests_model_length_check check (
    model is null or char_length(model) <= 160
  ),
  constraint speaking_evaluation_requests_error_length_check check (
    error_code is null or char_length(error_code) <= 160
  ),
  constraint speaking_evaluation_requests_provider_id_length_check check (
    provider_request_id is null or char_length(provider_request_id) <= 255
  ),
  constraint speaking_evaluation_requests_tokens_check check (
    (ai_input_tokens is null or ai_input_tokens >= 0)
    and (ai_output_tokens is null or ai_output_tokens >= 0)
  )
);

create index if not exists speaking_evaluation_requests_user_created_idx
  on public.speaking_evaluation_requests (user_id, created_at desc);

alter table public.speaking_evaluation_requests enable row level security;
revoke all on public.speaking_evaluation_requests from public, anon, authenticated;
grant all privileges on public.speaking_evaluation_requests to service_role;

-- 5. Storage: speaking-audio -------------------------------------------------
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'speaking-audio',
  'speaking-audio',
  false,
  5242880,
  array['audio/mp4', 'audio/m4a', 'audio/x-m4a']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path shape: {user_id}/{session_id}/{attempt_id}.m4a (3 segments).
drop policy if exists "speaking_audio_insert_own" on storage.objects;
create policy "speaking_audio_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'speaking-audio'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and cardinality(storage.foldername(name)) = 2
  and storage.extension(name) = 'm4a'
  and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.m4a$'
  and exists (
    select 1
    from public.speaking_attempts as attempt
    where attempt.id::text = split_part(storage.filename(name), '.', 1)
      and attempt.session_id::text = (storage.foldername(name))[2]
      and attempt.user_id = (select auth.uid())
  )
);

drop policy if exists "speaking_audio_select_own" on storage.objects;
create policy "speaking_audio_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'speaking-audio'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "speaking_audio_update_own" on storage.objects;

drop policy if exists "speaking_audio_delete_own" on storage.objects;
create policy "speaking_audio_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'speaking-audio'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and not exists (
    select 1
    from public.speaking_attempts as attempt
    where attempt.audio_path = name
      and attempt.user_id = (select auth.uid())
  )
);

-- 6. Client RPCs -------------------------------------------------------------

-- Reserves the next attempt on a session with a server-assigned number.
create or replace function public.reserve_speaking_attempt(
  p_attempt_id uuid,
  p_session_id uuid,
  p_user_id uuid
)
returns public.speaking_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.speaking_sessions;
  v_attempt public.speaking_attempts;
  v_next_number integer;
begin
  if v_user_id is null or v_user_id <> p_user_id then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_attempt_id is null or p_session_id is null then
    raise exception 'Invalid attempt reservation' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('speaking-attempts:' || p_session_id::text, 0)
  );

  select *
  into v_session
  from public.speaking_sessions
  where id = p_session_id
    and user_id = v_user_id
  for update;

  if v_session.id is null then
    raise exception 'SPEAKING_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_session.status <> 'in_progress' then
    raise exception 'SPEAKING_SESSION_CLOSED' using errcode = 'P0001';
  end if;

  select coalesce(max(attempt_number), 0) + 1
  into v_next_number
  from public.speaking_attempts
  where session_id = p_session_id;

  if v_next_number > 10 then
    raise exception 'SPEAKING_ATTEMPT_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.speaking_attempts (
    id,
    session_id,
    user_id,
    attempt_number
  )
  values (
    p_attempt_id,
    p_session_id,
    v_user_id,
    v_next_number
  )
  returning * into v_attempt;

  return v_attempt;
end;
$$;

-- Confirms the freshly uploaded private object before resetting the attempt
-- to a transcribable state.
create or replace function public.attach_speaking_audio(
  p_attempt_id uuid,
  p_audio_path text,
  p_duration_seconds integer,
  p_audio_mime_type text,
  p_audio_size_bytes integer
)
returns public.speaking_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_attempt public.speaking_attempts;
  v_folders text[];
  v_object_size integer;
  v_object_mime_type text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into v_attempt
  from public.speaking_attempts
  where id = p_attempt_id
    and user_id = v_user_id
  for update;

  if v_attempt.id is null then
    raise exception 'SPEAKING_ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_duration_seconds is null or p_duration_seconds not between 1 and 120 then
    raise exception 'Invalid recording duration' using errcode = '22023';
  end if;

  if p_audio_mime_type is null
    or p_audio_mime_type not in ('audio/mp4', 'audio/m4a', 'audio/x-m4a')
  then
    raise exception 'Unsupported audio type' using errcode = '22023';
  end if;

  if p_audio_size_bytes is null or p_audio_size_bytes not between 1 and 5242880 then
    raise exception 'Invalid audio file size' using errcode = '22023';
  end if;

  v_folders := storage.foldername(p_audio_path);
  if cardinality(v_folders) <> 2
    or v_folders[1] <> v_user_id::text
    or v_folders[2] <> v_attempt.session_id::text
    or storage.extension(p_audio_path) <> 'm4a'
    or storage.filename(p_audio_path) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.m4a$'
  then
    raise exception 'Invalid audio path' using errcode = '22023';
  end if;

  select
    nullif(metadata ->> 'size', '')::integer,
    nullif(metadata ->> 'mimetype', '')
  into v_object_size, v_object_mime_type
    from storage.objects
    where bucket_id = 'speaking-audio'
      and name = p_audio_path
      and owner_id = v_user_id::text;

  if not found then
    raise exception 'Uploaded audio not found' using errcode = 'P0002';
  end if;

  if v_object_size is null or v_object_size <> p_audio_size_bytes then
    raise exception 'Audio file size does not match' using errcode = '22023';
  end if;

  if v_object_mime_type is null or v_object_mime_type <> p_audio_mime_type then
    raise exception 'Audio type does not match' using errcode = '22023';
  end if;

  if v_attempt.audio_path = p_audio_path then
    if v_attempt.transcription_status = 'pending'
      and v_attempt.transcription_attempt_count = 0
      and v_attempt.transcript is null
      and v_attempt.duration_seconds = p_duration_seconds
      and v_attempt.audio_mime_type = v_object_mime_type
      and v_attempt.audio_size_bytes = v_object_size
    then
      return v_attempt;
    end if;

    raise exception 'SPEAKING_AUDIO_ALREADY_ATTACHED' using errcode = 'P0001';
  end if;

  if v_attempt.transcription_status = 'processing'
    and v_attempt.transcription_started_at is not null
    and v_attempt.transcription_started_at > now() - interval '8 minutes'
  then
    raise exception 'SPEAKING_TRANSCRIPTION_IN_PROGRESS' using errcode = 'P0001';
  end if;

  if v_attempt.transcription_status = 'processing' then
    update public.speaking_transcription_requests
    set
      status = 'failed',
      error_code = 'audio_replaced',
      completed_at = now()
    where id = v_attempt.transcription_attempt_id
      and status = 'processing';
  end if;

  update public.speaking_attempts
  set
    audio_path = p_audio_path,
    duration_seconds = p_duration_seconds,
    audio_mime_type = v_object_mime_type,
    audio_size_bytes = v_object_size,
    audio_sha256 = null,
    audio_generation = audio_generation + 1,
    audio_attached_at = now(),
    transcript = null,
    word_count = null,
    speaking_pace = null,
    transcription_status = 'pending',
    transcription_error = null,
    transcription_retryable = true,
    transcription_attempt_count = 0,
    transcription_attempt_id = null,
    transcription_started_at = null,
    transcription_completed_at = null,
    transcription_model = null,
    transcription_provider_request_id = null
  where id = p_attempt_id
    and user_id = v_user_id
  returning * into v_attempt;

  if v_attempt.id is null then
    raise exception 'SPEAKING_ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_attempt;
end;
$$;

-- Closes the session and records the practice day on the same atomic path.
create or replace function public.close_speaking_session(
  p_session_id uuid,
  p_status text
)
returns public.speaking_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.speaking_sessions;
  v_total_seconds integer;
  v_today date := timezone('utc', now())::date;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('completed', 'abandoned') then
    raise exception 'Invalid session status' using errcode = '22023';
  end if;

  select *
  into v_session
  from public.speaking_sessions
  where id = p_session_id
    and user_id = v_user_id
  for update;

  if v_session.id is null then
    raise exception 'SPEAKING_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_session.status <> 'in_progress' then
    return v_session;
  end if;

  v_total_seconds := coalesce((
    select sum(duration_seconds)
    from public.speaking_attempts
    where session_id = p_session_id
  ), 0);

  update public.speaking_sessions
  set
    status = p_status,
    completed_at = now(),
    updated_at = now()
  where id = p_session_id
    and user_id = v_user_id
  returning * into v_session;

  if p_status = 'completed' then
    insert into public.user_practice_days (
      user_id,
      practice_date,
      practice_seconds,
      sources
    )
    values (
      v_user_id,
      v_today,
      least(v_total_seconds, 86400),
      array['speaking']
    )
    on conflict (user_id, practice_date)
    do update set
      practice_seconds = least(
        public.user_practice_days.practice_seconds + excluded.practice_seconds,
        86400
      ),
      sources = case
        when public.user_practice_days.sources @> array['speaking']::text[]
          then public.user_practice_days.sources
        else public.user_practice_days.sources || array['speaking']::text[]
      end,
      updated_at = now();
  end if;

  return v_session;
end;
$$;

-- 7. Service-role RPCs: transcription ----------------------------------------
create or replace function public.claim_speaking_transcription(
  p_attempt_id uuid,
  p_user_id uuid,
  p_attempt_number integer,
  p_transcription_attempt_id uuid
)
returns public.speaking_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.speaking_attempts;
  v_request_count integer;
  v_requested_seconds integer;
begin
  if p_attempt_id is null or p_user_id is null or p_transcription_attempt_id is null then
    raise exception 'SPEAKING_TRANSCRIPTION_INVALID_CLAIM' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('speaking-transcription:' || p_user_id::text, 0)
  );

  select *
  into v_attempt
  from public.speaking_attempts
  where id = p_attempt_id
    and user_id = p_user_id
  for update;

  if v_attempt.id is null then
    raise exception 'SPEAKING_TRANSCRIPTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_attempt.transcription_status = 'completed'
    and nullif(btrim(v_attempt.transcript), '') is not null
  then
    raise exception 'SPEAKING_TRANSCRIPTION_ALREADY_COMPLETED' using errcode = 'P0001';
  end if;

  if v_attempt.audio_path is null or v_attempt.duration_seconds is null then
    raise exception 'SPEAKING_TRANSCRIPTION_AUDIO_NOT_ATTACHED' using errcode = 'P0001';
  end if;

  if not v_attempt.transcription_retryable then
    raise exception 'SPEAKING_TRANSCRIPTION_RECORDING_REQUIRED' using errcode = 'P0001';
  end if;

  if v_attempt.transcription_status = 'processing'
    and v_attempt.transcription_started_at is not null
    and v_attempt.transcription_started_at > now() - interval '8 minutes'
  then
    raise exception 'SPEAKING_TRANSCRIPTION_ALREADY_PROCESSING' using errcode = 'P0001';
  end if;

  if v_attempt.transcription_status = 'processing' then
    update public.speaking_transcription_requests
    set
      status = 'failed',
      error_code = 'lease_expired',
      completed_at = now()
    where id = v_attempt.transcription_attempt_id
      and status = 'processing';

    if v_attempt.transcription_attempt_count >= 3 then
      update public.speaking_attempts
      set
        transcription_status = 'failed',
        transcription_error = 'attempt_limit_reached: Record a new answer to retry.',
        transcription_retryable = false
      where id = p_attempt_id
        and user_id = p_user_id
      returning * into v_attempt;

      return v_attempt;
    end if;
  end if;

  if v_attempt.transcription_attempt_count >= 3 then
    raise exception 'SPEAKING_TRANSCRIPTION_ATTEMPT_LIMIT' using errcode = 'P0001';
  end if;

  select
    count(*)::integer,
    coalesce(sum(duration_seconds), 0)::integer
  into v_request_count, v_requested_seconds
  from public.speaking_transcription_requests
  where user_id = p_user_id
    and created_at >= now() - interval '24 hours';

  if v_request_count >= 50
    or v_requested_seconds + 120 > 3600
  then
    raise exception 'SPEAKING_TRANSCRIPTION_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  update public.speaking_attempts
  set
    transcription_status = 'processing',
    transcription_error = null,
    transcription_retryable = true,
    transcription_attempt_count = transcription_attempt_count + 1,
    transcription_attempt_id = p_transcription_attempt_id,
    transcription_started_at = now(),
    transcription_completed_at = null,
    transcription_model = null,
    transcription_provider_request_id = null
  where id = p_attempt_id
    and user_id = p_user_id
  returning * into v_attempt;

  insert into public.speaking_transcription_requests (
    id,
    user_id,
    attempt_id,
    audio_path,
    audio_generation,
    duration_seconds
  )
  values (
    p_transcription_attempt_id,
    p_user_id,
    p_attempt_id,
    v_attempt.audio_path,
    v_attempt.audio_generation,
    120
  );

  return v_attempt;
end;
$$;

create or replace function public.verify_speaking_audio(
  p_attempt_id uuid,
  p_user_id uuid,
  p_transcription_attempt_id uuid,
  p_audio_sha256 text,
  p_duration_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.speaking_attempts;
  v_matching_attempts integer;
begin
  if p_audio_sha256 is null
    or p_audio_sha256 !~ '^[0-9a-f]{64}$'
    or p_duration_seconds is null
    or p_duration_seconds not between 1 and 120
  then
    raise exception 'SPEAKING_TRANSCRIPTION_INVALID_MEDIA' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('speaking-transcription-verify:' || p_user_id::text, 0)
  );

  select *
  into v_attempt
  from public.speaking_attempts
  where id = p_attempt_id
    and user_id = p_user_id
    and transcription_status = 'processing'
    and transcription_attempt_id = p_transcription_attempt_id
  for update;

  if v_attempt.id is null then
    raise exception 'SPEAKING_TRANSCRIPTION_ATTEMPT_SUPERSEDED' using errcode = 'P0001';
  end if;

  update public.speaking_transcription_requests
  set
    audio_sha256 = p_audio_sha256,
    duration_seconds = p_duration_seconds
  where id = p_transcription_attempt_id
    and user_id = p_user_id
    and attempt_id = p_attempt_id
    and audio_generation = v_attempt.audio_generation;

  if not found then
    raise exception 'SPEAKING_TRANSCRIPTION_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*)::integer
  into v_matching_attempts
  from public.speaking_transcription_requests
  where user_id = p_user_id
    and audio_sha256 = p_audio_sha256;

  if v_matching_attempts > 3 then
    update public.speaking_attempts
    set
      audio_sha256 = p_audio_sha256,
      duration_seconds = p_duration_seconds,
      transcription_status = 'failed',
      transcription_error = 'attempt_limit_reached: Record a new answer to retry.',
      transcription_retryable = false
    where id = p_attempt_id
      and user_id = p_user_id;

    update public.speaking_transcription_requests
    set
      status = 'failed',
      error_code = 'content_attempt_limit',
      completed_at = now()
    where id = p_transcription_attempt_id;

    return false;
  end if;

  update public.speaking_attempts
  set
    audio_sha256 = p_audio_sha256,
    duration_seconds = p_duration_seconds
  where id = p_attempt_id
    and user_id = p_user_id;

  return true;
end;
$$;

create or replace function public.complete_speaking_transcription(
  p_attempt_id uuid,
  p_user_id uuid,
  p_transcription_attempt_id uuid,
  p_transcript text,
  p_duration_seconds integer,
  p_word_count integer,
  p_speaking_pace integer,
  p_audio_sha256 text,
  p_model text,
  p_provider_request_id text
)
returns public.speaking_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.speaking_attempts;
begin
  if nullif(btrim(p_transcript), '') is null
    or p_duration_seconds is null
    or p_duration_seconds not between 1 and 120
    or p_word_count is null
    or p_word_count < 1
    or p_speaking_pace is null
    or p_speaking_pace < 0
    or p_audio_sha256 is null
    or p_audio_sha256 !~ '^[0-9a-f]{64}$'
    or nullif(btrim(p_model), '') is null
  then
    raise exception 'SPEAKING_TRANSCRIPTION_INVALID_RESULT' using errcode = '22023';
  end if;

  update public.speaking_attempts
  set
    transcript = btrim(p_transcript),
    duration_seconds = p_duration_seconds,
    word_count = p_word_count,
    speaking_pace = p_speaking_pace,
    audio_sha256 = p_audio_sha256,
    transcription_status = 'completed',
    transcription_error = null,
    transcription_retryable = true,
    transcription_completed_at = now(),
    transcription_model = left(p_model, 160),
    transcription_provider_request_id = left(p_provider_request_id, 255)
  where id = p_attempt_id
    and user_id = p_user_id
    and transcription_status = 'processing'
    and transcription_attempt_id = p_transcription_attempt_id
    and audio_sha256 = p_audio_sha256
  returning * into v_attempt;

  if v_attempt.id is null then
    raise exception 'SPEAKING_TRANSCRIPTION_ATTEMPT_SUPERSEDED' using errcode = 'P0001';
  end if;

  update public.speaking_transcription_requests
  set
    status = 'completed',
    model = left(p_model, 160),
    provider_request_id = left(p_provider_request_id, 255),
    completed_at = now()
  where id = p_transcription_attempt_id
    and user_id = p_user_id
    and attempt_id = p_attempt_id;

  return v_attempt;
end;
$$;

create or replace function public.fail_speaking_transcription(
  p_attempt_id uuid,
  p_user_id uuid,
  p_transcription_attempt_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
)
returns public.speaking_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.speaking_attempts;
begin
  update public.speaking_attempts
  set
    transcription_status = 'failed',
    transcription_error = left(
      coalesce(nullif(btrim(p_error_code), ''), 'transcription_failed')
      || ': '
      || coalesce(nullif(btrim(p_error_message), ''), 'Transcription failed'),
      1000
    ),
    transcription_retryable = coalesce(p_retryable, false)
      and transcription_attempt_count < 3
  where id = p_attempt_id
    and user_id = p_user_id
    and transcription_status = 'processing'
    and transcription_attempt_id = p_transcription_attempt_id
  returning * into v_attempt;

  if v_attempt.id is null then
    return null;
  end if;

  update public.speaking_transcription_requests
  set
    status = 'failed',
    error_code = left(
      coalesce(nullif(btrim(p_error_code), ''), 'transcription_failed'),
      160
    ),
    completed_at = now()
  where id = p_transcription_attempt_id
    and user_id = p_user_id
    and attempt_id = p_attempt_id;

  return v_attempt;
end;
$$;

-- 8. Service-role RPCs: evaluation -------------------------------------------
create or replace function public.claim_speaking_evaluation(
  p_attempt_id uuid,
  p_user_id uuid,
  p_evaluation_attempt_id uuid,
  p_evaluation_version text,
  p_model text
)
returns public.speaking_feedback
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.speaking_attempts;
  v_session public.speaking_sessions;
  v_feedback public.speaking_feedback;
  v_exists boolean := false;
  v_daily_requests integer;
begin
  if p_attempt_id is null or p_user_id is null or p_evaluation_attempt_id is null
    or p_evaluation_version is null
    or p_evaluation_version !~ '^[a-zA-Z0-9._-]{1,40}$'
    or nullif(btrim(p_model), '') is null
  then
    raise exception 'SPEAKING_EVALUATION_INVALID_CLAIM' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('speaking-evaluation-quota:' || p_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'speaking-evaluation:' || p_attempt_id::text || ':' || p_evaluation_version,
      0
    )
  );

  select attempt
  into v_attempt
  from public.speaking_attempts as attempt
  join public.speaking_sessions as session
    on session.id = attempt.session_id
    and session.user_id = attempt.user_id
  where attempt.id = p_attempt_id
    and attempt.user_id = p_user_id
  for update of attempt, session;

  if v_attempt.id is null then
    raise exception 'SPEAKING_EVALUATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
  into v_session
  from public.speaking_sessions
  where id = v_attempt.session_id
    and user_id = p_user_id;

  update public.speaking_sessions
  set
    evaluation_version = p_evaluation_version,
    updated_at = now()
  where id = v_attempt.session_id
    and user_id = p_user_id
    and evaluation_version <> p_evaluation_version;

  if v_attempt.transcription_status <> 'completed'
    or nullif(btrim(v_attempt.transcript), '') is null
  then
    raise exception 'SPEAKING_EVALUATION_TRANSCRIPT_REQUIRED' using errcode = 'P0001';
  end if;

  select *
  into v_feedback
  from public.speaking_feedback
  where attempt_id = p_attempt_id
    and evaluation_version = p_evaluation_version
  for update;
  v_exists := found;

  if v_exists
    and v_feedback.evaluation_status = 'completed'
    and v_feedback.source_transcript_sha256 =
      public.answer_evaluation_source_hash(p_attempt_id, p_user_id)
    and v_feedback.evaluation_model = p_model
  then
    return v_feedback;
  end if;

  if v_exists
    and v_feedback.evaluation_status = 'processing'
    and v_feedback.evaluation_started_at > now() - interval '8 minutes'
  then
    raise exception 'SPEAKING_EVALUATION_ALREADY_PROCESSING' using errcode = 'P0001';
  end if;

  if v_exists and v_feedback.evaluation_status = 'processing' then
    update public.speaking_evaluation_requests
    set status = 'failed', error_code = 'LEASE_EXPIRED', completed_at = now()
    where id = v_feedback.evaluation_attempt_id
      and status = 'processing';

    if v_feedback.evaluation_attempt_count >= 3 then
      update public.speaking_feedback
      set
        evaluation_status = 'failed',
        evaluation_retryable = false,
        evaluation_error = 'ATTEMPT_LIMIT: Record a new answer to retry.'
      where id = v_feedback.id
      returning * into v_feedback;
      return v_feedback;
    end if;
  end if;

  if not v_exists then
    insert into public.speaking_feedback (
      attempt_id,
      user_id,
      attempt_number,
      evaluation_version,
      source_audio_generation,
      source_transcript_sha256
    ) values (
      p_attempt_id,
      p_user_id,
      v_attempt.attempt_number,
      p_evaluation_version,
      v_attempt.audio_generation,
      public.answer_evaluation_source_hash(p_attempt_id, p_user_id)
    )
    returning * into v_feedback;
  end if;

  if not v_feedback.evaluation_retryable then
    raise exception 'SPEAKING_EVALUATION_RECORDING_REQUIRED' using errcode = 'P0001';
  end if;
  if v_feedback.evaluation_attempt_count >= 3 then
    raise exception 'SPEAKING_EVALUATION_ATTEMPT_LIMIT' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_daily_requests
  from public.speaking_evaluation_requests
  where user_id = p_user_id
    and created_at >= now() - interval '24 hours';

  if v_daily_requests >= 120 then
    raise exception 'SPEAKING_EVALUATION_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  update public.speaking_feedback
  set
    evaluation_status = 'processing',
    evaluation_model = left(p_model, 160),
    evaluation_retryable = true,
    evaluation_error = null,
    evaluation_attempt_count = evaluation_attempt_count + 1,
    evaluation_attempt_id = p_evaluation_attempt_id,
    evaluation_started_at = now(),
    evaluated_at = null,
    provider_request_id = null,
    ai_input_tokens = null,
    ai_output_tokens = null
  where id = v_feedback.id
  returning * into v_feedback;

  insert into public.speaking_evaluation_requests (
    id,
    user_id,
    attempt_id,
    evaluation_version,
    model
  ) values (
    p_evaluation_attempt_id,
    p_user_id,
    p_attempt_id,
    p_evaluation_version,
    left(p_model, 160)
  );

  return v_feedback;
end;
$$;

create or replace function public.complete_speaking_evaluation(
  p_attempt_id uuid,
  p_user_id uuid,
  p_evaluation_attempt_id uuid,
  p_evaluation_version text,
  p_source_audio_generation integer,
  p_clarity_score integer,
  p_fluency_score integer,
  p_grammar_score integer,
  p_vocabulary_score integer,
  p_structure_score integer,
  p_conciseness_score integer,
  p_feedback_summary text,
  p_strengths jsonb,
  p_improvements jsonb,
  p_grammar_corrections jsonb,
  p_natural_phrasing jsonb,
  p_better_version text,
  p_filler_words jsonb,
  p_model text,
  p_provider_request_id text,
  p_ai_input_tokens integer,
  p_ai_output_tokens integer
)
returns public.speaking_feedback
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feedback public.speaking_feedback;
  v_overall integer;
begin
  if p_clarity_score is null or p_clarity_score not between 0 and 100
    or p_fluency_score is null or p_fluency_score not between 0 and 100
    or p_grammar_score is null or p_grammar_score not between 0 and 100
    or p_vocabulary_score is null or p_vocabulary_score not between 0 and 100
    or p_structure_score is null or p_structure_score not between 0 and 100
    or p_conciseness_score is null or p_conciseness_score not between 0 and 100
    or nullif(btrim(p_feedback_summary), '') is null
    or nullif(btrim(p_better_version), '') is null
    or p_strengths is null
    or jsonb_typeof(p_strengths) <> 'array'
    or jsonb_array_length(p_strengths) not between 1 and 3
    or p_improvements is null
    or jsonb_typeof(p_improvements) <> 'array'
    or jsonb_array_length(p_improvements) not between 1 and 3
    or p_grammar_corrections is null
    or jsonb_typeof(p_grammar_corrections) <> 'array'
    or jsonb_array_length(p_grammar_corrections) not between 1 and 5
    or p_natural_phrasing is null
    or jsonb_typeof(p_natural_phrasing) <> 'array'
    or jsonb_array_length(p_natural_phrasing) not between 1 and 5
    or p_filler_words is null
    or jsonb_typeof(p_filler_words) <> 'array'
    or nullif(btrim(p_model), '') is null
    or (p_ai_input_tokens is not null and p_ai_input_tokens < 0)
    or (p_ai_output_tokens is not null and p_ai_output_tokens < 0)
  then
    raise exception 'SPEAKING_EVALUATION_INVALID_RESULT' using errcode = '22023';
  end if;

  v_overall := round(
    p_clarity_score * 0.25
    + p_fluency_score * 0.20
    + p_grammar_score * 0.15
    + p_vocabulary_score * 0.15
    + p_structure_score * 0.15
    + p_conciseness_score * 0.10
  );

  update public.speaking_feedback as feedback
  set
    overall_score = v_overall,
    clarity_score = p_clarity_score,
    fluency_score = p_fluency_score,
    grammar_score = p_grammar_score,
    vocabulary_score = p_vocabulary_score,
    structure_score = p_structure_score,
    conciseness_score = p_conciseness_score,
    feedback_summary = btrim(p_feedback_summary),
    strengths = p_strengths,
    improvements = p_improvements,
    grammar_corrections = p_grammar_corrections,
    natural_phrasing = p_natural_phrasing,
    better_version = btrim(p_better_version),
    filler_words = p_filler_words,
    evaluation_status = 'completed',
    evaluation_model = left(p_model, 160),
    evaluation_retryable = true,
    evaluation_error = null,
    evaluated_at = now(),
    provider_request_id = left(p_provider_request_id, 255),
    ai_input_tokens = p_ai_input_tokens,
    ai_output_tokens = p_ai_output_tokens
  where feedback.attempt_id = p_attempt_id
    and feedback.evaluation_version = p_evaluation_version
    and feedback.evaluation_status = 'processing'
    and feedback.evaluation_attempt_id = p_evaluation_attempt_id
    and feedback.source_audio_generation = p_source_audio_generation
    and exists (
      select 1
      from public.speaking_attempts as attempt
      where attempt.id = p_attempt_id
        and attempt.user_id = p_user_id
        and attempt.audio_generation = p_source_audio_generation
        and attempt.transcription_status = 'completed'
        and feedback.source_transcript_sha256 = public.answer_evaluation_source_hash(
          p_attempt_id,
          p_user_id
        )
    )
  returning * into v_feedback;

  if v_feedback.id is null then
    raise exception 'SPEAKING_EVALUATION_SUPERSEDED' using errcode = 'P0001';
  end if;

  update public.speaking_evaluation_requests
  set
    status = 'completed',
    provider_request_id = left(p_provider_request_id, 255),
    ai_input_tokens = p_ai_input_tokens,
    ai_output_tokens = p_ai_output_tokens,
    completed_at = now()
  where id = p_evaluation_attempt_id
    and user_id = p_user_id
    and attempt_id = p_attempt_id;

  return v_feedback;
end;
$$;

create or replace function public.fail_speaking_evaluation(
  p_attempt_id uuid,
  p_user_id uuid,
  p_evaluation_attempt_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
)
returns public.speaking_feedback
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feedback public.speaking_feedback;
begin
  update public.speaking_feedback
  set
    evaluation_status = 'failed',
    evaluation_error = left(
      coalesce(nullif(btrim(p_error_code), ''), 'UNKNOWN')
      || ': '
      || coalesce(nullif(btrim(p_error_message), ''), 'Evaluation failed'),
      1000
    ),
    evaluation_retryable = coalesce(p_retryable, false)
      and evaluation_attempt_count < 3
  where attempt_id = p_attempt_id
    and evaluation_attempt_id = p_evaluation_attempt_id
    and evaluation_status = 'processing'
    and exists (
      select 1
      from public.speaking_attempts as attempt
      where attempt.id = p_attempt_id
        and attempt.user_id = p_user_id
    )
  returning * into v_feedback;

  if v_feedback.id is null then
    return null;
  end if;

  update public.speaking_evaluation_requests
  set
    status = 'failed',
    error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'UNKNOWN'), 160),
    completed_at = now()
  where id = p_evaluation_attempt_id
    and user_id = p_user_id;

  return v_feedback;
end;
$$;

-- 9. Read RPCs ---------------------------------------------------------------

-- One owner-scoped payload for the session screen and Speaking results.
create or replace function public.get_speaking_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.speaking_sessions;
  v_attempts jsonb;
  v_tip text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into v_session
  from public.speaking_sessions
  where id = p_session_id
    and user_id = v_user_id;

  if v_session.id is null then
    raise exception 'SPEAKING_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(attempt_result order by attempt_number), '[]'::jsonb)
  into v_attempts
  from (
    select
      attempt.attempt_number,
      jsonb_build_object(
        'attemptNumber', attempt.attempt_number,
        'attemptId', attempt.id,
        'transcript', attempt.transcript,
        'durationSeconds', attempt.duration_seconds,
        'wordCount', attempt.word_count,
        'speakingPace', attempt.speaking_pace,
        'transcriptionStatus', attempt.transcription_status,
        'evaluationStatus', coalesce(feedback.evaluation_status, 'unavailable'),
        'score', feedback.overall_score,
        'scores', jsonb_build_object(
          'clarity', feedback.clarity_score,
          'fluency', feedback.fluency_score,
          'grammar', feedback.grammar_score,
          'vocabulary', feedback.vocabulary_score,
          'structure', feedback.structure_score,
          'conciseness', feedback.conciseness_score
        ),
        'summary', feedback.feedback_summary,
        'strengths', coalesce(feedback.strengths, '[]'::jsonb),
        'improvements', coalesce(feedback.improvements, '[]'::jsonb),
        'grammarCorrections', coalesce(feedback.grammar_corrections, '[]'::jsonb),
        'naturalPhrasing', coalesce(feedback.natural_phrasing, '[]'::jsonb),
        'betterVersion', feedback.better_version,
        'fillerWords', coalesce(feedback.filler_words, '[]'::jsonb)
      ) as attempt_result
    from public.speaking_attempts as attempt
    left join public.speaking_feedback as feedback
      on feedback.attempt_id = attempt.id
      and feedback.evaluation_version = v_session.evaluation_version
    where attempt.session_id = p_session_id
      and attempt.user_id = v_user_id
  ) as ordered_attempts;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'category', v_session.category,
      'promptId', v_session.prompt_id,
      'promptText', v_session.prompt_text,
      'promptTip', v_session.prompt_tip,
      'difficulty', v_session.difficulty,
      'timeLimitSeconds', v_session.time_limit_seconds,
      'status', v_session.status,
      'createdAt', v_session.created_at,
      'completedAt', v_session.completed_at
    ),
    'attempts', v_attempts
  );
end;
$$;

-- Recent completed speaking sessions for the Progress screen.
create or replace function public.get_speaking_history()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(item order by completed_at desc), '[]'::jsonb)
  into v_result
  from (
    select
      session.id,
      session.category,
      session.prompt_text,
      session.prompt_tip,
      session.difficulty,
      session.time_limit_seconds,
      session.created_at,
      session.completed_at,
      (
        select jsonb_build_object(
          'attemptCount', count(*),
          'bestScore', max(best_feedback.overall_score),
          'lastScore', (
            select overall_score
            from public.speaking_feedback as last_feedback
            where last_feedback.attempt_id in (
              select attempt.id
              from public.speaking_attempts as attempt
              where attempt.session_id = session.id
            )
            order by last_feedback.evaluated_at desc
            limit 1
          )
        )
        from public.speaking_attempts as attempt
        left join public.speaking_feedback as best_feedback
          on best_feedback.attempt_id = attempt.id
          and best_feedback.evaluation_status = 'completed'
        where attempt.session_id = session.id
      ) as summary
    from public.speaking_sessions as session
    where session.user_id = v_user_id
      and session.status = 'completed'
      and session.completed_at is not null
    order by session.completed_at desc
    limit 10
  ) as item;

  return v_result;
end;
$$;

-- 10. Practice days and streak ------------------------------------------------
create table if not exists public.user_practice_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  practice_date date not null,
  practice_seconds integer not null default 0 check (practice_seconds between 0 and 86400),
  sources text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_practice_days_pk primary key (user_id, practice_date),
  constraint user_practice_days_sources_check check (
    sources <@ array['interview', 'speaking']::text[]
  )
);

alter table public.user_practice_days enable row level security;

drop policy if exists "user_practice_days_select_own" on public.user_practice_days;
create policy "user_practice_days_select_own"
on public.user_practice_days for select
to authenticated
using (user_id = (select auth.uid()));

-- Records are upserted only through record_practice_day / session closure.
revoke insert, update, delete on public.user_practice_days from anon, authenticated;
grant all privileges on public.user_practice_days to service_role;

-- Back-fill practice days from completed interview sessions so the streak and
-- daily-goal panels include pre-feature practice.
insert into public.user_practice_days (
  user_id,
  practice_date,
  practice_seconds,
  sources
)
select
  session.user_id,
  timezone('utc', session.completed_at)::date as practice_day,
  least(coalesce(sum(session.duration_seconds), 0), 86400),
  array['interview']::text[]
from public.interview_sessions as session
where session.status = 'completed'
  and session.completed_at is not null
  and not exists (
    select 1
    from public.user_practice_days as existing_day
    where existing_day.user_id = session.user_id
      and existing_day.practice_date = timezone('utc', session.completed_at)::date
      and existing_day.sources @> array['interview']::text[]
  )
group by session.user_id, practice_day
on conflict (user_id, practice_date) do update
set
  practice_seconds = least(
    public.user_practice_days.practice_seconds + excluded.practice_seconds,
    86400
  ),
  sources = case
    when public.user_practice_days.sources @> array['interview']::text[]
      then public.user_practice_days.sources
    else public.user_practice_days.sources || array['interview']::text[]
  end,
  updated_at = now();

-- Records a practice day from the client (uses the user's local calendar date).
create or replace function public.record_practice_day(
  p_practice_date date,
  p_practice_seconds integer,
  p_source text
)
returns public.user_practice_days
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_day public.user_practice_days;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_practice_date is null or p_source is null
    or p_source not in ('interview', 'speaking')
    or p_practice_seconds is null
    or p_practice_seconds not between 0 and 86400
  then
    raise exception 'Invalid practice day' using errcode = '22023';
  end if;

  insert into public.user_practice_days (
    user_id,
    practice_date,
    practice_seconds,
    sources
  )
  values (
    v_user_id,
    p_practice_date,
    least(p_practice_seconds, 86400),
    array[p_source]::text[]
  )
  on conflict (user_id, practice_date)
  do update set
    practice_seconds = least(
      public.user_practice_days.practice_seconds + excluded.practice_seconds,
      86400
    ),
    sources = case
      when public.user_practice_days.sources @> excluded.sources
        then public.user_practice_days.sources
      else public.user_practice_days.sources || excluded.sources
    end,
    updated_at = now()
  returning * into v_day;

  return v_day;
end;
$$;

-- Unified streak + daily-goal source: speaking practice days plus days with a
-- completed interview session. Streak counts consecutive calendar days ending
-- today (or yesterday, so an unfinished today does not break it).
create or replace function public.get_user_practice_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_current_streak integer := 0;
  v_longest_streak integer := 0;
  v_today_seconds integer;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  with practice_days as (
    select distinct days.practice_day
    from (
      select timezone('utc', completed_at)::date as practice_day
      from public.interview_sessions
      where user_id = v_user_id
        and status = 'completed'
        and completed_at is not null
      union
      select practice_date
      from public.user_practice_days
      where user_id = v_user_id
    ) as days
  ),
  ordered_days as (
    select
      practice_day,
      practice_day - (row_number() over (order by practice_day))::integer as streak_group
    from practice_days
    where practice_day >= current_date - interval '400 days'
  ),
  streak_runs as (
    select
      streak_group,
      count(*)::integer as run_length,
      max(practice_day) as run_end
    from ordered_days
    group by streak_group
  )
  select
    coalesce(max(
      case
        when run_end = current_date or run_end = current_date - 1
          then run_length
        else 0
      end
    ), 0)::integer,
    coalesce(max(run_length), 0)::integer
  into v_current_streak, v_longest_streak
  from streak_runs;

  select
    coalesce((
      select sum(practice_seconds)
      from public.user_practice_days
      where user_id = v_user_id
        and practice_date = current_date
    ), 0)::integer
    + coalesce((
      select sum(duration_seconds)
      from public.interview_sessions
      where user_id = v_user_id
        and status = 'completed'
        and timezone('utc', completed_at)::date = current_date
    ), 0)::integer
  into v_today_seconds;

  select jsonb_build_object(
    'currentStreak', v_current_streak,
    'longestStreak', v_longest_streak,
    'todaySeconds', v_today_seconds,
    'practiceDays', coalesce((
      select jsonb_agg(practice_day order by practice_day)
      from (
        select distinct days.practice_day
        from (
          select timezone('utc', completed_at)::date as practice_day
          from public.interview_sessions
          where user_id = v_user_id
            and status = 'completed'
            and completed_at is not null
          union
          select practice_date
          from public.user_practice_days
          where user_id = v_user_id
        ) as days
      ) as all_days
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- 11. Grants ------------------------------------------------------------------
revoke all on function public.reserve_speaking_attempt(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.reserve_speaking_attempt(uuid, uuid, uuid)
  to authenticated;

revoke all on function public.attach_speaking_audio(uuid, text, integer, text, integer)
  from public, anon;
grant execute on function public.attach_speaking_audio(uuid, text, integer, text, integer)
  to authenticated;

revoke all on function public.close_speaking_session(uuid, text)
  from public, anon;
grant execute on function public.close_speaking_session(uuid, text)
  to authenticated;

revoke all on function public.record_practice_day(date, integer, text)
  from public, anon;
grant execute on function public.record_practice_day(date, integer, text)
  to authenticated;

revoke all on function public.get_speaking_session(uuid) from public, anon;
grant execute on function public.get_speaking_session(uuid) to authenticated;

revoke all on function public.get_speaking_history() from public, anon;
grant execute on function public.get_speaking_history() to authenticated;

revoke all on function public.get_user_practice_summary() from public, anon;
grant execute on function public.get_user_practice_summary() to authenticated;

revoke all on function public.claim_speaking_transcription(uuid, uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_speaking_transcription(uuid, uuid, integer, uuid)
  to service_role;

revoke all on function public.verify_speaking_audio(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.verify_speaking_audio(uuid, uuid, uuid, text, integer)
  to service_role;

revoke all on function public.complete_speaking_transcription(
  uuid, uuid, uuid, text, integer, integer, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.complete_speaking_transcription(
  uuid, uuid, uuid, text, integer, integer, integer, text, text, text
) to service_role;

revoke all on function public.fail_speaking_transcription(
  uuid, uuid, uuid, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.fail_speaking_transcription(
  uuid, uuid, uuid, text, text, boolean
) to service_role;

revoke all on function public.claim_speaking_evaluation(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_speaking_evaluation(uuid, uuid, uuid, text, text)
  to service_role;

revoke all on function public.complete_speaking_evaluation(
  uuid, uuid, uuid, text, integer,
  integer, integer, integer, integer, integer, integer,
  text, jsonb, jsonb, jsonb, jsonb, text, jsonb, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.complete_speaking_evaluation(
  uuid, uuid, uuid, text, integer,
  integer, integer, integer, integer, integer, integer,
  text, jsonb, jsonb, jsonb, jsonb, text, jsonb, text, text, integer, integer
) to service_role;

revoke all on function public.fail_speaking_evaluation(uuid, uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.fail_speaking_evaluation(uuid, uuid, uuid, text, text, boolean)
  to service_role;

commit;
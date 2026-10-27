begin;

-- A two-minute mono AAC answer is normally around 1 MB. Five MB leaves
-- comfortable encoder headroom while rejecting unexpectedly large uploads.
alter table public.interview_answers
  add column if not exists transcription_status text not null default 'pending',
  add column if not exists transcription_error text,
  add column if not exists transcription_retryable boolean not null default true,
  add column if not exists transcription_attempt_count integer not null default 0,
  add column if not exists transcription_attempt_id uuid,
  add column if not exists transcription_started_at timestamptz,
  add column if not exists transcription_completed_at timestamptz,
  add column if not exists transcription_model text,
  add column if not exists transcription_provider_request_id text,
  add column if not exists audio_mime_type text,
  add column if not exists audio_size_bytes integer,
  add column if not exists audio_sha256 text,
  add column if not exists audio_generation integer not null default 0,
  add column if not exists audio_attached_at timestamptz;

update public.interview_answers
set
  transcription_status = 'completed',
  transcription_completed_at = coalesce(transcription_completed_at, updated_at),
  word_count = coalesce(
    word_count,
    cardinality(regexp_split_to_array(btrim(transcript), '\s+'))
  ),
  speaking_pace = coalesce(
    speaking_pace,
    case
      when duration_seconds is not null and duration_seconds > 0
        then round(
          cardinality(regexp_split_to_array(btrim(transcript), '\s+'))
          / (duration_seconds / 60.0),
          2
        )
      else 0
    end
  )
where nullif(btrim(transcript), '') is not null;

do $$
begin
  if exists (
    select 1
    from public.interview_answers
    where duration_seconds > 120
  ) then
    raise exception 'Migration 002 requires remediating interview_answers durations above 120 seconds';
  end if;

  if exists (
    select 1
    from public.interview_answers
    where char_length(audio_path) > 1024
  ) then
    raise exception 'Migration 002 requires remediating interview_answers audio paths above 1024 characters';
  end if;
end;
$$;

alter table public.interview_answers
  drop constraint if exists interview_answers_duration_check,
  add constraint interview_answers_duration_check check (
    duration_seconds is null or duration_seconds between 0 and 120
  ),
  drop constraint if exists interview_answers_transcription_status_check,
  add constraint interview_answers_transcription_status_check check (
    transcription_status in ('pending', 'processing', 'completed', 'failed')
  ),
  drop constraint if exists interview_answers_transcription_error_length_check,
  add constraint interview_answers_transcription_error_length_check check (
    transcription_error is null or char_length(transcription_error) <= 1000
  ),
  drop constraint if exists interview_answers_transcription_attempt_count_check,
  add constraint interview_answers_transcription_attempt_count_check check (
    transcription_attempt_count between 0 and 3
  ),
  drop constraint if exists interview_answers_transcription_model_length_check,
  add constraint interview_answers_transcription_model_length_check check (
    transcription_model is null or char_length(transcription_model) <= 160
  ),
  drop constraint if exists interview_answers_provider_request_id_length_check,
  add constraint interview_answers_provider_request_id_length_check check (
    transcription_provider_request_id is null
    or char_length(transcription_provider_request_id) <= 255
  ),
  drop constraint if exists interview_answers_audio_path_length_check,
  add constraint interview_answers_audio_path_length_check check (
    audio_path is null or char_length(audio_path) <= 1024
  ),
  drop constraint if exists interview_answers_audio_mime_check,
  add constraint interview_answers_audio_mime_check check (
    audio_mime_type is null
    or audio_mime_type in ('audio/mp4', 'audio/m4a', 'audio/x-m4a')
  ),
  drop constraint if exists interview_answers_audio_size_check,
  add constraint interview_answers_audio_size_check check (
    audio_size_bytes is null or audio_size_bytes between 1 and 5242880
  ),
  drop constraint if exists interview_answers_audio_sha256_check,
  add constraint interview_answers_audio_sha256_check check (
    audio_sha256 is null or audio_sha256 ~ '^[0-9a-f]{64}$'
  ),
  drop constraint if exists interview_answers_audio_generation_check,
  add constraint interview_answers_audio_generation_check check (
    audio_generation >= 0
  );

create index if not exists interview_answers_transcription_queue_idx
  on public.interview_answers (transcription_status, transcription_started_at)
  where transcription_status in ('pending', 'processing', 'failed');

-- Internal request ledger for rolling user quotas and provider reconciliation.
-- Mobile clients receive no privileges or RLS policies on this table.
create table if not exists public.transcription_requests (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer_id uuid references public.interview_answers (id) on delete set null,
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
  constraint transcription_requests_status_check check (
    status in ('processing', 'completed', 'failed')
  ),
  constraint transcription_requests_duration_check check (
    duration_seconds between 1 and 120
  ),
  constraint transcription_requests_generation_check check (audio_generation > 0),
  constraint transcription_requests_audio_sha256_check check (
    audio_sha256 is null or audio_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint transcription_requests_error_code_length_check check (
    error_code is null or char_length(error_code) <= 160
  ),
  constraint transcription_requests_model_length_check check (
    model is null or char_length(model) <= 160
  ),
  constraint transcription_requests_provider_id_length_check check (
    provider_request_id is null or char_length(provider_request_id) <= 255
  )
);

-- Repair a partial or older application of this migration: the ledger must
-- survive answer deletion (quotas and duplicate-content history).
alter table public.transcription_requests
  alter column answer_id drop not null;

alter table public.transcription_requests
  drop constraint if exists transcription_requests_answer_id_fkey,
  add constraint transcription_requests_answer_id_fkey
    foreign key (answer_id) references public.interview_answers (id)
    on delete set null;

create index if not exists transcription_requests_user_created_idx
  on public.transcription_requests (user_id, created_at desc);

alter table public.transcription_requests enable row level security;
revoke all on public.transcription_requests from public, anon, authenticated;
grant all privileges on public.transcription_requests to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'interview-audio',
  'interview-audio',
  false,
  5242880,
  array['audio/mp4', 'audio/m4a', 'audio/x-m4a']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "interview_audio_insert_own" on storage.objects;
create policy "interview_audio_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'interview-audio'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and cardinality(storage.foldername(name)) = 3
  and storage.extension(name) = 'm4a'
  and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.m4a$'
  and exists (
    select 1
    from public.interview_answers as answer
    where answer.id::text = (storage.foldername(name))[3]
      and answer.session_id::text = (storage.foldername(name))[2]
      and answer.user_id = (select auth.uid())
  )
);

drop policy if exists "interview_audio_select_own" on storage.objects;
create policy "interview_audio_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'interview-audio'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "interview_audio_update_own" on storage.objects;

drop policy if exists "interview_audio_delete_own" on storage.objects;
create policy "interview_audio_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'interview-audio'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and not exists (
    select 1
    from public.interview_answers as answer
    where answer.audio_path = name
      and answer.user_id = (select auth.uid())
  )
);

-- The client cannot mark an answer completed or attach an arbitrary path. This
-- function confirms the freshly uploaded private object before resetting the
-- answer to a transcribable state.
create or replace function public.attach_answer_audio(
  p_answer_id uuid,
  p_audio_path text,
  p_duration_seconds integer,
  p_audio_mime_type text,
  p_audio_size_bytes integer
)
returns public.interview_answers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_answer public.interview_answers;
  v_folders text[];
  v_object_size integer;
  v_object_mime_type text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into v_answer
  from public.interview_answers
  where id = p_answer_id
    and user_id = v_user_id
  for update;

  if v_answer.id is null then
    raise exception 'Answer not found' using errcode = 'P0002';
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
  if cardinality(v_folders) <> 3
    or v_folders[1] <> v_user_id::text
    or v_folders[2] <> v_answer.session_id::text
    or v_folders[3] <> v_answer.id::text
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
    where bucket_id = 'interview-audio'
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

  if v_answer.audio_path = p_audio_path then
    if v_answer.transcription_status = 'pending'
      and v_answer.transcription_attempt_count = 0
      and v_answer.transcript is null
      and v_answer.duration_seconds = p_duration_seconds
      and v_answer.audio_mime_type = v_object_mime_type
      and v_answer.audio_size_bytes = v_object_size
    then
      return v_answer;
    end if;

    raise exception 'ANSWER_AUDIO_ALREADY_ATTACHED' using errcode = 'P0001';
  end if;

  if v_answer.transcription_status = 'processing'
    and v_answer.transcription_started_at is not null
    and v_answer.transcription_started_at > now() - interval '8 minutes'
  then
    raise exception 'ANSWER_TRANSCRIPTION_IN_PROGRESS' using errcode = 'P0001';
  end if;

  if v_answer.transcription_status = 'processing' then
    update public.transcription_requests
    set
      status = 'failed',
      error_code = 'audio_replaced',
      completed_at = now()
    where id = v_answer.transcription_attempt_id
      and status = 'processing';
  end if;

  update public.interview_answers
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
  where id = p_answer_id
    and user_id = v_user_id
  returning * into v_answer;

  if v_answer.id is null then
    raise exception 'Answer no longer exists' using errcode = 'P0002';
  end if;

  return v_answer;
end;
$$;

-- Atomic lease and quota check. Only the Edge Function's service-role client
-- can execute this function; p_user_id always comes from its verified JWT.
create or replace function public.claim_answer_transcription(
  p_answer_id uuid,
  p_user_id uuid,
  p_attempt_id uuid
)
returns public.interview_answers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_answer public.interview_answers;
  v_request_count integer;
  v_requested_seconds integer;
begin
  if p_answer_id is null or p_user_id is null or p_attempt_id is null then
    raise exception 'TRANSCRIPTION_INVALID_CLAIM' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('transcription:' || p_user_id::text, 0)
  );

  select *
  into v_answer
  from public.interview_answers
  where id = p_answer_id
    and user_id = p_user_id
  for update;

  if v_answer.id is null then
    raise exception 'TRANSCRIPTION_ANSWER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_answer.transcription_status = 'completed'
    and nullif(btrim(v_answer.transcript), '') is not null
  then
    raise exception 'TRANSCRIPTION_ALREADY_COMPLETED' using errcode = 'P0001';
  end if;

  if v_answer.audio_path is null or v_answer.duration_seconds is null then
    raise exception 'TRANSCRIPTION_AUDIO_NOT_ATTACHED' using errcode = 'P0001';
  end if;

  if not v_answer.transcription_retryable then
    raise exception 'TRANSCRIPTION_RECORDING_REQUIRED' using errcode = 'P0001';
  end if;

  if v_answer.transcription_status = 'processing'
    and v_answer.transcription_started_at is not null
    and v_answer.transcription_started_at > now() - interval '8 minutes'
  then
    raise exception 'TRANSCRIPTION_ALREADY_PROCESSING' using errcode = 'P0001';
  end if;

  if v_answer.transcription_status = 'processing' then
    update public.transcription_requests
    set
      status = 'failed',
      error_code = 'lease_expired',
      completed_at = now()
    where id = v_answer.transcription_attempt_id
      and status = 'processing';

    if v_answer.transcription_attempt_count >= 3 then
      update public.interview_answers
      set
        transcription_status = 'failed',
        transcription_error = 'attempt_limit_reached: Record a new answer to retry.',
        transcription_retryable = false
      where id = p_answer_id
        and user_id = p_user_id
      returning * into v_answer;

      return v_answer;
    end if;
  end if;

  if v_answer.transcription_attempt_count >= 3 then
    raise exception 'TRANSCRIPTION_ATTEMPT_LIMIT' using errcode = 'P0001';
  end if;

  select
    count(*)::integer,
    coalesce(sum(duration_seconds), 0)::integer
  into v_request_count, v_requested_seconds
  from public.transcription_requests
  where user_id = p_user_id
    and created_at >= now() - interval '24 hours';

  if v_request_count >= 50
    or v_requested_seconds + 120 > 3600
  then
    raise exception 'TRANSCRIPTION_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  update public.interview_answers
  set
    transcription_status = 'processing',
    transcription_error = null,
    transcription_retryable = true,
    transcription_attempt_count = transcription_attempt_count + 1,
    transcription_attempt_id = p_attempt_id,
    transcription_started_at = now(),
    transcription_completed_at = null,
    transcription_model = null,
    transcription_provider_request_id = null
  where id = p_answer_id
    and user_id = p_user_id
  returning * into v_answer;

  insert into public.transcription_requests (
    id,
    user_id,
    answer_id,
    audio_path,
    audio_generation,
    duration_seconds
  )
  values (
    p_attempt_id,
    p_user_id,
    p_answer_id,
    v_answer.audio_path,
    v_answer.audio_generation,
    120
  );

  return v_answer;
end;
$$;

create or replace function public.verify_answer_audio(
  p_answer_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_audio_sha256 text,
  p_duration_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_answer public.interview_answers;
  v_matching_attempts integer;
begin
  if p_audio_sha256 is null
    or p_audio_sha256 !~ '^[0-9a-f]{64}$'
    or p_duration_seconds is null
    or p_duration_seconds not between 1 and 120
  then
    raise exception 'TRANSCRIPTION_INVALID_MEDIA' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('transcription-verify:' || p_user_id::text, 0)
  );

  select *
  into v_answer
  from public.interview_answers
  where id = p_answer_id
    and user_id = p_user_id
    and transcription_status = 'processing'
    and transcription_attempt_id = p_attempt_id
  for update;

  if v_answer.id is null then
    raise exception 'TRANSCRIPTION_ATTEMPT_SUPERSEDED' using errcode = 'P0001';
  end if;

  update public.transcription_requests
  set
    audio_sha256 = p_audio_sha256,
    duration_seconds = p_duration_seconds
  where id = p_attempt_id
    and user_id = p_user_id
    and answer_id = p_answer_id
    and audio_generation = v_answer.audio_generation;

  if not found then
    raise exception 'TRANSCRIPTION_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*)::integer
  into v_matching_attempts
  from public.transcription_requests
  where user_id = p_user_id
    and audio_sha256 = p_audio_sha256;

  if v_matching_attempts > 3 then
    update public.interview_answers
    set
      audio_sha256 = p_audio_sha256,
      duration_seconds = p_duration_seconds,
      transcription_status = 'failed',
      transcription_error = 'attempt_limit_reached: Record a new answer to retry.',
      transcription_retryable = false
    where id = p_answer_id
      and user_id = p_user_id;

    update public.transcription_requests
    set
      status = 'failed',
      error_code = 'content_attempt_limit',
      completed_at = now()
    where id = p_attempt_id;

    return false;
  end if;

  update public.interview_answers
  set
    audio_sha256 = p_audio_sha256,
    duration_seconds = p_duration_seconds
  where id = p_answer_id
    and user_id = p_user_id;

  return true;
end;
$$;

create or replace function public.complete_answer_transcription(
  p_answer_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_transcript text,
  p_duration_seconds integer,
  p_word_count integer,
  p_speaking_pace integer,
  p_audio_sha256 text,
  p_model text,
  p_provider_request_id text
)
returns public.interview_answers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_answer public.interview_answers;
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
    raise exception 'TRANSCRIPTION_INVALID_RESULT' using errcode = '22023';
  end if;

  update public.interview_answers
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
  where id = p_answer_id
    and user_id = p_user_id
    and transcription_status = 'processing'
    and transcription_attempt_id = p_attempt_id
    and audio_sha256 = p_audio_sha256
  returning * into v_answer;

  if v_answer.id is null then
    raise exception 'TRANSCRIPTION_ATTEMPT_SUPERSEDED' using errcode = 'P0001';
  end if;

  update public.transcription_requests
  set
    status = 'completed',
    model = left(p_model, 160),
    provider_request_id = left(p_provider_request_id, 255),
    completed_at = now()
  where id = p_attempt_id
    and user_id = p_user_id
    and answer_id = p_answer_id;

  return v_answer;
end;
$$;

create or replace function public.fail_answer_transcription(
  p_answer_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
)
returns public.interview_answers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_answer public.interview_answers;
begin
  update public.interview_answers
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
  where id = p_answer_id
    and user_id = p_user_id
    and transcription_status = 'processing'
    and transcription_attempt_id = p_attempt_id
  returning * into v_answer;

  if v_answer.id is null then
    return null;
  end if;

  update public.transcription_requests
  set
    status = 'failed',
    error_code = left(
      coalesce(nullif(btrim(p_error_code), ''), 'transcription_failed'),
      160
    ),
    completed_at = now()
  where id = p_attempt_id
    and user_id = p_user_id
    and answer_id = p_answer_id;

  return v_answer;
end;
$$;

-- UUIDs generated on-device make session/question creation safe to retry.
grant insert (id) on public.interview_sessions to authenticated;
grant insert (id) on public.interview_questions to authenticated;
grant insert (id) on public.interview_answers to authenticated;

revoke insert (audio_path, duration_seconds) on public.interview_answers from authenticated;
revoke update (audio_path, duration_seconds) on public.interview_answers from authenticated;

revoke all on function public.attach_answer_audio(uuid, text, integer, text, integer)
  from public, anon;
grant execute on function public.attach_answer_audio(uuid, text, integer, text, integer)
  to authenticated;

revoke all on function public.claim_answer_transcription(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_answer_transcription(uuid, uuid, uuid)
  to service_role;

revoke all on function public.complete_answer_transcription(
  uuid, uuid, uuid, text, integer, integer, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.complete_answer_transcription(
  uuid, uuid, uuid, text, integer, integer, integer, text, text, text
) to service_role;

revoke all on function public.verify_answer_audio(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.verify_answer_audio(uuid, uuid, uuid, text, integer)
  to service_role;

revoke all on function public.fail_answer_transcription(
  uuid, uuid, uuid, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.fail_answer_transcription(
  uuid, uuid, uuid, text, text, boolean
) to service_role;

commit;

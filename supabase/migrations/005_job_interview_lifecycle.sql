begin;

-- A generation request is claimed before provider work and later points to the
-- one persisted session it created. Retries reuse the same request id;
-- intentional regeneration uses a new one.
alter table public.job_generation_requests
  add column session_id uuid references public.interview_sessions (id) on delete set null,
  add column attempt_count integer not null default 1,
  add constraint job_generation_requests_attempt_count_check check (
    attempt_count between 1 and 3
  );

create index job_generation_requests_session_idx
  on public.job_generation_requests (session_id)
  where session_id is not null;

-- Analysis attempts are capped per analysis version, not for the lifetime of a
-- saved posting. The claim update sets the new version and this trigger resets
-- that version's first attempt atomically before constraints are checked.
create or replace function public.reset_job_analysis_attempts_for_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.analysis_version is distinct from old.analysis_version
    and new.analysis_status = 'processing'
  then
    new.analysis_attempt_count := 1;
  end if;
  return new;
end;
$$;

create trigger job_descriptions_reset_attempts_for_version
before update of analysis_version on public.job_descriptions
for each row execute function public.reset_job_analysis_attempts_for_version();

create or replace function public.job_interview_session_payload(
  p_session_id uuid,
  p_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', session.id,
      'role', session.role,
      'interviewType', session.interview_type,
      'difficulty', session.difficulty,
      'interviewerStyle', session.interviewer_style,
      'totalQuestions', session.total_questions,
      'status', session.status,
      'jobDescriptionId', session.job_description_id
    ),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', question.id,
          'questionNumber', question.question_number,
          'questionText', question.question_text,
          'questionType', question.question_type,
          'focusArea', question.focus_area,
          'difficulty', question.difficulty,
          'reason', question.generation_reason,
          'expectedTopics', question.expected_topics
        ) order by question.question_number
      )
      from public.interview_questions as question
      where question.session_id = session.id
    ), '[]'::jsonb)
  )
  from public.interview_sessions as session
  where session.id = p_session_id
    and session.user_id = p_user_id
    and session.interview_type = 'job_specific';
$$;

create or replace function public.claim_job_interview_generation(
  p_job_description_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_analysis_version text,
  p_model text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.job_descriptions;
  v_request public.job_generation_requests;
  v_request_exists boolean;
  v_daily_total integer;
  v_daily_interviews integer;
  v_existing jsonb;
begin
  if p_job_description_id is null or p_user_id is null or p_attempt_id is null
    or p_analysis_version is null
    or p_analysis_version !~ '^[a-zA-Z0-9._-]{1,40}$'
    or nullif(btrim(p_model), '') is null
  then
    raise exception 'JOB_INTERVIEW_INVALID_CLAIM' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job-quota:' || p_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job-interview:' || p_job_description_id::text, 0)
  );

  select *
  into v_request
  from public.job_generation_requests
  where id = p_attempt_id
  for update;
  v_request_exists := found;

  if v_request_exists then
    if v_request.user_id is distinct from p_user_id
      or v_request.job_description_id is distinct from p_job_description_id
      or v_request.generation_kind <> 'interview'
    then
      raise exception 'JOB_INTERVIEW_INVALID_CLAIM' using errcode = '22023';
    end if;

    if v_request.status = 'completed' and v_request.session_id is not null then
      v_existing := public.job_interview_session_payload(v_request.session_id, p_user_id);
      if v_existing is not null then
        return v_existing;
      end if;
      raise exception 'JOB_INTERVIEW_RESULT_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_request.status = 'processing'
      and v_request.created_at > now() - interval '8 minutes'
    then
      raise exception 'JOB_INTERVIEW_ALREADY_PROCESSING' using errcode = 'P0001';
    end if;

    if v_request.attempt_count >= 3 then
      raise exception 'JOB_INTERVIEW_ATTEMPT_LIMIT' using errcode = 'P0001';
    end if;
  end if;

  select *
  into v_job
  from public.job_descriptions
  where id = p_job_description_id
  for update;

  if v_job.id is null or v_job.user_id is distinct from p_user_id then
    raise exception 'JOB_DESCRIPTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_job.analysis_status <> 'completed'
    or v_job.analysis_version is distinct from p_analysis_version
    or not exists (
      select 1
      from public.job_analyses
      where job_description_id = p_job_description_id
        and user_id = p_user_id
        and analysis_version = p_analysis_version
    )
  then
    raise exception 'JOB_ANALYSIS_REQUIRED' using errcode = 'P0001';
  end if;

  if not v_request_exists then
    select
      count(*)::integer,
      count(*) filter (where generation_kind = 'interview')::integer
    into v_daily_total, v_daily_interviews
    from public.job_generation_requests
    where user_id = p_user_id
      and created_at >= now() - interval '24 hours';

    if v_daily_total >= 40 or v_daily_interviews >= 12 then
      raise exception 'JOB_INTERVIEW_DAILY_LIMIT' using errcode = 'P0001';
    end if;

    insert into public.job_generation_requests (
      id,
      user_id,
      job_description_id,
      generation_kind,
      model
    ) values (
      p_attempt_id,
      p_user_id,
      p_job_description_id,
      'interview',
      left(p_model, 160)
    );
  else
    update public.job_generation_requests
    set
      model = left(p_model, 160),
      status = 'processing',
      error_code = null,
      created_at = now(),
      completed_at = null,
      session_id = null,
      attempt_count = attempt_count + 1
    where id = p_attempt_id;
  end if;

  return null;
end;
$$;

create or replace function public.fail_job_interview_generation(
  p_job_description_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.job_generation_requests
  set
    status = 'failed',
    error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'UNKNOWN'), 160),
    completed_at = now()
  where id = p_attempt_id
    and user_id = p_user_id
    and job_description_id = p_job_description_id
    and generation_kind = 'interview'
    and status = 'processing';
end;
$$;

create or replace function public.create_job_interview_session(
  p_job_description_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_analysis_version text,
  p_model text,
  p_question_count integer,
  p_difficulty_mode text,
  p_interviewer_style text,
  p_session_difficulty text,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.job_descriptions;
  v_analysis public.job_analyses;
  v_session_id uuid;
  v_item jsonb;
  v_question_text text;
  v_question_type text;
  v_difficulty text;
  v_focus_area text;
  v_reason text;
  v_expected_topics jsonb;
  v_number_text text;
  v_number integer;
  v_seen_numbers integer[] := '{}'::integer[];
  v_question_count integer := 0;
begin
  if p_job_description_id is null or p_user_id is null or p_attempt_id is null
    or p_analysis_version is null
    or p_analysis_version !~ '^[a-zA-Z0-9._-]{1,40}$'
    or nullif(btrim(p_model), '') is null
    or p_question_count is null
    or p_question_count not between 5 and 12
    or p_difficulty_mode is null
    or p_difficulty_mode not in ('match', 'easier', 'harder')
    or p_interviewer_style is null
    or p_interviewer_style not in ('supportive', 'balanced', 'challenging')
    or p_session_difficulty is null
    or p_session_difficulty not in ('beginner', 'intermediate', 'advanced')
    or p_questions is null
    or jsonb_typeof(p_questions) <> 'array'
    or jsonb_array_length(p_questions) <> p_question_count
  then
    raise exception 'JOB_INTERVIEW_INVALID_INPUT' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job-interview:' || p_job_description_id::text, 0)
  );

  select *
  into v_job
  from public.job_descriptions
  where id = p_job_description_id
  for update;

  if v_job.id is null or v_job.user_id is distinct from p_user_id then
    raise exception 'JOB_DESCRIPTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_job.analysis_status <> 'completed' then
    raise exception 'JOB_ANALYSIS_REQUIRED' using errcode = 'P0001';
  end if;

  select *
  into v_analysis
  from public.job_analyses
  where job_description_id = p_job_description_id
    and user_id = p_user_id
    and analysis_version = p_analysis_version;

  if v_analysis.id is null then
    raise exception 'JOB_ANALYSIS_REQUIRED' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.job_generation_requests
    where id = p_attempt_id
      and user_id = p_user_id
      and job_description_id = p_job_description_id
      and generation_kind = 'interview'
      and status = 'processing'
  ) then
    raise exception 'JOB_INTERVIEW_CLAIM_REQUIRED' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_questions)
  loop
    v_question_count := v_question_count + 1;
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'JOB_INTERVIEW_INVALID_INPUT' using errcode = '22023';
    end if;

    v_question_text := nullif(btrim(v_item ->> 'questionText'), '');
    v_question_type := v_item ->> 'questionType';
    v_difficulty := v_item ->> 'difficulty';
    v_focus_area := nullif(btrim(coalesce(v_item ->> 'focusArea', '')), '');
    v_reason := nullif(btrim(coalesce(v_item ->> 'reason', '')), '');
    v_expected_topics := v_item -> 'expectedTopics';
    v_number_text := v_item ->> 'questionNumber';

    if v_number_text is null or v_number_text !~ '^[1-9][0-9]*$' then
      raise exception 'JOB_INTERVIEW_INVALID_INPUT' using errcode = '22023';
    end if;
    v_number := v_number_text::integer;

    if v_question_text is null
      or char_length(v_question_text) > 600
      or v_question_type is null
      or v_question_type not in (
        'introduction', 'behavioral', 'technical', 'situational', 'motivation', 'general'
      )
      or v_difficulty is null
      or v_difficulty not in ('beginner', 'intermediate', 'advanced')
      or v_focus_area is null
      or char_length(v_focus_area) > 120
      or v_reason is null
      or char_length(v_reason) > 400
      or v_number not between 1 and p_question_count
      or v_number = any(v_seen_numbers)
      or v_expected_topics is null
      or jsonb_typeof(v_expected_topics) <> 'array'
      or jsonb_array_length(v_expected_topics) not between 1 and 5
    then
      raise exception 'JOB_INTERVIEW_INVALID_INPUT' using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_expected_topics) as topic
      where jsonb_typeof(topic) <> 'string'
        or char_length(btrim(topic #>> '{}')) not between 1 and 40
    ) then
      raise exception 'JOB_INTERVIEW_INVALID_INPUT' using errcode = '22023';
    end if;

    v_seen_numbers := array_append(v_seen_numbers, v_number);
  end loop;

  if v_question_count <> p_question_count then
    raise exception 'JOB_INTERVIEW_INVALID_INPUT' using errcode = '22023';
  end if;

  insert into public.interview_sessions (
    user_id,
    role,
    interview_type,
    difficulty,
    interviewer_style,
    total_questions,
    status,
    job_description_id
  ) values (
    p_user_id,
    left(coalesce(nullif(btrim(v_analysis.detected_role), ''), 'Selected role'), 160),
    'job_specific',
    p_session_difficulty,
    p_interviewer_style,
    p_question_count,
    'created',
    p_job_description_id
  )
  returning id into v_session_id;

  insert into public.interview_questions (
    session_id,
    question_number,
    question_text,
    question_type,
    focus_area,
    generation_reason,
    expected_topics,
    difficulty,
    source
  )
  select
    v_session_id,
    (entry ->> 'questionNumber')::integer,
    btrim(entry ->> 'questionText'),
    entry ->> 'questionType',
    btrim(entry ->> 'focusArea'),
    btrim(entry ->> 'reason'),
    entry -> 'expectedTopics',
    entry ->> 'difficulty',
    'job_specific'
  from jsonb_array_elements(p_questions) as entry;

  update public.job_generation_requests
  set
    status = 'completed',
    session_id = v_session_id,
    error_code = null,
    completed_at = now()
  where id = p_attempt_id
    and user_id = p_user_id
    and job_description_id = p_job_description_id
    and generation_kind = 'interview'
    and status = 'processing';

  if not found then
    raise exception 'JOB_INTERVIEW_CLAIM_REQUIRED' using errcode = 'P0001';
  end if;

  return public.job_interview_session_payload(v_session_id, p_user_id);
end;
$$;

-- Narrow lifecycle transitions replace direct client updates while preserving
-- finalization as the only path that marks a session completed.
create or replace function public.start_interview_session(p_session_id uuid)
returns public.interview_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.interview_sessions;
begin
  if v_user_id is null or p_session_id is null then
    raise exception 'INTERVIEW_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.interview_sessions
  set
    status = 'in_progress',
    started_at = coalesce(started_at, now())
  where id = p_session_id
    and user_id = v_user_id
    and status in ('created', 'in_progress')
  returning * into v_session;

  if v_session.id is null then
    raise exception 'INTERVIEW_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_session;
end;
$$;

create or replace function public.abandon_interview_session(p_session_id uuid)
returns public.interview_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.interview_sessions;
begin
  if v_user_id is null or p_session_id is null then
    raise exception 'INTERVIEW_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.interview_sessions
  set
    status = 'abandoned',
    completed_at = coalesce(completed_at, now())
  where id = p_session_id
    and user_id = v_user_id
    and status in ('created', 'in_progress')
  returning * into v_session;

  if v_session.id is null then
    raise exception 'INTERVIEW_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_session;
end;
$$;

revoke all on function public.job_interview_session_payload(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.job_interview_session_payload(uuid, uuid)
  to service_role;

revoke all on function public.claim_job_interview_generation(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_job_interview_generation(uuid, uuid, uuid, text, text)
  to service_role;

revoke all on function public.fail_job_interview_generation(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_job_interview_generation(uuid, uuid, uuid, text)
  to service_role;

revoke all on function public.create_job_interview_session(
  uuid, uuid, uuid, text, text, integer, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.create_job_interview_session(
  uuid, uuid, uuid, text, text, integer, text, text, text, jsonb
) to service_role;

revoke all on function public.start_interview_session(uuid) from public, anon;
grant execute on function public.start_interview_session(uuid) to authenticated;

revoke all on function public.abandon_interview_session(uuid) from public, anon;
grant execute on function public.abandon_interview_session(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

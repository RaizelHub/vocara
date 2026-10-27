begin;

-- ---------------------------------------------------------------------------
-- Job-specific interviews: saved job descriptions + structured analyses +
-- a generation ledger, plus the session/question extensions that let a job
-- description flow into the existing Interview Room and evaluation pipeline.
-- ---------------------------------------------------------------------------

create table public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text,
  company_name text,
  raw_text text not null,
  normalized_text text,
  analysis_status text not null default 'pending',
  analysis_model text,
  analysis_version text,
  analysis_error text,
  analysis_attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_descriptions_raw_length_check check (
    char_length(btrim(raw_text)) between 100 and 12000
  ),
  constraint job_descriptions_status_check check (
    analysis_status in ('pending', 'processing', 'completed', 'failed')
  ),
  constraint job_descriptions_version_check check (
    analysis_version is null
    or (
      char_length(btrim(analysis_version)) between 1 and 40
      and analysis_version ~ '^[a-zA-Z0-9._-]+$'
    )
  ),
  constraint job_descriptions_model_length_check check (
    analysis_model is null or char_length(analysis_model) between 1 and 160
  ),
  constraint job_descriptions_error_length_check check (
    analysis_error is null or char_length(analysis_error) <= 1000
  ),
  constraint job_descriptions_attempt_count_check check (
    analysis_attempt_count between 0 and 3
  ),
  constraint job_descriptions_title_length_check check (
    title is null or char_length(btrim(title)) between 1 and 160
  ),
  constraint job_descriptions_company_length_check check (
    company_name is null or char_length(btrim(company_name)) between 1 and 160
  )
);

create index job_descriptions_user_created_idx
  on public.job_descriptions (user_id, created_at desc);

create trigger job_descriptions_set_updated_at
before update on public.job_descriptions
for each row execute function public.set_updated_at();

create table public.job_analyses (
  id uuid primary key default gen_random_uuid(),
  job_description_id uuid not null unique
    references public.job_descriptions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  detected_role text,
  seniority_level text not null default 'unknown',
  summary text,
  technical_skills jsonb,
  soft_skills jsonb,
  responsibilities jsonb,
  required_experience jsonb,
  preferred_experience jsonb,
  interview_focus_areas jsonb,
  keywords jsonb,
  analysis_model text,
  analysis_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_analyses_seniority_check check (
    seniority_level in (
      'intern', 'entry', 'junior', 'mid', 'senior', 'lead', 'manager', 'unknown'
    )
  ),
  constraint job_analyses_version_check check (
    char_length(btrim(analysis_version)) between 1 and 40
    and analysis_version ~ '^[a-zA-Z0-9._-]+$'
  ),
  constraint job_analyses_role_length_check check (
    detected_role is null or char_length(btrim(detected_role)) between 1 and 160
  ),
  constraint job_analyses_summary_length_check check (
    summary is null or char_length(summary) between 1 and 3000
  ),
  constraint job_analyses_model_length_check check (
    analysis_model is null or char_length(analysis_model) between 1 and 160
  ),
  constraint job_analyses_arrays_check check (
    (technical_skills is null or jsonb_typeof(technical_skills) = 'array')
    and (soft_skills is null or jsonb_typeof(soft_skills) = 'array')
    and (responsibilities is null or jsonb_typeof(responsibilities) = 'array')
    and (required_experience is null or jsonb_typeof(required_experience) = 'array')
    and (preferred_experience is null or jsonb_typeof(preferred_experience) = 'array')
    and (interview_focus_areas is null or jsonb_typeof(interview_focus_areas) = 'array')
    and (keywords is null or jsonb_typeof(keywords) = 'array')
  )
);

create trigger job_analyses_set_updated_at
before update on public.job_analyses
for each row execute function public.set_updated_at();

create table public.job_generation_requests (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_description_id uuid references public.job_descriptions (id) on delete set null,
  generation_kind text not null,
  model text not null,
  status text not null default 'processing',
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint job_generation_requests_kind_check check (
    generation_kind in ('analysis', 'interview')
  ),
  constraint job_generation_requests_status_check check (
    status in ('processing', 'completed', 'failed')
  ),
  constraint job_generation_requests_model_length_check check (
    char_length(btrim(model)) between 1 and 160
  ),
  constraint job_generation_requests_error_length_check check (
    error_code is null or char_length(error_code) <= 160
  )
);

create index job_generation_requests_user_created_idx
  on public.job_generation_requests (user_id, created_at desc);

create index job_generation_requests_job_idx
  on public.job_generation_requests (job_description_id, generation_kind)
  where job_description_id is not null;

-- Interview sessions can now point back at the job that spawned them. History
-- must survive a job deletion, so the reference is ON DELETE SET NULL.
alter table public.interview_sessions
  add column job_description_id uuid
    references public.job_descriptions (id) on delete set null;

create index interview_sessions_user_job_idx
  on public.interview_sessions (user_id, job_description_id)
  where job_description_id is not null;

-- Generated-question metadata. `source` distinguishes job-built questions from
-- the standard banks; the existing room reads the same columns it always has.
alter table public.interview_questions
  add column focus_area text,
  add column generation_reason text,
  add column expected_topics jsonb,
  add column difficulty text,
  add column source text not null default 'standard',
  add constraint interview_questions_source_check check (
    source in ('standard', 'job_specific')
  ),
  add constraint interview_questions_focus_area_length_check check (
    focus_area is null or char_length(focus_area) between 1 and 120
  ),
  add constraint interview_questions_reason_length_check check (
    generation_reason is null or char_length(generation_reason) between 1 and 400
  ),
  add constraint interview_questions_difficulty_check check (
    difficulty is null or difficulty in ('beginner', 'intermediate', 'advanced')
  ),
  add constraint interview_questions_expected_topics_check check (
    expected_topics is null or jsonb_typeof(expected_topics) = 'array'
  );

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------

alter table public.job_descriptions enable row level security;
alter table public.job_analyses enable row level security;
alter table public.job_generation_requests enable row level security;

create policy "job_descriptions_select_own"
on public.job_descriptions for select
to authenticated
using (user_id = (select auth.uid()));

create policy "job_descriptions_insert_own"
on public.job_descriptions for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "job_descriptions_delete_own"
on public.job_descriptions for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "job_analyses_select_own"
on public.job_analyses for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.job_descriptions as description
    where description.id = job_analyses.job_description_id
      and description.user_id = (select auth.uid())
  )
);

revoke all on table public.job_descriptions from public, anon, authenticated;
grant select, insert (user_id, raw_text), delete
  on public.job_descriptions to authenticated;
grant all privileges on public.job_descriptions to service_role;

revoke all on table public.job_analyses from public, anon, authenticated;
grant select on public.job_analyses to authenticated;
grant all privileges on public.job_analyses to service_role;

revoke all on table public.job_generation_requests from public, anon, authenticated;
grant all privileges on public.job_generation_requests to service_role;

-- ---------------------------------------------------------------------------
-- Analysis lifecycle. Client never talks to Groq; these functions own the
-- claim / complete / fail state machine and the ledger.
-- ---------------------------------------------------------------------------

create or replace function public.claim_job_analysis(
  p_job_description_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_analysis_version text,
  p_model text
)
returns public.job_analyses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.job_descriptions;
  v_analysis public.job_analyses;
  v_processing boolean;
  v_daily_total integer;
  v_daily_analyses integer;
begin
  if p_job_description_id is null or p_user_id is null or p_attempt_id is null
    or p_analysis_version is null
    or p_analysis_version !~ '^[a-zA-Z0-9._-]{1,40}$'
    or nullif(btrim(p_model), '') is null
  then
    raise exception 'JOB_ANALYSIS_INVALID_CLAIM' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job-quota:' || p_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job-analysis:' || p_job_description_id::text, 0)
  );

  select *
  into v_job
  from public.job_descriptions
  where id = p_job_description_id
  for update;

  if v_job.id is null or v_job.user_id is distinct from p_user_id then
    raise exception 'JOB_DESCRIPTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_job.analysis_status = 'completed'
    and v_job.analysis_version = p_analysis_version
  then
    select *
    into v_analysis
    from public.job_analyses
    where job_description_id = p_job_description_id
      and analysis_version = p_analysis_version;
    if v_analysis.id is not null then
      return v_analysis;
    end if;
  end if;

  select exists (
    select 1
    from public.job_generation_requests
    where job_description_id = p_job_description_id
      and generation_kind = 'analysis'
      and status = 'processing'
      and created_at > now() - interval '8 minutes'
      and id <> p_attempt_id
  ) into v_processing;

  if v_processing then
    raise exception 'JOB_ANALYSIS_ALREADY_PROCESSING' using errcode = 'P0001';
  end if;

  update public.job_generation_requests
  set status = 'failed', error_code = 'LEASE_EXPIRED', completed_at = now()
  where job_description_id = p_job_description_id
    and generation_kind = 'analysis'
    and status = 'processing';

  if v_job.analysis_status = 'failed'
    and v_job.analysis_attempt_count >= 3
  then
    raise exception 'JOB_ANALYSIS_ATTEMPT_LIMIT' using errcode = 'P0001';
  end if;
  if v_job.analysis_attempt_count >= 3 then
    raise exception 'JOB_ANALYSIS_ATTEMPT_LIMIT' using errcode = 'P0001';
  end if;

  select
    count(*)::integer,
    count(*) filter (where generation_kind = 'analysis')::integer
  into v_daily_total, v_daily_analyses
  from public.job_generation_requests
  where user_id = p_user_id
    and created_at >= now() - interval '24 hours';

  if v_daily_total >= 40 or v_daily_analyses >= 8 then
    raise exception 'JOB_ANALYSIS_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  update public.job_descriptions
  set
    analysis_status = 'processing',
    analysis_model = left(p_model, 160),
    analysis_version = p_analysis_version,
    analysis_error = null,
    analysis_attempt_count = analysis_attempt_count + 1
  where id = p_job_description_id;

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
    'analysis',
    left(p_model, 160)
  );

  return null;
end;
$$;

create or replace function public.complete_job_analysis(
  p_job_description_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_analysis_version text,
  p_model text,
  p_detected_role text,
  p_company_name text,
  p_seniority_level text,
  p_summary text,
  p_technical_skills jsonb,
  p_soft_skills jsonb,
  p_responsibilities jsonb,
  p_required_experience jsonb,
  p_preferred_experience jsonb,
  p_interview_focus_areas jsonb,
  p_keywords jsonb
)
returns public.job_analyses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_analysis public.job_analyses;
begin
  if p_seniority_level is null
    or p_seniority_level not in (
      'intern', 'entry', 'junior', 'mid', 'senior', 'lead', 'manager', 'unknown'
    )
    or p_analysis_version is null
    or p_analysis_version !~ '^[a-zA-Z0-9._-]{1,40}$'
    or nullif(btrim(p_model), '') is null
    or p_technical_skills is null
    or jsonb_typeof(p_technical_skills) <> 'array'
    or jsonb_array_length(p_technical_skills) > 10
    or p_soft_skills is null
    or jsonb_typeof(p_soft_skills) <> 'array'
    or jsonb_array_length(p_soft_skills) > 10
    or p_responsibilities is null
    or jsonb_typeof(p_responsibilities) <> 'array'
    or jsonb_array_length(p_responsibilities) not between 1 and 12
    or p_required_experience is null
    or jsonb_typeof(p_required_experience) <> 'array'
    or jsonb_array_length(p_required_experience) > 12
    or p_preferred_experience is null
    or jsonb_typeof(p_preferred_experience) <> 'array'
    or jsonb_array_length(p_preferred_experience) > 12
    or p_interview_focus_areas is null
    or jsonb_typeof(p_interview_focus_areas) <> 'array'
    or jsonb_array_length(p_interview_focus_areas) not between 3 and 8
    or p_keywords is null
    or jsonb_typeof(p_keywords) <> 'array'
    or jsonb_array_length(p_keywords) > 15
    or nullif(btrim(p_summary), '') is null
    or (p_detected_role is not null and nullif(btrim(p_detected_role), '') is null)
    or (p_company_name is not null and nullif(btrim(p_company_name), '') is null)
  then
    raise exception 'JOB_ANALYSIS_INVALID_RESULT' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job-analysis:' || p_job_description_id::text, 0)
  );

  if not exists (
    select 1
    from public.job_generation_requests as request
    join public.job_descriptions as description
      on description.id = request.job_description_id
    where request.id = p_attempt_id
      and request.user_id = p_user_id
      and request.job_description_id = p_job_description_id
      and request.generation_kind = 'analysis'
      and request.status = 'processing'
      and description.user_id = p_user_id
      and description.analysis_status = 'processing'
  ) then
    raise exception 'JOB_ANALYSIS_SUPERSEDED' using errcode = 'P0001';
  end if;

  insert into public.job_analyses (
    job_description_id,
    user_id,
    detected_role,
    seniority_level,
    summary,
    technical_skills,
    soft_skills,
    responsibilities,
    required_experience,
    preferred_experience,
    interview_focus_areas,
    keywords,
    analysis_model,
    analysis_version
  ) values (
    p_job_description_id,
    p_user_id,
    nullif(btrim(p_detected_role), ''),
    p_seniority_level,
    btrim(p_summary),
    p_technical_skills,
    p_soft_skills,
    p_responsibilities,
    p_required_experience,
    p_preferred_experience,
    p_interview_focus_areas,
    p_keywords,
    left(p_model, 160),
    p_analysis_version
  )
  on conflict (job_description_id) do update
  set
    detected_role = excluded.detected_role,
    seniority_level = excluded.seniority_level,
    summary = excluded.summary,
    technical_skills = excluded.technical_skills,
    soft_skills = excluded.soft_skills,
    responsibilities = excluded.responsibilities,
    required_experience = excluded.required_experience,
    preferred_experience = excluded.preferred_experience,
    interview_focus_areas = excluded.interview_focus_areas,
    keywords = excluded.keywords,
    analysis_model = excluded.analysis_model,
    analysis_version = excluded.analysis_version,
    updated_at = now()
  returning * into v_analysis;

  update public.job_descriptions
  set
    analysis_status = 'completed',
    title = coalesce(nullif(btrim(p_detected_role), ''), title),
    company_name = nullif(btrim(p_company_name), ''),
    normalized_text = btrim(regexp_replace(raw_text, '\s+', ' ', 'g')),
    analysis_model = left(p_model, 160),
    analysis_version = p_analysis_version,
    analysis_error = null
  where id = p_job_description_id
    and user_id = p_user_id;

  update public.job_generation_requests
  set status = 'completed', completed_at = now()
  where id = p_attempt_id
    and user_id = p_user_id;

  return v_analysis;
end;
$$;

create or replace function public.fail_job_analysis(
  p_job_description_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_error_code text,
  p_error_message text,
  p_analysis_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.job_descriptions
  set
    analysis_status = 'failed',
    analysis_error = left(
      coalesce(nullif(btrim(p_error_code), ''), 'UNKNOWN')
      || ': '
      || coalesce(nullif(btrim(p_error_message), ''), 'Analysis failed'),
      1000
    ),
    analysis_version = p_analysis_version
  where id = p_job_description_id
    and user_id = p_user_id
    and analysis_status = 'processing'
    and exists (
      select 1
      from public.job_generation_requests
      where id = p_attempt_id
        and user_id = p_user_id
        and generation_kind = 'analysis'
        and status = 'processing'
    );

  update public.job_generation_requests
  set
    status = 'failed',
    error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'UNKNOWN'), 160),
    completed_at = now()
  where id = p_attempt_id
    and user_id = p_user_id
    and generation_kind = 'analysis'
    and status = 'processing';
end;
$$;

-- ---------------------------------------------------------------------------
-- Interview generation persistence. One function inserts the session and ALL
-- of its questions atomically and returns them so the client can enter the
-- existing room with real server question ids.
-- ---------------------------------------------------------------------------

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
  v_existing jsonb;
  v_question_count integer;
  v_daily_total integer;
  v_daily_interviews integer;
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
    pg_catalog.hashtextextended('job-quota:' || p_user_id::text, 0)
  );
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
    and analysis_version = p_analysis_version;

  if v_analysis.id is null then
    raise exception 'JOB_ANALYSIS_REQUIRED' using errcode = 'P0001';
  end if;

  -- A settings-identical build inside the dedupe window is one request, not
  -- two. Regeneration from the preview screen flows through the same function
  -- but after the window (or with different settings) creates a new session.
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
  ) into v_existing
  from public.interview_sessions as session
  where session.job_description_id = p_job_description_id
    and session.user_id = p_user_id
    and session.interview_type = 'job_specific'
    and session.difficulty = p_session_difficulty
    and session.interviewer_style = p_interviewer_style
    and session.total_questions = p_question_count
    and session.created_at > now() - interval '45 seconds';

  if v_existing is not null then
    return v_existing;
  end if;

  v_question_count := 0;
  for v_item in select * from jsonb_array_elements(p_questions)
  loop
    v_question_count := v_question_count + 1;
    v_question_text := nullif(btrim(v_item ->> 'questionText'), '');
    v_question_type := v_item ->> 'questionType';
    v_difficulty := v_item ->> 'difficulty';
    v_focus_area := nullif(btrim(coalesce(v_item ->> 'focusArea', '')), '');
    v_reason := nullif(btrim(coalesce(v_item ->> 'reason', '')), '');
    v_expected_topics := v_item -> 'expectedTopics';

    if v_question_text is null
      or char_length(v_question_text) > 600
      or v_question_type is null
      or v_question_type not in (
        'introduction', 'behavioral', 'technical', 'situational', 'motivation', 'general'
      )
      or v_difficulty is null
      or v_difficulty not in ('beginner', 'intermediate', 'advanced')
      or (v_focus_area is not null and char_length(v_focus_area) > 120)
      or (v_reason is not null and char_length(v_reason) > 400)
      or (v_expected_topics is not null
        and (jsonb_typeof(v_expected_topics) <> 'array'
          or jsonb_array_length(v_expected_topics) > 5))
      or (v_item ->> 'questionNumber')::integer is null
      or (v_item ->> 'questionNumber')::integer not between 1 and p_question_count
    then
      raise exception 'JOB_INTERVIEW_INVALID_INPUT' using errcode = '22023';
    end if;
  end loop;

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
    nullif(btrim(coalesce(entry ->> 'focusArea', '')), ''),
    nullif(btrim(coalesce(entry ->> 'reason', '')), ''),
    entry -> 'expectedTopics',
    entry ->> 'difficulty',
    'job_specific'
  from jsonb_array_elements(p_questions) as entry;

  insert into public.job_generation_requests (
    id,
    user_id,
    job_description_id,
    generation_kind,
    model,
    status,
    completed_at
  ) values (
    p_attempt_id,
    p_user_id,
    p_job_description_id,
    'interview',
    left(p_model, 160),
    'completed',
    now()
  );

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
  ) into v_existing
  from public.interview_sessions as session
  where session.id = v_session_id;

  return v_existing;
end;
$$;

revoke all on function public.claim_job_analysis(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_job_analysis(uuid, uuid, uuid, text, text)
  to service_role;

revoke all on function public.complete_job_analysis(
  uuid, uuid, uuid, text, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.complete_job_analysis(
  uuid, uuid, uuid, text, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;

revoke all on function public.fail_job_analysis(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.fail_job_analysis(uuid, uuid, uuid, text, text, text)
  to service_role;

revoke all on function public.create_job_interview_session(
  uuid, uuid, uuid, text, text, integer, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.create_job_interview_session(
  uuid, uuid, uuid, text, text, integer, text, text, text, jsonb
) to service_role;

notify pgrst, 'reload schema';

commit;
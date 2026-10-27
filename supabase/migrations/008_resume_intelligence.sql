begin;

-- ---------------------------------------------------------------------------
-- Resume Intelligence: private user resume documents, structured resume
-- analyses, and resume-vs-job match records. Resumes live in a private
-- Storage bucket; this schema only holds metadata that the client needs to
-- coordinate uploads, processing, and ownership checks.
-- ---------------------------------------------------------------------------

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_active boolean not null default true,
  deleted_at timestamptz,
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  extracted_text text,
  processing_status text not null default 'pending',
  processing_error text,
  analysis_model text,
  analysis_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resumes_file_name_length_check check (
    char_length(btrim(file_name)) between 1 and 255
  ),
  constraint resumes_mime_type_check check (
    mime_type in ('application/pdf')
  ),
  constraint resumes_size_check check (
    file_size_bytes between 1 and 5242880
  ),
  constraint resumes_status_check check (
    processing_status in ('pending', 'uploaded', 'extracting', 'extract_failed', 'analyzing', 'completed', 'failed')
  ),
  constraint resumes_version_check check (
    analysis_version is null
    or (char_length(btrim(analysis_version)) between 1 and 40
        and analysis_version ~ '^[a-zA-Z0-9._-]+$')
  ),
  constraint resumes_error_length_check check (
    processing_error is null or char_length(processing_error) <= 1000
  ),
  constraint resumes_model_length_check check (
    analysis_model is null or char_length(analysis_model) between 1 and 160
  ),
  constraint resumes_storage_path_unique_per_user unique (user_id, storage_path)
);

create index resumes_user_idx
  on public.resumes (user_id, created_at desc);

create index resumes_user_active_idx
  on public.resumes (user_id)
  where is_active = true;

create trigger resumes_set_updated_at
before update on public.resumes
for each row execute function public.set_updated_at();

create table public.resume_generation_requests (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  resume_id uuid not null references public.resumes (id) on delete cascade,
  model text not null,
  status text not null default 'processing',
  error_code text,
  attempt_count integer not null default 1,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint resume_generation_requests_status_check check (
    status in ('processing', 'completed', 'failed')
  ),
  constraint resume_generation_requests_model_length_check check (
    char_length(btrim(model)) between 1 and 160
  ),
  constraint resume_generation_requests_error_length_check check (
    error_code is null or char_length(error_code) <= 160
  ),
  constraint resume_generation_requests_attempt_count_check check (
    attempt_count between 1 and 5
  )
);

create index resume_generation_requests_user_idx
  on public.resume_generation_requests (user_id, created_at desc);

create index resume_generation_requests_resume_idx
  on public.resume_generation_requests (resume_id);

create table public.resume_analyses (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null unique
    references public.resumes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  professional_summary text,
  current_or_latest_role text,
  seniority_level text,
  years_experience_estimate numeric,
  skills jsonb not null default '[]'::jsonb,
  technologies jsonb not null default '[]'::jsonb,
  work_experience jsonb not null default '[]'::jsonb,
  projects jsonb not null default '[]'::jsonb,
  education jsonb not null default '[]'::jsonb,
  certifications jsonb not null default '[]'::jsonb,
  strengths jsonb not null default '[]'::jsonb,
  analysis_model text,
  analysis_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resume_analyses_seniority_check check (
    seniority_level in ('intern', 'entry', 'junior', 'mid', 'senior', 'lead', 'manager', 'unknown')
  ),
  constraint resume_analyses_version_check check (
    char_length(btrim(analysis_version)) between 1 and 40
    and analysis_version ~ '^[a-zA-Z0-9._-]+$'
  ),
  constraint resume_analyses_role_length_check check (
    current_or_latest_role is null or char_length(btrim(current_or_latest_role)) between 1 and 160
  ),
  constraint resume_analyses_model_length_check check (
    analysis_model is null or char_length(analysis_model) between 1 and 160
  ),
  constraint resume_analyses_years_check check (
    years_experience_estimate is null or years_experience_estimate between 0 and 60
  ),
  constraint resume_analyses_arrays_check check (
    jsonb_typeof(skills) = 'array'
    and jsonb_typeof(technologies) = 'array'
    and jsonb_typeof(work_experience) = 'array'
    and jsonb_typeof(projects) = 'array'
    and jsonb_typeof(education) = 'array'
    and jsonb_typeof(certifications) = 'array'
    and jsonb_typeof(strengths) = 'array'
  )
);

create trigger resume_analyses_set_updated_at
before update on public.resume_analyses
for each row execute function public.set_updated_at();

create table public.resume_job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  resume_id uuid not null references public.resumes (id) on delete cascade,
  job_description_id uuid not null references public.job_descriptions (id) on delete cascade,
  overall_match_score integer not null,
  skill_match_score integer,
  experience_alignment_score integer,
  matching_skills jsonb,
  missing_requirements jsonb,
  transferable_strengths jsonb,
  experience_alignment jsonb,
  interview_risks jsonb,
  recommended_focus_areas jsonb,
  summary text,
  analysis_model text,
  analysis_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint resume_job_matches_scores_check check (
    overall_match_score between 0 and 100
    and (skill_match_score is null or skill_match_score between 0 and 100)
    and (experience_alignment_score is null or experience_alignment_score between 0 and 100)
  ),
  constraint resume_job_matches_version_check check (
    char_length(btrim(analysis_version)) between 1 and 40
    and analysis_version ~ '^[a-zA-Z0-9._-]+$'
  ),
  constraint resume_job_matches_model_length_check check (
    analysis_model is null or char_length(analysis_model) between 1 and 160
  ),
  constraint resume_job_matches_summary_length_check check (
    summary is null or char_length(summary) between 1 and 1000
  ),
  constraint resume_job_matches_arrays_check check (
    (matching_skills is null or jsonb_typeof(matching_skills) = 'array')
    and (missing_requirements is null or jsonb_typeof(missing_requirements) = 'array')
    and (transferable_strengths is null or jsonb_typeof(transferable_strengths) = 'array')
    and (experience_alignment is null or jsonb_typeof(experience_alignment) = 'array')
    and (interview_risks is null or jsonb_typeof(interview_risks) = 'array')
    and (recommended_focus_areas is null or jsonb_typeof(recommended_focus_areas) = 'array')
  )
);

create index resume_job_matches_lookup
  on public.resume_job_matches (resume_id, job_description_id, analysis_version)
  where deleted_at is null;

create unique index resume_job_matches_unique
  on public.resume_job_matches (resume_id, job_description_id, analysis_version);

create trigger resume_job_matches_set_updated_at
before update on public.resume_job_matches
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- One active resume per user. Enforcing in a trigger keeps the "active" flag
-- consistent even when writes come from multiple clients or the service role.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_single_active_resume()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active = true and new.deleted_at is null then
    update public.resumes
    set is_active = false
    where user_id = new.user_id
      and is_active = true
      and id <> new.id
      and deleted_at is null;
  end if;
  return new;
end;
$$;

create trigger resumes_enforce_single_active
after insert or update of is_active on public.resumes
for each row execute function public.enforce_single_active_resume();

-- ---------------------------------------------------------------------------
-- RLS: users access only their own resumes, analyses, and matches.
-- ---------------------------------------------------------------------------

alter table public.resumes enable row level security;
alter table public.resume_analyses enable row level security;
alter table public.resume_job_matches enable row level security;

create policy "resumes_select_own"
on public.resumes for select
to authenticated
using (user_id = (select auth.uid()) and deleted_at is null);

create policy "resumes_modify_own"
on public.resumes for insert with check (user_id = (select auth.uid()));

create policy "resumes_update_own"
on public.resumes for update
to authenticated
using (user_id = (select auth.uid()));

create policy "resumes_delete_own"
on public.resumes for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "resume_analyses_select_own"
on public.resume_analyses for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.resumes as resume
    where resume.id = resume_analyses.resume_id
      and resume.user_id = (select auth.uid())
      and resume.deleted_at is null
  )
);

create policy "resume_job_matches_select_own"
on public.resume_job_matches for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.resumes from public, anon, authenticated;
revoke all on table public.resume_analyses from public, anon, authenticated;
revoke all on table public.resume_job_matches from public, anon, authenticated;

grant select, insert, update (is_active, file_name, storage_path, mime_type, file_size_bytes, processing_status, processing_error, analysis_model, analysis_version), delete
  on public.resumes to authenticated;
grant select on public.resume_analyses to authenticated;
grant all privileges on public.resumes, public.resume_analyses, public.resume_job_matches to service_role;

revoke all on function public.enforce_single_active_resume() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ownership-verified RPCs (service role only). The client never passes its
-- own user_id or storage_path as trusted input.
-- ---------------------------------------------------------------------------

create or replace function public.claim_resume_analysis(
  p_resume_id uuid,
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
  v_resume public.resumes;
  v_analysis public.resume_analyses;
  v_processing boolean;
  v_daily_count integer;
begin
  if p_resume_id is null or p_user_id is null or p_attempt_id is null
    or p_analysis_version is null
    or p_analysis_version !~ '^[a-zA-Z0-9._-]{1,40}$'
    or nullif(btrim(p_model), '') is null
  then
    raise exception 'RESUME_INVALID_CLAIM' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resume-quota:' || p_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resume-analysis:' || p_resume_id::text, 0)
  );

  select *
  into v_resume
  from public.resumes
  where id = p_resume_id
  for update;

  if v_resume.id is null or v_resume.user_id is distinct from p_user_id then
    raise exception 'RESUME_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_resume.processing_status = 'completed'
    and v_resume.analysis_version = p_analysis_version
  then
    select *
    into v_analysis
    from public.resume_analyses
    where resume_id = p_resume_id
      and analysis_version = p_analysis_version;
    if v_analysis.id is not null then
      return jsonb_build_object('alreadyCompleted', true);
    end if;
  end if;

  select exists (
    select 1
    from public.resume_generation_requests
    where resume_id = p_resume_id
      and status = 'processing'
      and created_at > now() - interval '8 minutes'
      and id <> p_attempt_id
  ) into v_processing;

  if v_processing then
    raise exception 'RESUME_ALREADY_PROCESSING' using errcode = 'P0001';
  end if;

  update public.resume_generation_requests
  set status = 'failed', error_code = 'LEASE_EXPIRED', completed_at = now()
  where resume_id = p_resume_id
    and status = 'processing';

  select count(*)::integer
  into v_daily_count
  from public.resume_generation_requests
  where user_id = p_user_id
    and created_at >= now() - interval '24 hours';

  if v_daily_count >= 40 then
    raise exception 'RESUME_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  update public.resumes
  set
    processing_status = 'analyzing',
    analysis_model = left(p_model, 160),
    analysis_version = p_analysis_version,
    processing_error = null
  where id = p_resume_id;

  insert into public.resume_generation_requests (
    id,
    user_id,
    resume_id,
    model,
    attempt_count
  ) values (
    p_attempt_id,
    p_user_id,
    p_resume_id,
    left(p_model, 160),
    1
  );

  return null;
end;
$$;

create or replace function public.complete_resume_analysis(
  p_resume_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_analysis_version text,
  p_model text,
  p_professional_summary text,
  p_current_or_latest_role text,
  p_seniority_level text,
  p_years_experience_estimate numeric,
  p_skills jsonb,
  p_technologies jsonb,
  p_work_experience jsonb,
  p_projects jsonb,
  p_education jsonb,
  p_certifications jsonb,
  p_strengths jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_analysis public.resume_analyses;
begin
  if p_seniority_level is null
    or p_seniority_level not in (
      'intern', 'entry', 'junior', 'mid', 'senior', 'lead', 'manager', 'unknown'
    )
    or p_analysis_version is null
    or p_analysis_version !~ '^[a-zA-Z0-9._-]{1,40}$'
    or nullif(btrim(p_model), '') is null
    or p_skills is null
    or jsonb_typeof(p_skills) <> 'array'
    or p_technologies is null
    or jsonb_typeof(p_technologies) <> 'array'
    or p_work_experience is null
    or jsonb_typeof(p_work_experience) <> 'array'
    or p_projects is null
    or jsonb_typeof(p_projects) <> 'array'
    or p_education is null
    or jsonb_typeof(p_education) <> 'array'
    or p_certifications is null
    or jsonb_typeof(p_certifications) <> 'array'
    or p_strengths is null
    or jsonb_typeof(p_strengths) <> 'array'
  then
    raise exception 'RESUME_INVALID_RESULT' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resume-analysis:' || p_resume_id::text, 0)
  );

  if not exists (
    select 1
    from public.resume_generation_requests
    where id = p_attempt_id
      and user_id = p_user_id
      and resume_id = p_resume_id
      and status = 'processing'
  ) then
    raise exception 'RESUME_ATTEMPT_SUPERSEDED' using errcode = 'P0001';
  end if;

  insert into public.resume_analyses (
    resume_id,
    user_id,
    professional_summary,
    current_or_latest_role,
    seniority_level,
    years_experience_estimate,
    skills,
    technologies,
    work_experience,
    projects,
    education,
    certifications,
    strengths,
    analysis_model,
    analysis_version
  ) values (
    p_resume_id,
    p_user_id,
    nullif(btrim(p_professional_summary), ''),
    nullif(btrim(p_current_or_latest_role), ''),
    p_seniority_level,
    p_years_experience_estimate,
    p_skills,
    p_technologies,
    p_work_experience,
    p_projects,
    p_education,
    p_certifications,
    p_strengths,
    left(p_model, 160),
    p_analysis_version
  )
  on conflict (resume_id) do update
  set
    professional_summary = excluded.professional_summary,
    current_or_latest_role = excluded.current_or_latest_role,
    seniority_level = excluded.seniority_level,
    years_experience_estimate = excluded.years_experience_estimate,
    skills = excluded.skills,
    technologies = excluded.technologies,
    work_experience = excluded.work_experience,
    projects = excluded.projects,
    education = excluded.education,
    certifications = excluded.certifications,
    strengths = excluded.strengths,
    analysis_model = excluded.analysis_model,
    analysis_version = excluded.analysis_version,
    updated_at = now()
  returning * into v_analysis;

  update public.resumes
  set
    processing_status = 'completed',
    processing_error = null,
    updated_at = now()
  where id = p_resume_id
    and user_id = p_user_id;

  if not found then
    raise exception 'RESUME_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.resume_generation_requests
  set status = 'completed', completed_at = now()
  where id = p_attempt_id
    and user_id = p_user_id;

  return jsonb_build_object(
    'resumeId', v_analysis.resume_id,
    'analysisId', v_analysis.id,
    'analysisVersion', v_analysis.analysis_version
  );
end;
$$;

create or replace function public.fail_resume_analysis(
  p_resume_id uuid,
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
declare
  v_new_status text;
begin
  if p_error_code = 'RESUME_TOO_SHORT_TEXT' then
    v_new_status := 'extract_failed';
  else
    v_new_status := 'failed';
  end if;

  update public.resumes
  set
    processing_status = v_new_status,
    processing_error = left(
      coalesce(nullif(btrim(p_error_code), ''), 'UNKNOWN')
      || ': '
      || coalesce(nullif(btrim(p_error_message), ''), 'Analysis failed'),
      1000
    ),
    analysis_version = p_analysis_version
  where id = p_resume_id
    and user_id = p_user_id
    and processing_status in ('analyzing', 'extracting', 'extract_failed');

  update public.resume_generation_requests
  set
    status = 'failed',
    error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'UNKNOWN'), 160),
    completed_at = now()
  where id = p_attempt_id
    and user_id = p_user_id
    and status = 'processing';
end;
$$;

revoke all on function public.claim_resume_analysis(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_resume_analysis(uuid, uuid, uuid, text, text)
  to service_role;

revoke all on function public.complete_resume_analysis(
  uuid, uuid, uuid, text, text, text, text, text, numeric,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.complete_resume_analysis(
  uuid, uuid, uuid, text, text, text, text, text, numeric,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;

revoke all on function public.fail_resume_analysis(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.fail_resume_analysis(uuid, uuid, uuid, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Resume-vs-job match persistence. The client passes two IDs; the function
-- verifies both ownership, enforces idempotency, and writes a match row.
-- Scores are computed server-side from the structured analyses so the AI only
-- provides qualitative mappings.
-- ---------------------------------------------------------------------------

create or replace function public.claim_resume_job_match(
  p_resume_id uuid,
  p_job_description_id uuid,
  p_user_id uuid,
  p_analysis_version text,
  p_model text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resume public.resumes;
  v_job public.job_descriptions;
  v_resume_analysis public.resume_analyses;
  v_job_analysis public.job_analyses;
  v_existing public.resume_job_matches;
  v_daily_count integer;
begin
  if p_resume_id is null or p_job_description_id is null or p_user_id is null
    or p_analysis_version is null
    or p_analysis_version !~ '^[a-zA-Z0-9._-]{1,40}$'
    or nullif(btrim(p_model), '') is null
  then
    raise exception 'RESUME_JOB_INVALID_CLAIM' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resume-job-quota:' || p_user_id::text, 0)
  );

  select *
  into v_resume
  from public.resumes
  where id = p_resume_id
    and user_id = p_user_id
    and deleted_at is null
  for update;

  if v_resume.id is null or v_resume.user_id is distinct from p_user_id then
    raise exception 'RESUME_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_resume.processing_status <> 'completed' then
    raise exception 'RESUME_ANALYSIS_REQUIRED' using errcode = 'P0001';
  end if;

  select *
  into v_resume_analysis
  from public.resume_analyses
  where resume_id = p_resume_id
    and analysis_version = p_analysis_version;

  if v_resume_analysis.id is null then
    raise exception 'RESUME_ANALYSIS_VERSION_MISMATCH' using errcode = 'P0001';
  end if;

  select *
  into v_job
  from public.job_descriptions
  where id = p_job_description_id
    and user_id = p_user_id
  for update;

  if v_job.id is null or v_job.user_id is distinct from p_user_id then
    raise exception 'JOB_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_job.analysis_status <> 'completed' then
    raise exception 'JOB_ANALYSIS_REQUIRED' using errcode = 'P0001';
  end if;

  select *
  into v_job_analysis
  from public.job_analyses
  where job_description_id = p_job_description_id
    and analysis_version = p_analysis_version;

  if v_job_analysis.id is null then
    raise exception 'JOB_ANALYSIS_VERSION_MISMATCH' using errcode = 'P0001';
  end if;

  select *
  into v_existing
  from public.resume_job_matches
  where resume_id = p_resume_id
    and job_description_id = p_job_description_id
    and analysis_version = p_analysis_version
    and deleted_at is null
  for update;

  if v_existing.id is not null then
    return jsonb_build_object('alreadyCompleted', true, 'matchId', v_existing.id);
  end if;

  select count(*)::integer
  into v_daily_count
  from public.resume_job_matches
  where user_id = p_user_id
    and created_at >= now() - interval '24 hours';

  if v_daily_count >= 40 then
    raise exception 'RESUME_JOB_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  return null;
end;
$$;

create or replace function public.complete_resume_job_match(
  p_resume_id uuid,
  p_job_description_id uuid,
  p_user_id uuid,
  p_analysis_version text,
  p_model text,
  p_overall_match_score integer,
  p_skill_match_score integer,
  p_experience_alignment_score integer,
  p_matching_skills jsonb,
  p_missing_requirements jsonb,
  p_transferable_strengths jsonb,
  p_experience_alignment jsonb,
  p_interview_risks jsonb,
  p_recommended_focus_areas jsonb,
  p_summary text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_id uuid;
begin
  if p_overall_match_score is null
    or p_overall_match_score not between 0 and 100
    or (p_skill_match_score is not null and p_skill_match_score not between 0 and 100)
    or (p_experience_alignment_score is not null and p_experience_alignment_score not between 0 and 100)
    or p_matching_skills is null
    or jsonb_typeof(p_matching_skills) <> 'array'
    or p_missing_requirements is null
    or jsonb_typeof(p_missing_requirements) <> 'array'
    or p_transferable_strengths is null
    or jsonb_typeof(p_transferable_strengths) <> 'array'
    or p_experience_alignment is null
    or jsonb_typeof(p_experience_alignment) <> 'array'
    or p_interview_risks is null
    or jsonb_typeof(p_interview_risks) <> 'array'
    or p_recommended_focus_areas is null
    or jsonb_typeof(p_recommended_focus_areas) <> 'array'
  then
    raise exception 'RESUME_JOB_INVALID_RESULT' using errcode = '22023';
  end if;

  insert into public.resume_job_matches (
    user_id,
    resume_id,
    job_description_id,
    overall_match_score,
    skill_match_score,
    experience_alignment_score,
    matching_skills,
    missing_requirements,
    transferable_strengths,
    experience_alignment,
    interview_risks,
    recommended_focus_areas,
    summary,
    analysis_model,
    analysis_version
  ) values (
    p_user_id,
    p_resume_id,
    p_job_description_id,
    p_overall_match_score,
    p_skill_match_score,
    p_experience_alignment_score,
    p_matching_skills,
    p_missing_requirements,
    p_transferable_strengths,
    p_experience_alignment,
    p_interview_risks,
    p_recommended_focus_areas,
    left(coalesce(p_summary, ''), 1000),
    left(p_model, 160),
    p_analysis_version
  )
  on conflict (resume_id, job_description_id, analysis_version) do update
  set
    overall_match_score = excluded.overall_match_score,
    skill_match_score = excluded.skill_match_score,
    experience_alignment_score = excluded.experience_alignment_score,
    matching_skills = excluded.matching_skills,
    missing_requirements = excluded.missing_requirements,
    transferable_strengths = excluded.transferable_strengths,
    experience_alignment = excluded.experience_alignment,
    interview_risks = excluded.interview_risks,
    recommended_focus_areas = excluded.recommended_focus_areas,
    summary = excluded.summary,
    analysis_model = excluded.analysis_model,
    analysis_version = excluded.analysis_version,
    updated_at = now()
  returning id into v_match_id;

  return v_match_id;
end;
$$;

create or replace function public.fail_resume_job_match(
  p_resume_id uuid,
  p_job_description_id uuid,
  p_user_id uuid,
  p_error_code text,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.resume_job_matches (
    user_id,
    resume_id,
    job_description_id,
    overall_match_score,
    matching_skills,
    missing_requirements,
    transferable_strengths,
    experience_alignment,
    interview_risks,
    recommended_focus_areas,
    summary,
    analysis_version,
    analysis_model
  ) values (
    p_user_id,
    p_resume_id,
    p_job_description_id,
    0,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    left(
      coalesce(nullif(btrim(p_error_code), ''), 'UNKNOWN')
      || ': '
      || coalesce(nullif(btrim(p_error_message), ''), 'Comparison failed'),
      1000
    ),
    'failed',
    'vocara/resume'
  )
  on conflict (resume_id, job_description_id, analysis_version) do nothing;
end;
$$;

revoke all on function public.claim_resume_job_match(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_resume_job_match(uuid, uuid, uuid, text, text)
  to service_role;

revoke all on function public.complete_resume_job_match(
  uuid, uuid, uuid, text, text, integer, integer, integer,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.complete_resume_job_match(
  uuid, uuid, uuid, text, text, integer, integer, integer,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text
) to service_role;

revoke all on function public.fail_resume_job_match(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.fail_resume_job_match(uuid, uuid, uuid, text, text)
  to service_role;

revoke all on table public.resume_generation_requests from public, anon, authenticated;
grant all privileges on public.resume_generation_requests to service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Private resumes Storage bucket + per-user RLS policies. The bucket is
-- created with public = false so objects are never publicly accessible.
-- Files are stored at {user_id}/{resume_id}/{sanitized_filename}.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('resumes', 'resumes', false, 5242880)
on conflict (id) do update
set file_size_limit = 5242880;

create policy "resumes_storage_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "resumes_storage_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "resumes_storage_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "resumes_storage_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

commit;

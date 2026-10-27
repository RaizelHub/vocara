begin;

alter table public.interview_sessions
  add column job_context jsonb,
  add constraint interview_sessions_job_context_check check (
    job_context is null or jsonb_typeof(job_context) = 'object'
  );

create or replace function public.populate_job_interview_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.interview_type = 'job_specific' and new.job_description_id is not null then
    select jsonb_strip_nulls(jsonb_build_object(
      'analysisVersion', analysis.analysis_version,
      'jobRole', analysis.detected_role,
      'companyName', description.company_name,
      'seniorityLevel', analysis.seniority_level,
      'jobSummary', left(coalesce(analysis.summary, ''), 500),
      'technicalSkills', coalesce(analysis.technical_skills, '[]'::jsonb),
      'softSkills', coalesce(analysis.soft_skills, '[]'::jsonb),
      'responsibilities', coalesce(analysis.responsibilities, '[]'::jsonb),
      'requiredExperience', coalesce(analysis.required_experience, '[]'::jsonb),
      'interviewFocusAreas', coalesce(analysis.interview_focus_areas, '[]'::jsonb)
    ))
    into new.job_context
    from public.job_analyses as analysis
    join public.job_descriptions as description
      on description.id = analysis.job_description_id
    where analysis.job_description_id = new.job_description_id
      and analysis.user_id = new.user_id
      and description.user_id = new.user_id;

    if new.job_context is null then
      raise exception 'JOB_ANALYSIS_REQUIRED' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger interview_sessions_populate_job_context
before insert on public.interview_sessions
for each row execute function public.populate_job_interview_context();

update public.interview_sessions as session
set job_context = jsonb_strip_nulls(jsonb_build_object(
  'analysisVersion', analysis.analysis_version,
  'jobRole', analysis.detected_role,
  'companyName', description.company_name,
  'seniorityLevel', analysis.seniority_level,
  'jobSummary', left(coalesce(analysis.summary, ''), 500),
  'technicalSkills', coalesce(analysis.technical_skills, '[]'::jsonb),
  'softSkills', coalesce(analysis.soft_skills, '[]'::jsonb),
  'responsibilities', coalesce(analysis.responsibilities, '[]'::jsonb),
  'requiredExperience', coalesce(analysis.required_experience, '[]'::jsonb),
  'interviewFocusAreas', coalesce(analysis.interview_focus_areas, '[]'::jsonb)
))
from public.job_analyses as analysis
join public.job_descriptions as description
  on description.id = analysis.job_description_id
where session.interview_type = 'job_specific'
  and session.job_description_id = analysis.job_description_id
  and session.user_id = analysis.user_id
  and session.job_context is null;

-- Standard-interview hashes retain their original JSON shape. The immutable
-- job snapshot and generated-question metadata extend identity only for
-- job-specific sessions.
create or replace function public.answer_evaluation_source_hash(
  p_answer_id uuid,
  p_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        jsonb_build_object(
          'session', jsonb_build_object(
            'id', session.id,
            'role', session.role,
            'interviewType', session.interview_type,
            'difficulty', session.difficulty,
            'interviewerStyle', session.interviewer_style
          ) || case
            when session.interview_type = 'job_specific'
              then jsonb_build_object('jobContext', session.job_context)
            else '{}'::jsonb
          end,
          'question', jsonb_build_object(
            'id', question.id,
            'number', question.question_number,
            'text', question.question_text,
            'type', question.question_type
          ) || case
            when session.interview_type = 'job_specific' then jsonb_build_object(
              'focusArea', question.focus_area,
              'difficulty', question.difficulty,
              'reason', question.generation_reason,
              'expectedTopics', question.expected_topics,
              'source', question.source
            )
            else '{}'::jsonb
          end,
          'answer', jsonb_build_object(
            'id', answer.id,
            'audioGeneration', answer.audio_generation,
            'audioSha256', answer.audio_sha256,
            'transcript', answer.transcript,
            'durationSeconds', answer.duration_seconds,
            'wordCount', answer.word_count,
            'speakingPace', answer.speaking_pace
          )
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from public.interview_answers as answer
  join public.interview_sessions as session
    on session.id = answer.session_id
    and session.user_id = answer.user_id
  join public.interview_questions as question
    on question.id = answer.question_id
    and question.session_id = answer.session_id
  where answer.id = p_answer_id
    and answer.user_id = p_user_id;
$$;

revoke all on function public.populate_job_interview_context()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

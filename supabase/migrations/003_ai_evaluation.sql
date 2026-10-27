begin;

-- Feedback is versioned by rubric/model version and recording generation. A
-- re-record can therefore never reuse coaching created for an older transcript.
alter table public.answer_feedback
  drop constraint if exists answer_feedback_answer_id_key;

alter table public.answer_feedback
  add column overall_score numeric(5, 2),
  add column feedback_summary text,
  add column evaluation_status text not null default 'pending',
  add column evaluation_model text,
  add column evaluation_version text not null default 'legacy',
  add column evaluation_retryable boolean not null default true,
  add column evaluation_error text,
  add column evaluation_attempt_count integer not null default 0,
  add column evaluation_attempt_id uuid,
  add column evaluation_started_at timestamptz,
  add column evaluated_at timestamptz,
  add column provider_request_id text,
  add column source_audio_generation integer not null default 0,
  add column source_transcript_sha256 text,
  add column ai_input_tokens integer,
  add column ai_output_tokens integer,
  add column updated_at timestamptz not null default now();

update public.answer_feedback as feedback
set
  source_audio_generation = answer.audio_generation,
  overall_score = case
    when feedback.relevance_score is not null
      and feedback.structure_score is not null
      and feedback.clarity_score is not null
      and feedback.grammar_score is not null
      and feedback.vocabulary_score is not null
      and feedback.confidence_score is not null
    then round(
      feedback.relevance_score * 0.25
      + feedback.structure_score * 0.20
      + feedback.clarity_score * 0.20
      + feedback.grammar_score * 0.10
      + feedback.vocabulary_score * 0.10
      + feedback.confidence_score * 0.15
    )
    else null
  end,
  evaluation_status = 'pending',
  evaluated_at = null
from public.interview_answers as answer
where answer.id = feedback.answer_id;

alter table public.answer_feedback
  add constraint answer_feedback_answer_version_generation_unique
    unique (answer_id, evaluation_version, source_audio_generation),
  add constraint answer_feedback_overall_score_check check (
    overall_score is null or overall_score between 0 and 100
  ),
  add constraint answer_feedback_evaluation_status_check check (
    evaluation_status in ('pending', 'processing', 'completed', 'failed')
  ),
  add constraint answer_feedback_evaluation_version_check check (
    char_length(btrim(evaluation_version)) between 1 and 40
    and evaluation_version ~ '^[a-zA-Z0-9._-]+$'
  ),
  add constraint answer_feedback_attempt_count_check check (
    evaluation_attempt_count between 0 and 3
  ),
  add constraint answer_feedback_generation_check check (source_audio_generation >= 0),
  add constraint answer_feedback_source_hash_check check (
    source_transcript_sha256 is null
    or source_transcript_sha256 ~ '^[0-9a-f]{64}$'
  ),
  add constraint answer_feedback_text_lengths_check check (
    (feedback_summary is null or char_length(feedback_summary) <= 2000)
    and (better_approach is null or char_length(better_approach) <= 4000)
    and (improved_answer is null or char_length(improved_answer) <= 10000)
    and (evaluation_error is null or char_length(evaluation_error) <= 1000)
    and (evaluation_model is null or char_length(evaluation_model) <= 160)
    and (provider_request_id is null or char_length(provider_request_id) <= 255)
  ),
  add constraint answer_feedback_token_counts_check check (
    (ai_input_tokens is null or ai_input_tokens >= 0)
    and (ai_output_tokens is null or ai_output_tokens >= 0)
  ),
  add constraint answer_feedback_completed_shape_check check (
    evaluation_status <> 'completed'
    or (
      overall_score is not null
      and clarity_score is not null
      and grammar_score is not null
      and confidence_score is not null
      and structure_score is not null
      and relevance_score is not null
      and vocabulary_score is not null
      and feedback_summary is not null
      and strengths is not null
      and improvements is not null
      and better_approach is not null
      and improved_answer is not null
      and source_transcript_sha256 is not null
      and evaluated_at is not null
    )
  );

create index answer_feedback_current_lookup_idx
  on public.answer_feedback (
    answer_id,
    evaluation_version,
    source_audio_generation,
    evaluation_status
  );

create trigger set_answer_feedback_updated_at
before update on public.answer_feedback
for each row execute function public.set_updated_at();

alter table public.interview_sessions
  add column evaluation_version text,
  add column evaluation_model text,
  add constraint interview_sessions_evaluation_version_check check (
    evaluation_version is null
    or (
      char_length(btrim(evaluation_version)) between 1 and 40
      and evaluation_version ~ '^[a-zA-Z0-9._-]+$'
    )
  ),
  add constraint interview_sessions_evaluation_model_check check (
    evaluation_model is null or char_length(btrim(evaluation_model)) between 1 and 160
  ),
  add constraint interview_sessions_evaluation_identity_check check (
    (evaluation_version is null) = (evaluation_model is null)
  );

alter table public.interview_answers
  add constraint interview_answers_session_id_unique unique (session_id, id);

create table public.interview_session_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null,
  overall_score numeric(5, 2),
  clarity_score numeric(5, 2),
  grammar_score numeric(5, 2),
  confidence_score numeric(5, 2),
  structure_score numeric(5, 2),
  relevance_score numeric(5, 2),
  vocabulary_score numeric(5, 2),
  summary text,
  performance_label text,
  strengths jsonb,
  focus_areas jsonb,
  recommended_practice_type text,
  recommended_practice_reason text,
  strongest_answer_id uuid,
  focus_answer_id uuid,
  evaluation_model text,
  evaluation_version text not null,
  evaluation_status text not null default 'pending',
  evaluation_retryable boolean not null default true,
  evaluation_error text,
  evaluation_attempt_count integer not null default 0,
  evaluation_attempt_id uuid,
  evaluation_started_at timestamptz,
  evaluated_at timestamptz,
  provider_request_id text,
  source_fingerprint text,
  ai_input_tokens integer,
  ai_output_tokens integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_session_feedback_session_owner_fkey
    foreign key (session_id, user_id)
    references public.interview_sessions (id, user_id)
    on delete cascade,
  constraint interview_session_feedback_strongest_fkey
    foreign key (session_id, strongest_answer_id)
    references public.interview_answers (session_id, id)
    on delete restrict,
  constraint interview_session_feedback_focus_fkey
    foreign key (session_id, focus_answer_id)
    references public.interview_answers (session_id, id)
    on delete restrict,
  constraint interview_session_feedback_session_version_unique
    unique (session_id, evaluation_version),
  constraint interview_session_feedback_scores_check check (
    (overall_score is null or overall_score between 0 and 100)
    and (clarity_score is null or clarity_score between 0 and 100)
    and (grammar_score is null or grammar_score between 0 and 100)
    and (confidence_score is null or confidence_score between 0 and 100)
    and (structure_score is null or structure_score between 0 and 100)
    and (relevance_score is null or relevance_score between 0 and 100)
    and (vocabulary_score is null or vocabulary_score between 0 and 100)
  ),
  constraint interview_session_feedback_status_check check (
    evaluation_status in ('pending', 'processing', 'completed', 'failed')
  ),
  constraint interview_session_feedback_version_check check (
    char_length(btrim(evaluation_version)) between 1 and 40
    and evaluation_version ~ '^[a-zA-Z0-9._-]+$'
  ),
  constraint interview_session_feedback_attempt_count_check check (
    evaluation_attempt_count between 0 and 3
  ),
  constraint interview_session_feedback_json_check check (
    (strengths is null or jsonb_typeof(strengths) = 'array')
    and (focus_areas is null or jsonb_typeof(focus_areas) = 'array')
  ),
  constraint interview_session_feedback_recommendation_check check (
    recommended_practice_type is null
    or recommended_practice_type in (
      'behavioral', 'technical', 'quick', 'speaking', 'job_specific'
    )
  ),
  constraint interview_session_feedback_label_check check (
    performance_label is null
    or performance_label in (
      'Excellent interview',
      'Strong interview',
      'Good interview',
      'Developing',
      'Needs more practice'
    )
  ),
  constraint interview_session_feedback_lengths_check check (
    (summary is null or char_length(summary) <= 3000)
    and (recommended_practice_reason is null or char_length(recommended_practice_reason) <= 2000)
    and (evaluation_error is null or char_length(evaluation_error) <= 1000)
    and (evaluation_model is null or char_length(evaluation_model) <= 160)
    and (provider_request_id is null or char_length(provider_request_id) <= 255)
  ),
  constraint interview_session_feedback_fingerprint_check check (
    source_fingerprint is null or source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint interview_session_feedback_token_counts_check check (
    (ai_input_tokens is null or ai_input_tokens >= 0)
    and (ai_output_tokens is null or ai_output_tokens >= 0)
  ),
  constraint interview_session_feedback_completed_shape_check check (
    evaluation_status <> 'completed'
    or (
      overall_score is not null
      and clarity_score is not null
      and grammar_score is not null
      and confidence_score is not null
      and structure_score is not null
      and relevance_score is not null
      and vocabulary_score is not null
      and summary is not null
      and performance_label is not null
      and strengths is not null
      and focus_areas is not null
      and recommended_practice_type is not null
      and recommended_practice_reason is not null
      and strongest_answer_id is not null
      and focus_answer_id is not null
      and source_fingerprint is not null
      and evaluated_at is not null
    )
  )
);

create index interview_session_feedback_user_evaluated_idx
  on public.interview_session_feedback (user_id, evaluated_at desc)
  where evaluation_status = 'completed';

create trigger set_interview_session_feedback_updated_at
before update on public.interview_session_feedback
for each row execute function public.set_updated_at();

create table public.ai_evaluation_requests (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  evaluation_kind text not null,
  answer_id uuid references public.interview_answers (id) on delete set null,
  session_id uuid references public.interview_sessions (id) on delete set null,
  evaluation_version text not null,
  model text not null,
  status text not null default 'processing',
  error_code text,
  provider_request_id text,
  ai_input_tokens integer,
  ai_output_tokens integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_evaluation_requests_kind_check check (
    evaluation_kind in ('answer', 'session')
  ),
  constraint ai_evaluation_requests_status_check check (
    status in ('processing', 'completed', 'failed')
  ),
  constraint ai_evaluation_requests_identity_check check (
    (evaluation_kind = 'answer' and session_id is null)
    or (evaluation_kind = 'session' and answer_id is null)
  ),
  constraint ai_evaluation_requests_version_check check (
    char_length(btrim(evaluation_version)) between 1 and 40
  ),
  constraint ai_evaluation_requests_model_check check (
    char_length(btrim(model)) between 1 and 160
  ),
  constraint ai_evaluation_requests_lengths_check check (
    (error_code is null or char_length(error_code) <= 160)
    and (provider_request_id is null or char_length(provider_request_id) <= 255)
  ),
  constraint ai_evaluation_requests_tokens_check check (
    (ai_input_tokens is null or ai_input_tokens >= 0)
    and (ai_output_tokens is null or ai_output_tokens >= 0)
  )
);

create index ai_evaluation_requests_user_created_idx
  on public.ai_evaluation_requests (user_id, created_at desc);

create index ai_evaluation_requests_entity_idx
  on public.ai_evaluation_requests (answer_id, session_id, evaluation_version);

create index ai_evaluation_requests_session_idx
  on public.ai_evaluation_requests (session_id, evaluation_version)
  where session_id is not null;

alter table public.interview_session_feedback enable row level security;
alter table public.ai_evaluation_requests enable row level security;

create policy "session_feedback_select_own"
on public.interview_session_feedback for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.interview_sessions as session
    where session.id = interview_session_feedback.session_id
      and session.user_id = (select auth.uid())
  )
);

revoke all on public.interview_session_feedback from public, anon, authenticated;
grant select on public.interview_session_feedback to authenticated;
grant all privileges on public.interview_session_feedback to service_role;

revoke all on public.ai_evaluation_requests from public, anon, authenticated;
grant all privileges on public.ai_evaluation_requests to service_role;

-- Session/question context and lifecycle become immutable from the mobile
-- client once created. Finalization is exclusively service-side.
revoke update (
  role,
  interview_type,
  difficulty,
  interviewer_style,
  status,
  total_questions,
  duration_seconds,
  started_at,
  completed_at
) on public.interview_sessions from authenticated;
revoke update (question_number, question_text, question_type)
  on public.interview_questions from authenticated;
revoke delete on public.interview_sessions from authenticated;
revoke delete on public.interview_questions from authenticated;
revoke delete on public.interview_answers from authenticated;

-- Completed sessions are immutable. Any pre-completion re-record clears the
-- answer's score; versioned feedback remains as non-current history.
create or replace function public.prepare_answer_audio_generation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_status text;
begin
  if new.audio_generation is distinct from old.audio_generation then
    select status
    into v_session_status
    from public.interview_sessions
    where id = new.session_id
    for update;

    if v_session_status = 'completed'
      or exists (
        select 1
        from public.interview_session_feedback
        where session_id = new.session_id
          and evaluation_status = 'completed'
      )
    then
      raise exception 'COMPLETED_SESSION_IMMUTABLE' using errcode = 'P0001';
    end if;
    new.score := null;
  end if;
  return new;
end;
$$;

create trigger prepare_answer_audio_generation
before update of audio_generation on public.interview_answers
for each row execute function public.prepare_answer_audio_generation();

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
          ),
          'question', jsonb_build_object(
            'id', question.id,
            'number', question.question_number,
            'text', question.question_text,
            'type', question.question_type
          ),
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

create or replace function public.interview_finalization_source_hash(
  p_session_id uuid,
  p_user_id uuid,
  p_evaluation_version text
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
            'interviewerStyle', session.interviewer_style,
            'totalQuestions', session.total_questions,
            'evaluationVersion', session.evaluation_version,
            'evaluationModel', session.evaluation_model
          ),
          'answers', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'questionId', question.id,
                'questionNumber', question.question_number,
                'questionText', question.question_text,
                'questionType', question.question_type,
                'answerId', answer.id,
                'audioGeneration', answer.audio_generation,
                'answerSourceHash', public.answer_evaluation_source_hash(answer.id, p_user_id),
                'feedbackId', feedback.id,
                'feedbackStatus', feedback.evaluation_status,
                'feedbackVersion', feedback.evaluation_version,
                'feedbackModel', feedback.evaluation_model,
                'feedbackSourceHash', feedback.source_transcript_sha256,
                'feedbackScore', feedback.overall_score,
                'feedbackUpdatedAt', extract(epoch from feedback.updated_at)
              ) order by question.question_number
            )
            from public.interview_questions as question
            join public.interview_answers as answer
              on answer.question_id = question.id
              and answer.session_id = question.session_id
              and answer.user_id = p_user_id
            join public.answer_feedback as feedback
              on feedback.answer_id = answer.id
              and feedback.evaluation_version = p_evaluation_version
              and feedback.source_audio_generation = answer.audio_generation
              and feedback.evaluation_status = 'completed'
            where question.session_id = p_session_id
          ), '[]'::jsonb)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from public.interview_sessions as session
  where session.id = p_session_id
    and session.user_id = p_user_id;
$$;

create or replace function public.claim_answer_evaluation(
  p_answer_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_evaluation_version text,
  p_model text
)
returns public.answer_feedback
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_answer public.interview_answers;
  v_session public.interview_sessions;
  v_feedback public.answer_feedback;
  v_exists boolean := false;
  v_source_hash text;
  v_daily_requests integer;
begin
  if p_answer_id is null or p_user_id is null or p_attempt_id is null
    or p_evaluation_version is null
    or p_evaluation_version !~ '^[a-zA-Z0-9._-]{1,40}$'
    or nullif(btrim(p_model), '') is null
  then
    raise exception 'ANSWER_EVALUATION_INVALID_CLAIM' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-evaluation-quota:' || p_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'answer-evaluation:' || p_answer_id::text || ':' || p_evaluation_version,
      0
    )
  );

select answer
  into v_answer
  from public.interview_answers as answer
  join public.interview_sessions as session
    on session.id = answer.session_id
    and session.user_id = answer.user_id
  join public.interview_questions as question
    on question.id = answer.question_id
    and question.session_id = answer.session_id
  where answer.id = p_answer_id
    and answer.user_id = p_user_id
  for update of answer, session;

  select session
  into v_session
  from public.interview_sessions as session
  where session.id = v_answer.session_id
    and session.user_id = p_user_id;

  if v_answer.id is null then
    raise exception 'ANSWER_EVALUATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_answer.transcription_status <> 'completed'
    or nullif(btrim(v_answer.transcript), '') is null
  then
    raise exception 'ANSWER_EVALUATION_TRANSCRIPT_REQUIRED' using errcode = 'P0001';
  end if;

  if v_session.evaluation_version is null and v_session.evaluation_model is null then
    update public.interview_sessions
    set evaluation_version = p_evaluation_version,
        evaluation_model = left(p_model, 160)
    where id = v_answer.session_id
      and user_id = p_user_id;
  elsif v_session.evaluation_version is distinct from p_evaluation_version
    or v_session.evaluation_model is distinct from p_model
  then
    raise exception 'SESSION_EVALUATION_IDENTITY_MISMATCH' using errcode = 'P0001';
  end if;

  v_source_hash := public.answer_evaluation_source_hash(p_answer_id, p_user_id);

  select *
  into v_feedback
  from public.answer_feedback
  where answer_id = p_answer_id
    and evaluation_version = p_evaluation_version
    and source_audio_generation = v_answer.audio_generation
  for update;
  v_exists := found;

  if v_exists
    and v_feedback.evaluation_status = 'completed'
    and v_feedback.source_transcript_sha256 = v_source_hash
    and v_feedback.evaluation_model = p_model
  then
    return v_feedback;
  end if;

  if v_exists
    and v_feedback.evaluation_status = 'processing'
    and v_feedback.evaluation_started_at > now() - interval '8 minutes'
  then
    raise exception 'ANSWER_EVALUATION_ALREADY_PROCESSING' using errcode = 'P0001';
  end if;

  if v_exists and v_feedback.evaluation_status = 'processing' then
    update public.ai_evaluation_requests
    set status = 'failed', error_code = 'LEASE_EXPIRED', completed_at = now()
    where id = v_feedback.evaluation_attempt_id
      and status = 'processing';

    if v_feedback.evaluation_attempt_count >= 3 then
      update public.answer_feedback
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
    insert into public.answer_feedback (
      answer_id,
      evaluation_version,
      source_audio_generation,
      source_transcript_sha256
    ) values (
      p_answer_id,
      p_evaluation_version,
      v_answer.audio_generation,
      v_source_hash
    )
    returning * into v_feedback;
  elsif v_feedback.source_transcript_sha256 is distinct from v_source_hash then
    update public.answer_feedback
    set
      overall_score = null,
      clarity_score = null,
      grammar_score = null,
      confidence_score = null,
      structure_score = null,
      relevance_score = null,
      vocabulary_score = null,
      strengths = null,
      improvements = null,
      better_approach = null,
      improved_answer = null,
      feedback_summary = null,
      filler_words = null,
      evaluation_status = 'pending',
      evaluation_retryable = true,
      evaluation_error = null,
      evaluation_attempt_count = 0,
      evaluation_attempt_id = null,
      evaluation_started_at = null,
      evaluated_at = null,
      source_transcript_sha256 = v_source_hash
    where id = v_feedback.id
    returning * into v_feedback;
  end if;

  if not v_feedback.evaluation_retryable then
    raise exception 'ANSWER_EVALUATION_RECORDING_REQUIRED' using errcode = 'P0001';
  end if;
  if v_feedback.evaluation_attempt_count >= 3 then
    raise exception 'ANSWER_EVALUATION_ATTEMPT_LIMIT' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_daily_requests
  from public.ai_evaluation_requests
  where user_id = p_user_id
    and created_at >= now() - interval '24 hours';

  if v_daily_requests >= 120 then
    raise exception 'AI_EVALUATION_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  update public.answer_feedback
  set
    evaluation_status = 'processing',
    evaluation_model = left(p_model, 160),
    evaluation_retryable = true,
    evaluation_error = null,
    evaluation_attempt_count = evaluation_attempt_count + 1,
    evaluation_attempt_id = p_attempt_id,
    evaluation_started_at = now(),
    evaluated_at = null,
    provider_request_id = null,
    ai_input_tokens = null,
    ai_output_tokens = null
  where id = v_feedback.id
  returning * into v_feedback;

  insert into public.ai_evaluation_requests (
    id,
    user_id,
    evaluation_kind,
    answer_id,
    evaluation_version,
    model
  ) values (
    p_attempt_id,
    p_user_id,
    'answer',
    p_answer_id,
    p_evaluation_version,
    left(p_model, 160)
  );

  return v_feedback;
end;
$$;

create or replace function public.complete_answer_evaluation(
  p_answer_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_evaluation_version text,
  p_source_audio_generation integer,
  p_relevance_score integer,
  p_structure_score integer,
  p_clarity_score integer,
  p_grammar_score integer,
  p_vocabulary_score integer,
  p_confidence_score integer,
  p_feedback_summary text,
  p_strengths jsonb,
  p_improvements jsonb,
  p_better_approach text,
  p_improved_answer text,
  p_filler_words jsonb,
  p_model text,
  p_provider_request_id text,
  p_ai_input_tokens integer,
  p_ai_output_tokens integer
)
returns public.answer_feedback
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feedback public.answer_feedback;
  v_overall integer;
  v_session_id uuid;
begin
  if p_relevance_score is null or p_relevance_score not between 0 and 100
    or p_structure_score is null or p_structure_score not between 0 and 100
    or p_clarity_score is null or p_clarity_score not between 0 and 100
    or p_grammar_score is null or p_grammar_score not between 0 and 100
    or p_vocabulary_score is null or p_vocabulary_score not between 0 and 100
    or p_confidence_score is null or p_confidence_score not between 0 and 100
    or nullif(btrim(p_feedback_summary), '') is null
    or nullif(btrim(p_better_approach), '') is null
    or nullif(btrim(p_improved_answer), '') is null
    or p_strengths is null
    or jsonb_typeof(p_strengths) <> 'array'
    or jsonb_array_length(p_strengths) not between 1 and 3
    or p_improvements is null
    or jsonb_typeof(p_improvements) <> 'array'
    or jsonb_array_length(p_improvements) not between 1 and 3
    or p_filler_words is null
    or jsonb_typeof(p_filler_words) <> 'array'
    or nullif(btrim(p_model), '') is null
    or (p_ai_input_tokens is not null and p_ai_input_tokens < 0)
    or (p_ai_output_tokens is not null and p_ai_output_tokens < 0)
  then
    raise exception 'ANSWER_EVALUATION_INVALID_RESULT' using errcode = '22023';
  end if;

  select answer.session_id
  into v_session_id
  from public.interview_answers as answer
  join public.interview_sessions as session
    on session.id = answer.session_id
    and session.user_id = answer.user_id
  where answer.id = p_answer_id
    and answer.user_id = p_user_id
    and answer.audio_generation = p_source_audio_generation
    and session.status <> 'completed'
    and session.evaluation_version = p_evaluation_version
    and session.evaluation_model = p_model
    and not exists (
      select 1
      from public.interview_session_feedback
      where session_id = answer.session_id
        and evaluation_status = 'completed'
    )
  for update of session;

  if v_session_id is null then
    raise exception 'ANSWER_EVALUATION_SUPERSEDED' using errcode = 'P0001';
  end if;

  v_overall := round(
    p_relevance_score * 0.25
    + p_structure_score * 0.20
    + p_clarity_score * 0.20
    + p_grammar_score * 0.10
    + p_vocabulary_score * 0.10
    + p_confidence_score * 0.15
  );

  update public.answer_feedback as feedback
  set
    overall_score = v_overall,
    relevance_score = p_relevance_score,
    structure_score = p_structure_score,
    clarity_score = p_clarity_score,
    grammar_score = p_grammar_score,
    vocabulary_score = p_vocabulary_score,
    confidence_score = p_confidence_score,
    feedback_summary = btrim(p_feedback_summary),
    strengths = p_strengths,
    improvements = p_improvements,
    better_approach = btrim(p_better_approach),
    improved_answer = btrim(p_improved_answer),
    filler_words = p_filler_words,
    evaluation_status = 'completed',
    evaluation_model = left(p_model, 160),
    evaluation_retryable = true,
    evaluation_error = null,
    evaluated_at = now(),
    provider_request_id = left(p_provider_request_id, 255),
    ai_input_tokens = p_ai_input_tokens,
    ai_output_tokens = p_ai_output_tokens
  where feedback.answer_id = p_answer_id
    and feedback.evaluation_version = p_evaluation_version
    and feedback.source_audio_generation = p_source_audio_generation
    and feedback.evaluation_status = 'processing'
    and feedback.evaluation_attempt_id = p_attempt_id
    and exists (
      select 1
      from public.interview_answers as answer
      where answer.id = p_answer_id
        and answer.user_id = p_user_id
        and answer.audio_generation = p_source_audio_generation
        and answer.transcription_status = 'completed'
        and feedback.source_transcript_sha256 = public.answer_evaluation_source_hash(
          p_answer_id,
          p_user_id
        )
    )
  returning * into v_feedback;

  if v_feedback.id is null then
    raise exception 'ANSWER_EVALUATION_SUPERSEDED' using errcode = 'P0001';
  end if;

  update public.interview_answers
  set score = v_overall
  where id = p_answer_id
    and user_id = p_user_id
    and audio_generation = p_source_audio_generation;

  update public.ai_evaluation_requests
  set
    status = 'completed',
    provider_request_id = left(p_provider_request_id, 255),
    ai_input_tokens = p_ai_input_tokens,
    ai_output_tokens = p_ai_output_tokens,
    completed_at = now()
  where id = p_attempt_id
    and user_id = p_user_id
    and answer_id = p_answer_id;

  return v_feedback;
end;
$$;

create or replace function public.fail_answer_evaluation(
  p_answer_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
)
returns public.answer_feedback
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feedback public.answer_feedback;
begin
  update public.answer_feedback
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
  where answer_id = p_answer_id
    and evaluation_attempt_id = p_attempt_id
    and evaluation_status = 'processing'
    and exists (
      select 1
      from public.interview_answers as answer
      where answer.id = p_answer_id
        and answer.user_id = p_user_id
    )
  returning * into v_feedback;

  if v_feedback.id is null then
    return null;
  end if;

  update public.ai_evaluation_requests
  set
    status = 'failed',
    error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'UNKNOWN'), 160),
    completed_at = now()
  where id = p_attempt_id
    and user_id = p_user_id;

  return v_feedback;
end;
$$;

create or replace function public.claim_interview_finalization(
  p_session_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_evaluation_version text,
  p_model text
)
returns public.interview_session_feedback
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.interview_sessions;
  v_feedback public.interview_session_feedback;
  v_exists boolean := false;
  v_question_count integer;
  v_answer_count integer;
  v_transcript_count integer;
  v_evaluated_count integer;
  v_daily_requests integer;
  v_daily_session_requests integer;
  v_fingerprint text;
begin
  if p_session_id is null or p_user_id is null or p_attempt_id is null
    or p_evaluation_version is null
    or p_evaluation_version !~ '^[a-zA-Z0-9._-]{1,40}$'
    or nullif(btrim(p_model), '') is null
  then
    raise exception 'INTERVIEW_FINALIZATION_INVALID_CLAIM' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-evaluation-quota:' || p_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'interview-finalization:' || p_session_id::text,
      0
    )
  );

  select *
  into v_session
  from public.interview_sessions
  where id = p_session_id
    and user_id = p_user_id
  for update;

  if v_session.id is null then
    raise exception 'INTERVIEW_FINALIZATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_session.status = 'abandoned' then
    raise exception 'INTERVIEW_FINALIZATION_ABANDONED' using errcode = 'P0001';
  end if;
  if v_session.evaluation_version is distinct from p_evaluation_version
    or v_session.evaluation_model is distinct from p_model
  then
    raise exception 'SESSION_EVALUATION_IDENTITY_MISMATCH' using errcode = 'P0001';
  end if;

  select
    count(*)::integer,
    count(answer.id)::integer,
    count(answer.id) filter (
      where answer.transcription_status = 'completed'
        and nullif(btrim(answer.transcript), '') is not null
    )::integer,
    count(feedback.id) filter (
      where feedback.evaluation_status = 'completed'
    )::integer,
    public.interview_finalization_source_hash(
      p_session_id,
      p_user_id,
      p_evaluation_version
    )
  into
    v_question_count,
    v_answer_count,
    v_transcript_count,
    v_evaluated_count,
    v_fingerprint
  from public.interview_questions as question
  left join public.interview_answers as answer
    on answer.question_id = question.id
    and answer.session_id = question.session_id
    and answer.user_id = p_user_id
  left join public.answer_feedback as feedback
    on feedback.answer_id = answer.id
    and feedback.evaluation_version = p_evaluation_version
    and feedback.source_audio_generation = answer.audio_generation
    and feedback.evaluation_status = 'completed'
    and feedback.evaluation_model = v_session.evaluation_model
    and feedback.source_transcript_sha256 = public.answer_evaluation_source_hash(
      answer.id,
      p_user_id
    )
  where question.session_id = p_session_id;

  if v_question_count <> v_session.total_questions
    or v_answer_count <> v_session.total_questions
    or v_transcript_count <> v_session.total_questions
  then
    raise exception 'INTERVIEW_FINALIZATION_INCOMPLETE_ANSWERS' using errcode = 'P0001';
  end if;
  if v_evaluated_count <> v_session.total_questions then
    raise exception 'INTERVIEW_FINALIZATION_INCOMPLETE_FEEDBACK' using errcode = 'P0001';
  end if;

  select *
  into v_feedback
  from public.interview_session_feedback
  where session_id = p_session_id
    and evaluation_version = p_evaluation_version
  for update;
  v_exists := found;

  if v_exists
    and v_feedback.evaluation_status = 'completed'
    and v_feedback.source_fingerprint = v_fingerprint
  then
    return v_feedback;
  end if;

  if v_session.status = 'completed' then
    raise exception 'INTERVIEW_ALREADY_FINALIZED' using errcode = 'P0001';
  end if;

  if v_exists
    and v_feedback.evaluation_status = 'processing'
    and v_feedback.evaluation_started_at > now() - interval '8 minutes'
  then
    raise exception 'INTERVIEW_FINALIZATION_ALREADY_PROCESSING' using errcode = 'P0001';
  end if;

  if v_exists and v_feedback.evaluation_status = 'processing' then
    update public.ai_evaluation_requests
    set status = 'failed', error_code = 'LEASE_EXPIRED', completed_at = now()
    where id = v_feedback.evaluation_attempt_id
      and status = 'processing';

    if v_feedback.evaluation_attempt_count >= 3 then
      update public.interview_session_feedback
      set
        evaluation_status = 'failed',
        evaluation_retryable = false,
        evaluation_error = 'ATTEMPT_LIMIT: Final feedback retry limit reached.'
      where id = v_feedback.id
      returning * into v_feedback;
      return v_feedback;
    end if;
  end if;

  if not v_exists then
    insert into public.interview_session_feedback (
      session_id,
      user_id,
      evaluation_version,
      source_fingerprint
    ) values (
      p_session_id,
      p_user_id,
      p_evaluation_version,
      v_fingerprint
    )
    returning * into v_feedback;
  elsif v_feedback.source_fingerprint is distinct from v_fingerprint then
    update public.interview_session_feedback
    set
      overall_score = null,
      clarity_score = null,
      grammar_score = null,
      confidence_score = null,
      structure_score = null,
      relevance_score = null,
      vocabulary_score = null,
      summary = null,
      performance_label = null,
      strengths = null,
      focus_areas = null,
      recommended_practice_type = null,
      recommended_practice_reason = null,
      strongest_answer_id = null,
      focus_answer_id = null,
      evaluation_status = 'pending',
      evaluation_retryable = true,
      evaluation_error = null,
      evaluation_attempt_count = 0,
      evaluation_attempt_id = null,
      evaluation_started_at = null,
      evaluated_at = null,
      source_fingerprint = v_fingerprint
    where id = v_feedback.id
    returning * into v_feedback;
  end if;

  if not v_feedback.evaluation_retryable then
    raise exception 'INTERVIEW_FINALIZATION_NOT_RETRYABLE' using errcode = 'P0001';
  end if;
  if v_feedback.evaluation_attempt_count >= 3 then
    raise exception 'INTERVIEW_FINALIZATION_ATTEMPT_LIMIT' using errcode = 'P0001';
  end if;

  select
    count(*)::integer,
    count(*) filter (where evaluation_kind = 'session')::integer
  into v_daily_requests, v_daily_session_requests
  from public.ai_evaluation_requests
  where user_id = p_user_id
    and created_at >= now() - interval '24 hours';

  if v_daily_requests >= 120 or v_daily_session_requests >= 20 then
    raise exception 'AI_EVALUATION_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  update public.interview_session_feedback
  set
    evaluation_status = 'processing',
    evaluation_model = left(p_model, 160),
    evaluation_retryable = true,
    evaluation_error = null,
    evaluation_attempt_count = evaluation_attempt_count + 1,
    evaluation_attempt_id = p_attempt_id,
    evaluation_started_at = now(),
    evaluated_at = null,
    provider_request_id = null,
    ai_input_tokens = null,
    ai_output_tokens = null
  where id = v_feedback.id
  returning * into v_feedback;

  insert into public.ai_evaluation_requests (
    id,
    user_id,
    evaluation_kind,
    session_id,
    evaluation_version,
    model
  ) values (
    p_attempt_id,
    p_user_id,
    'session',
    p_session_id,
    p_evaluation_version,
    left(p_model, 160)
  );

  return v_feedback;
end;
$$;

create or replace function public.complete_interview_finalization(
  p_session_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_evaluation_version text,
  p_summary text,
  p_strengths jsonb,
  p_focus_areas jsonb,
  p_recommended_practice_type text,
  p_recommended_practice_reason text,
  p_model text,
  p_provider_request_id text,
  p_ai_input_tokens integer,
  p_ai_output_tokens integer
)
returns public.interview_session_feedback
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.interview_sessions;
  v_feedback public.interview_session_feedback;
  v_fingerprint text;
  v_count integer;
  v_overall integer;
  v_clarity integer;
  v_grammar integer;
  v_confidence integer;
  v_structure integer;
  v_relevance integer;
  v_vocabulary integer;
  v_duration integer;
  v_strongest_answer_id uuid;
  v_focus_answer_id uuid;
  v_performance_label text;
begin
  if nullif(btrim(p_summary), '') is null
    or p_strengths is null
    or jsonb_typeof(p_strengths) <> 'array'
    or jsonb_array_length(p_strengths) not between 1 and 3
    or p_focus_areas is null
    or jsonb_typeof(p_focus_areas) <> 'array'
    or jsonb_array_length(p_focus_areas) not between 1 and 3
    or p_recommended_practice_type is null
    or p_recommended_practice_type not in (
      'behavioral', 'technical', 'quick', 'speaking', 'job_specific'
    )
    or nullif(btrim(p_recommended_practice_reason), '') is null
    or nullif(btrim(p_model), '') is null
    or (p_ai_input_tokens is not null and p_ai_input_tokens < 0)
    or (p_ai_output_tokens is not null and p_ai_output_tokens < 0)
  then
    raise exception 'INTERVIEW_FINALIZATION_INVALID_RESULT' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interview-finalization:' || p_session_id::text, 0)
  );

  select *
  into v_session
  from public.interview_sessions
  where id = p_session_id
    and user_id = p_user_id
    and status <> 'abandoned'
    and evaluation_version = p_evaluation_version
    and evaluation_model = p_model
  for update;

  if v_session.id is null then
    raise exception 'INTERVIEW_FINALIZATION_SUPERSEDED' using errcode = 'P0001';
  end if;

  select
    count(*)::integer,
    round(avg(feedback.overall_score))::integer,
    round(avg(feedback.clarity_score))::integer,
    round(avg(feedback.grammar_score))::integer,
    round(avg(feedback.confidence_score))::integer,
    round(avg(feedback.structure_score))::integer,
    round(avg(feedback.relevance_score))::integer,
    round(avg(feedback.vocabulary_score))::integer
  into
    v_count,
    v_overall,
    v_clarity,
    v_grammar,
    v_confidence,
    v_structure,
    v_relevance,
    v_vocabulary
  from public.interview_answers as answer
  join public.interview_questions as question
    on question.id = answer.question_id
    and question.session_id = answer.session_id
  join public.answer_feedback as feedback
    on feedback.answer_id = answer.id
    and feedback.evaluation_version = p_evaluation_version
    and feedback.source_audio_generation = answer.audio_generation
    and feedback.evaluation_status = 'completed'
    and feedback.evaluation_model = p_model
    and feedback.source_transcript_sha256 = public.answer_evaluation_source_hash(
      answer.id,
      p_user_id
    )
  where answer.session_id = p_session_id
    and answer.user_id = p_user_id;

  if v_count <> v_session.total_questions then
    raise exception 'INTERVIEW_FINALIZATION_INCOMPLETE_FEEDBACK' using errcode = 'P0001';
  end if;

  select coalesce(sum(duration_seconds), 0)::integer
  into v_duration
  from public.interview_answers
  where session_id = p_session_id
    and user_id = p_user_id
    and transcription_status = 'completed';

  select public.interview_finalization_source_hash(
    p_session_id,
    p_user_id,
    p_evaluation_version
  )
  into v_fingerprint
  ;

  select answer.id
  into v_strongest_answer_id
  from public.interview_answers as answer
  join public.interview_questions as question on question.id = answer.question_id
  join public.answer_feedback as feedback
    on feedback.answer_id = answer.id
    and feedback.evaluation_version = p_evaluation_version
    and feedback.source_audio_generation = answer.audio_generation
    and feedback.evaluation_status = 'completed'
  where answer.session_id = p_session_id
    and answer.user_id = p_user_id
  order by feedback.overall_score desc, question.question_number asc
  limit 1;

  select answer.id
  into v_focus_answer_id
  from public.interview_answers as answer
  join public.interview_questions as question on question.id = answer.question_id
  join public.answer_feedback as feedback
    on feedback.answer_id = answer.id
    and feedback.evaluation_version = p_evaluation_version
    and feedback.source_audio_generation = answer.audio_generation
    and feedback.evaluation_status = 'completed'
  where answer.session_id = p_session_id
    and answer.user_id = p_user_id
  order by feedback.overall_score asc, question.question_number asc
  limit 1;

  v_performance_label := case
    when v_overall >= 90 then 'Excellent interview'
    when v_overall >= 80 then 'Strong interview'
    when v_overall >= 70 then 'Good interview'
    when v_overall >= 60 then 'Developing'
    else 'Needs more practice'
  end;

  update public.interview_session_feedback
  set
    overall_score = v_overall,
    clarity_score = v_clarity,
    grammar_score = v_grammar,
    confidence_score = v_confidence,
    structure_score = v_structure,
    relevance_score = v_relevance,
    vocabulary_score = v_vocabulary,
    summary = btrim(p_summary),
    performance_label = v_performance_label,
    strengths = p_strengths,
    focus_areas = p_focus_areas,
    recommended_practice_type = p_recommended_practice_type,
    recommended_practice_reason = btrim(p_recommended_practice_reason),
    strongest_answer_id = v_strongest_answer_id,
    focus_answer_id = v_focus_answer_id,
    evaluation_status = 'completed',
    evaluation_model = left(p_model, 160),
    evaluation_retryable = true,
    evaluation_error = null,
    evaluated_at = now(),
    provider_request_id = left(p_provider_request_id, 255),
    ai_input_tokens = p_ai_input_tokens,
    ai_output_tokens = p_ai_output_tokens
  where session_id = p_session_id
    and user_id = p_user_id
    and evaluation_version = p_evaluation_version
    and evaluation_status = 'processing'
    and evaluation_attempt_id = p_attempt_id
    and source_fingerprint = v_fingerprint
  returning * into v_feedback;

  if v_feedback.id is null then
    raise exception 'INTERVIEW_FINALIZATION_SUPERSEDED' using errcode = 'P0001';
  end if;

  update public.interview_sessions
  set
    overall_score = v_overall,
    duration_seconds = v_duration,
    status = 'completed',
    completed_at = coalesce(completed_at, now())
  where id = p_session_id
    and user_id = p_user_id;

  update public.ai_evaluation_requests
  set
    status = 'completed',
    provider_request_id = left(p_provider_request_id, 255),
    ai_input_tokens = p_ai_input_tokens,
    ai_output_tokens = p_ai_output_tokens,
    completed_at = now()
  where id = p_attempt_id
    and user_id = p_user_id
    and session_id = p_session_id;

  return v_feedback;
end;
$$;

create or replace function public.fail_interview_finalization(
  p_session_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
)
returns public.interview_session_feedback
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feedback public.interview_session_feedback;
begin
  update public.interview_session_feedback
  set
    evaluation_status = 'failed',
    evaluation_error = left(
      coalesce(nullif(btrim(p_error_code), ''), 'UNKNOWN')
      || ': '
      || coalesce(nullif(btrim(p_error_message), ''), 'Finalization failed'),
      1000
    ),
    evaluation_retryable = coalesce(p_retryable, false)
      and evaluation_attempt_count < 3
  where session_id = p_session_id
    and user_id = p_user_id
    and evaluation_attempt_id = p_attempt_id
    and evaluation_status = 'processing'
  returning * into v_feedback;

  if v_feedback.id is null then
    return null;
  end if;

  update public.ai_evaluation_requests
  set
    status = 'failed',
    error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'UNKNOWN'), 160),
    completed_at = now()
  where id = p_attempt_id
    and user_id = p_user_id;

  return v_feedback;
end;
$$;

-- One owner-scoped payload powers both current and historical Results screens.
create or replace function public.get_interview_result(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.interview_sessions;
  v_feedback public.interview_session_feedback;
  v_previous public.interview_sessions;
  v_previous_feedback public.interview_session_feedback;
  v_readiness_before integer;
  v_readiness_after integer;
  v_answers jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into v_session
  from public.interview_sessions
  where id = p_session_id
    and user_id = v_user_id;

  if v_session.id is null then
    raise exception 'INTERVIEW_RESULT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
  into v_feedback
  from public.interview_session_feedback
  where session_id = p_session_id
    and user_id = v_user_id
    and evaluation_version = v_session.evaluation_version
    and evaluation_status = 'completed'
  limit 1;

  if v_feedback.id is null then
    raise exception 'INTERVIEW_RESULT_NOT_READY' using errcode = 'P0001';
  end if;

  select *
  into v_previous
  from public.interview_sessions
  where user_id = v_user_id
    and status = 'completed'
    and overall_score is not null
    and id <> p_session_id
    and completed_at < coalesce(v_session.completed_at, now())
  order by completed_at desc
  limit 1;

  if v_previous.id is not null then
    select *
    into v_previous_feedback
    from public.interview_session_feedback
    where session_id = v_previous.id
      and user_id = v_user_id
      and evaluation_version = v_previous.evaluation_version
      and evaluation_status = 'completed'
    limit 1;
  end if;

  select round(avg(overall_score))::integer
  into v_readiness_before
  from (
    select overall_score
    from public.interview_sessions
    where user_id = v_user_id
      and status = 'completed'
      and overall_score is not null
      and id <> p_session_id
      and completed_at < coalesce(v_session.completed_at, now())
    order by completed_at desc
    limit 5
  ) as previous_scores;

  select round(avg(overall_score))::integer
  into v_readiness_after
  from (
    select overall_score
    from public.interview_sessions
    where user_id = v_user_id
      and status = 'completed'
      and overall_score is not null
      and completed_at <= coalesce(v_session.completed_at, now())
    order by completed_at desc
    limit 5
  ) as current_scores;

  select coalesce(jsonb_agg(answer_result order by question_number), '[]'::jsonb)
  into v_answers
  from (
    select
      question.question_number,
      jsonb_build_object(
        'id', answer.id,
        'questionNumber', question.question_number,
        'question', question.question_text,
        'questionType', question.question_type,
        'transcript', answer.transcript,
        'durationSeconds', answer.duration_seconds,
        'wordCount', answer.word_count,
        'speakingPace', answer.speaking_pace,
        'score', feedback.overall_score,
        'scores', jsonb_build_object(
          'relevance', feedback.relevance_score,
          'structure', feedback.structure_score,
          'clarity', feedback.clarity_score,
          'grammar', feedback.grammar_score,
          'vocabulary', feedback.vocabulary_score,
          'confidence', feedback.confidence_score
        ),
        'summary', feedback.feedback_summary,
        'strengths', coalesce(feedback.strengths, '[]'::jsonb),
        'improvements', coalesce(feedback.improvements, '[]'::jsonb),
        'betterApproach', feedback.better_approach,
        'improvedAnswer', feedback.improved_answer,
        'fillerWords', coalesce(feedback.filler_words, '[]'::jsonb),
        'feedbackStatus', coalesce(feedback.evaluation_status, 'unavailable')
      ) as answer_result
    from public.interview_questions as question
    join public.interview_answers as answer
      on answer.question_id = question.id
      and answer.session_id = question.session_id
      and answer.user_id = v_user_id
    left join public.answer_feedback as feedback
      on feedback.answer_id = answer.id
      and feedback.evaluation_version = v_feedback.evaluation_version
      and feedback.source_audio_generation = answer.audio_generation
      and feedback.evaluation_model = v_session.evaluation_model
      and feedback.source_transcript_sha256 = public.answer_evaluation_source_hash(
        answer.id,
        v_user_id
      )
    where question.session_id = p_session_id
  ) as ordered_answers;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'role', v_session.role,
      'interviewType', v_session.interview_type,
      'difficulty', v_session.difficulty,
      'interviewerStyle', v_session.interviewer_style,
      'score', v_session.overall_score,
      'durationSeconds', v_session.duration_seconds,
      'completedAt', v_session.completed_at
    ),
    'feedback', jsonb_build_object(
      'performanceLabel', v_feedback.performance_label,
      'summary', v_feedback.summary,
      'scores', jsonb_build_object(
        'relevance', v_feedback.relevance_score,
        'structure', v_feedback.structure_score,
        'clarity', v_feedback.clarity_score,
        'grammar', v_feedback.grammar_score,
        'vocabulary', v_feedback.vocabulary_score,
        'confidence', v_feedback.confidence_score
      ),
      'strengths', v_feedback.strengths,
      'focusAreas', v_feedback.focus_areas,
      'recommendedPractice', jsonb_build_object(
        'type', v_feedback.recommended_practice_type,
        'reason', v_feedback.recommended_practice_reason
      ),
      'strongestAnswerId', v_feedback.strongest_answer_id,
      'focusAnswerId', v_feedback.focus_answer_id,
      'evaluationVersion', v_feedback.evaluation_version
    ),
    'answers', v_answers,
    'previousScore', v_previous.overall_score,
    'readinessBefore', v_readiness_before,
    'readinessAfter', v_readiness_after,
    'previousConfidence', v_previous_feedback.confidence_score,
    'previousStructure', v_previous_feedback.structure_score
  );
end;
$$;

-- One aggregate query supplies Home and Progress without client-side fan-out.
create or replace function public.get_user_practice_metrics()
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

  with ranked_sessions as (
    select
      session.*,
      row_number() over (order by session.completed_at desc, session.id) as recency
    from public.interview_sessions as session
    where session.user_id = v_user_id
      and session.status = 'completed'
      and session.overall_score is not null
      and session.completed_at is not null
  ),
  latest_feedback as (
    select feedback.*
    from public.interview_session_feedback as feedback
    join public.interview_sessions as session
      on session.id = feedback.session_id
      and session.user_id = feedback.user_id
      and session.evaluation_version = feedback.evaluation_version
    where feedback.user_id = v_user_id
      and feedback.evaluation_status = 'completed'
  ),
  recent as (
    select * from ranked_sessions where recency <= 5
  ),
  previous as (
    select * from ranked_sessions where recency between 6 and 10
  )
  select jsonb_build_object(
    'readinessScore', (select round(avg(overall_score))::integer from recent),
    'previousReadinessScore', (select round(avg(overall_score))::integer from previous),
    'sessionsCompleted', (select count(*)::integer from ranked_sessions),
    'practiceSeconds', (
      select coalesce(sum(duration_seconds), 0) from ranked_sessions
    ),
    'skills', jsonb_build_object(
      'relevance', (select round(avg(feedback.relevance_score))::integer from recent join latest_feedback as feedback on feedback.session_id = recent.id),
      'structure', (select round(avg(feedback.structure_score))::integer from recent join latest_feedback as feedback on feedback.session_id = recent.id),
      'clarity', (select round(avg(feedback.clarity_score))::integer from recent join latest_feedback as feedback on feedback.session_id = recent.id),
      'grammar', (select round(avg(feedback.grammar_score))::integer from recent join latest_feedback as feedback on feedback.session_id = recent.id),
      'vocabulary', (select round(avg(feedback.vocabulary_score))::integer from recent join latest_feedback as feedback on feedback.session_id = recent.id),
      'confidence', (select round(avg(feedback.confidence_score))::integer from recent join latest_feedback as feedback on feedback.session_id = recent.id)
    ),
    'recentSessions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'role', role,
          'interviewType', interview_type,
          'score', overall_score,
          'durationSeconds', duration_seconds,
          'completedAt', completed_at
        ) order by completed_at desc
      )
      from recent
    ), '[]'::jsonb),
    'practiceCompletedAt', coalesce((
      select jsonb_agg(completed_at order by completed_at)
      from ranked_sessions
      where completed_at >= now() - interval '365 days'
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.prepare_answer_audio_generation() from public, anon, authenticated;

revoke all on function public.answer_evaluation_source_hash(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.interview_finalization_source_hash(uuid, uuid, text)
  from public, anon, authenticated;

revoke all on function public.claim_answer_evaluation(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_answer_evaluation(uuid, uuid, uuid, text, text)
  to service_role;

revoke all on function public.complete_answer_evaluation(
  uuid, uuid, uuid, text, integer,
  integer, integer, integer, integer, integer, integer,
  text, jsonb, jsonb, text, text, jsonb, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.complete_answer_evaluation(
  uuid, uuid, uuid, text, integer,
  integer, integer, integer, integer, integer, integer,
  text, jsonb, jsonb, text, text, jsonb, text, text, integer, integer
) to service_role;

revoke all on function public.fail_answer_evaluation(uuid, uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.fail_answer_evaluation(uuid, uuid, uuid, text, text, boolean)
  to service_role;

revoke all on function public.claim_interview_finalization(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_interview_finalization(uuid, uuid, uuid, text, text)
  to service_role;

revoke all on function public.complete_interview_finalization(
  uuid, uuid, uuid, text, text, jsonb, jsonb, text, text, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.complete_interview_finalization(
  uuid, uuid, uuid, text, text, jsonb, jsonb, text, text, text, text, integer, integer
) to service_role;

revoke all on function public.fail_interview_finalization(uuid, uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.fail_interview_finalization(uuid, uuid, uuid, text, text, boolean)
  to service_role;

revoke all on function public.get_interview_result(uuid) from public, anon;
grant execute on function public.get_interview_result(uuid) to authenticated;

revoke all on function public.get_user_practice_metrics() from public, anon;
grant execute on function public.get_user_practice_metrics() to authenticated;

notify pgrst, 'reload schema';

commit;

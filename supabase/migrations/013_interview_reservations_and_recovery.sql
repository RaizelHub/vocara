begin;

-- A reservation pays for the entire question set, once. It survives day/plan
-- changes and process death. No automatic refund on abandon (prevents recycling
-- an allowance after provider work). No client writes to this ledger.
create table public.interview_reservations (
  session_id uuid primary key references public.interview_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_count integer not null check (question_count between 1 and 12),
  reserved_at timestamptz not null default now()
);
create index interview_reservations_user_reserved_idx
  on public.interview_reservations(user_id,reserved_at);
alter table public.interview_reservations enable row level security;
revoke all on public.interview_reservations from public, anon, authenticated;
grant select on public.interview_reservations to authenticated;
grant all on public.interview_reservations to service_role;
create policy reservations_select_own on public.interview_reservations
  for select to authenticated using (user_id = (select auth.uid()));

-- Honor sessions admitted before reservations existed. They must be recoverable
-- without another allowance charge. This one-time backfill grants only existing,
-- valid active question sets; future admissions use the atomic RPC below.
insert into public.interview_reservations(session_id,user_id,question_count)
select s.id,s.user_id,s.total_questions
from public.interview_sessions s
where s.status = 'in_progress' and s.total_questions between 1 and 12
  and (select count(*) from public.interview_questions q where q.session_id=s.id) = s.total_questions
  and not exists (select 1 from public.interview_questions q where q.session_id=s.id
    and q.question_number not between 1 and s.total_questions);

create or replace function public.start_interview_session(p_session_id uuid)
returns public.interview_sessions language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_session public.interview_sessions;
  v_question record;
  v_count integer;
  v_daily_questions integer;
  v_daily_sessions integer;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  -- Same lock as speaking's check_feature_access: all allowance consumers serialize.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'vocara-feature-usage:' || v_user::text || ':ai_feedback', 0));
  select * into v_session from public.interview_sessions
    where id = p_session_id and user_id = v_user for update;
  if v_session.id is null or v_session.status not in ('created', 'in_progress') then
    raise exception 'INTERVIEW_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.interview_reservations where session_id = p_session_id) then
    return v_session;
  end if;
  select count(*) into v_count from public.interview_questions where session_id = p_session_id;
  if v_count <> v_session.total_questions or v_count not between 1 and 12
    or exists (select 1 from public.interview_questions where session_id = p_session_id
      and question_number not between 1 and v_count) then
    raise exception 'INTERVIEW_INVALID_QUESTIONS' using errcode = '22023';
  end if;
  -- Admission safety budget, independent of commercial plan. Once admitted,
  -- per-question retry bounds replace rolling daily stops inside the interview.
  select coalesce(sum(question_count), 0), count(*) into v_daily_questions, v_daily_sessions
    from public.interview_reservations where user_id = v_user
      and reserved_at >= now() - interval '24 hours';
  if v_daily_questions + v_count > 30 or v_daily_sessions >= 20 then
    raise exception 'INTERVIEW_START_DAILY_LIMIT' using errcode = 'P0001';
  end if;
  for v_question in select q.id from public.interview_questions q where q.session_id = p_session_id loop
    -- Legacy sessions pay only for unfinished questions. Existing completed,
    -- current-generation feedback remains authoritative and is not evaluated again.
    if not exists (
      select 1 from public.interview_answers a join public.answer_feedback f on f.answer_id = a.id
      where a.question_id = v_question.id and f.evaluation_status = 'completed'
        and f.source_audio_generation = a.audio_generation
        and f.evaluation_version = v_session.evaluation_version
        and f.evaluation_model = v_session.evaluation_model
    ) then
      perform public.check_feature_access(v_user, 'ai_feedback', 'interview-question:' || v_question.id::text);
    end if;
  end loop;
  insert into public.interview_reservations(session_id, user_id, question_count)
    values (p_session_id, v_user, v_count);
  update public.interview_sessions set status = 'in_progress', started_at = coalesce(started_at, now())
    where id = p_session_id returning * into v_session;
  return v_session;
end;
$$;

-- Creation, questions, and reservation commit or roll back together. The client
-- supplies a stable UUID, so an unknown network outcome is safe to retry.
create function public.create_reserved_interview(
  p_session_id uuid, p_role text, p_type text, p_difficulty text, p_style text, p_questions jsonb
) returns public.interview_sessions language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_session public.interview_sessions;
  v_count integer;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if p_session_id is null or jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'INTERVIEW_INVALID_QUESTIONS' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_questions);
  if v_count not between 1 and 12 or p_type not in ('standard','behavioral','situational','technical','mixed')
    or p_type is null then raise exception 'INTERVIEW_INVALID_QUESTIONS' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'vocara-feature-usage:' || v_user::text || ':ai_feedback', 0));
  select * into v_session from public.interview_sessions where id = p_session_id;
  if found then
    if v_session.user_id <> v_user then raise exception 'INTERVIEW_SESSION_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_session.role <> btrim(p_role) or v_session.interview_type <> p_type
      or v_session.difficulty <> p_difficulty or v_session.interviewer_style <> p_style
      or v_session.total_questions <> v_count
      or exists (
        select 1 from jsonb_array_elements(p_questions) with ordinality x(value, n)
        left join public.interview_questions q on q.session_id = p_session_id and q.question_number = x.n
        where q.id is distinct from (x.value->>'id')::uuid or q.question_text is distinct from x.value->>'text'
      ) then raise exception 'INTERVIEW_REQUEST_CONFLICT' using errcode = '22023'; end if;
  else
    insert into public.interview_sessions(id,user_id,role,interview_type,difficulty,interviewer_style,total_questions)
      values (p_session_id,v_user,btrim(p_role),p_type,p_difficulty,p_style,v_count);
    insert into public.interview_questions(id,session_id,question_number,question_text,question_type)
      select (value->>'id')::uuid,p_session_id,n::integer,value->>'text',p_type
      from jsonb_array_elements(p_questions) with ordinality x(value,n);
  end if;
  return public.start_interview_session(p_session_id);
end;
$$;

-- Freeze question sets. Generated interviews already use service-role RPCs.
revoke insert on public.interview_sessions, public.interview_questions from authenticated;
revoke insert (id,user_id,role,interview_type,difficulty,interviewer_style,status,total_questions,started_at)
  on public.interview_sessions from authenticated;
revoke insert (id,session_id,question_number,question_text,question_type)
  on public.interview_questions from authenticated;

create function public.require_interview_reservation(p_session_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.interview_reservations r join public.interview_sessions s on s.id = r.session_id
    where r.session_id = p_session_id and r.user_id = p_user_id
      and s.user_id = p_user_id and s.status in ('in_progress','completed')
  ) then raise exception 'INTERVIEW_RESERVATION_REQUIRED' using errcode = 'P0001'; end if;
end;
$$;
revoke all on function public.require_interview_reservation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.require_interview_reservation(uuid,uuid) to service_role;
revoke all on function public.create_reserved_interview(uuid,text,text,text,text,jsonb) from public,anon;
grant execute on function public.create_reserved_interview(uuid,text,text,text,text,jsonb) to authenticated;

-- Recovery is read-only, owner-scoped, and never invokes a provider. Return only
-- feedback matching the session identity and current audio generation.
create function public.get_interview_recovery(p_session_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_session public.interview_sessions;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into v_session from public.interview_sessions
    where user_id = v_user and
      ((p_session_id is not null and id = p_session_id) or
       (p_session_id is null and status = 'in_progress'))
    order by started_at desc nulls last, created_at desc, id limit 1;
  if v_session.id is null then return null; end if;
  return jsonb_build_object('session',to_jsonb(v_session),'questions',coalesce((
    select jsonb_agg(jsonb_build_object('question',to_jsonb(q),'answer',to_jsonb(a),'feedback',to_jsonb(f),
      'retryExhausted', (a.transcription_status <> 'completed' and (select count(*) from public.transcription_requests t where t.answer_id=a.id) >= 6)
        or (coalesce(f.evaluation_status,'pending') <> 'completed' and (select count(*) from public.ai_evaluation_requests e where e.answer_id=a.id) >= 6))
      order by q.question_number)
    from public.interview_questions q
    left join public.interview_answers a on a.question_id=q.id and a.user_id=v_user
    left join public.answer_feedback f on f.answer_id=a.id
      and f.source_audio_generation=a.audio_generation
      and f.evaluation_version=v_session.evaluation_version and f.evaluation_model=v_session.evaluation_model
    where q.session_id=v_session.id
  ),'[]'::jsonb),'finalization',(
    select to_jsonb(f) from public.interview_session_feedback f
    where f.session_id=v_session.id and f.user_id=v_user
      and f.evaluation_version=v_session.evaluation_version limit 1
  ));
end;
$$;
revoke all on function public.get_interview_recovery(uuid) from public,anon;
grant execute on function public.get_interview_recovery(uuid) to authenticated;

-- Claim definitions below retain existing leases, source hashes and completed
-- response caching. Only admission and per-question safety accounting change.

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

  perform public.require_interview_reservation(v_answer.session_id, p_user_id);

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

  if (select count(*) from public.transcription_requests where answer_id = p_answer_id) >= 6 then
    raise exception 'INTERVIEW_ANSWER_RETRY_EXHAUSTED' using errcode = 'P0001';
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

  select answer.*
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

  select session.*
  into v_session
  from public.interview_sessions as session
  where session.id = v_answer.session_id
    and session.user_id = p_user_id;

  if v_answer.id is null then
    raise exception 'ANSWER_EVALUATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.require_interview_reservation(v_answer.session_id, p_user_id);

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

  if (select count(*) from public.ai_evaluation_requests where answer_id = p_answer_id) >= 6 then
    raise exception 'INTERVIEW_ANSWER_RETRY_EXHAUSTED' using errcode = 'P0001';
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
  v_fingerprint text;
begin
  perform public.require_interview_reservation(p_session_id, p_user_id);

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


  if (select count(*) from public.ai_evaluation_requests where session_id = p_session_id and evaluation_kind = 'session') >= 3 then
    raise exception 'INTERVIEW_FINALIZATION_ATTEMPT_LIMIT' using errcode = 'P0001';
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

notify pgrst, 'reload schema';
commit;

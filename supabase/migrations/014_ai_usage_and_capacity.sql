begin;

-- Operational controls, never subscription entitlements. Administrative access only.
create table public.ai_capacity_settings (
  singleton boolean primary key default true check(singleton),
  max_active integer not null default 4 check(max_active between 1 and 100),
  requests_per_minute integer not null default 20 check(requests_per_minute between 1 and 10000),
  measurement_started_at timestamptz not null default now(),
  cooldown_until timestamptz
);
insert into public.ai_capacity_settings(singleton) values(true);
create table public.ai_usage_attempts (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  operation_id uuid not null,
  attempt_number integer not null check(attempt_number > 0),
  user_id uuid not null references public.profiles(id) on delete cascade,
  interview_id uuid references public.interview_sessions(id) on delete set null,
  operation_type text not null,
  resource_id uuid,
  is_retry boolean not null default false,
  model text,
  status text not null default 'processing' check(status in ('processing','completed','failed')),
  provider_status text not null default 'not_sent' check(provider_status in ('not_sent','sent','succeeded','rejected','unknown')),
  input_tokens integer check(input_tokens >= 0),
  output_tokens integer check(output_tokens >= 0),
  input_token_upper_bound integer check(input_token_upper_bound >= 0),
  output_token_limit integer check(output_token_limit between 1 and 3200),
  audio_seconds numeric check(audio_seconds between 0 and 120),
  provider_request_id text check(length(provider_request_id) <= 255),
  http_status integer,
  error_code text check(length(error_code) <= 160),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(source,operation_id,attempt_number)
);
create index ai_usage_active on public.ai_usage_attempts(started_at,user_id);
create index ai_usage_interview on public.ai_usage_attempts(interview_id);
alter table public.ai_capacity_settings enable row level security;
alter table public.ai_usage_attempts enable row level security;
revoke all on public.ai_capacity_settings,public.ai_usage_attempts from public,anon,authenticated;
grant all on public.ai_capacity_settings,public.ai_usage_attempts to service_role;

-- A durable claim was missing for resume/job comparisons. Existing ownership and
-- cache checks remain in claim_resume_job_match; this ledger holds the lease.
create table public.resume_match_requests (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  job_description_id uuid not null references public.job_descriptions(id) on delete cascade,
  model text not null,
  status text not null default 'processing' check(status in ('processing','completed','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.resume_match_requests enable row level security;
revoke all on public.resume_match_requests from public,anon,authenticated;
grant all on public.resume_match_requests to service_role;

-- Trigger runs in the SAME transaction as each existing claim. Capacity rejection
-- rolls back domain attempt counters; it cannot spend a reserved interview retry.
create function public.mirror_ai_request() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  j jsonb := to_jsonb(new); old_j jsonb;
  u uuid := (j->>'user_id')::uuid;
  op uuid := (j->>'id')::uuid;
  sid uuid;
  kind text := TG_TABLE_NAME;
  resource uuid;
  retried boolean := false;
  attempt integer;
  settings public.ai_capacity_settings;
begin
  if TG_OP = 'UPDATE' then old_j := to_jsonb(old); end if;
  if TG_OP = 'INSERT' or (j->>'status'='processing' and
    ((old_j->>'status') is distinct from 'processing' or
     (j->>'attempt_count') is distinct from (old_j->>'attempt_count'))) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vocara-ai-capacity',0));
    select * into settings from public.ai_capacity_settings where singleton;
    if settings.cooldown_until > now() then raise exception 'AI_CAPACITY_COOLDOWN' using detail=ceil(extract(epoch from settings.cooldown_until-now()))::text; end if;
    if exists(select 1 from public.ai_usage_attempts where user_id=u
      and started_at > now()-interval '8 minutes'
      and (status='processing' or provider_status in ('sent','unknown'))) then
      raise exception 'AI_USER_OPERATION_ACTIVE';
    end if;
    if (select count(*) from public.ai_usage_attempts where started_at > now()-interval '8 minutes'
      and (status='processing' or provider_status in ('sent','unknown'))) >= settings.max_active
      or (select count(*) from public.ai_usage_attempts where started_at > now()-interval '1 minute') >= settings.requests_per_minute then
      raise exception 'AI_CAPACITY_BUSY';
    end if;
    select coalesce(max(attempt_number),0)+1 into attempt from public.ai_usage_attempts
      where source=TG_TABLE_NAME and operation_id=op;
    if TG_TABLE_NAME='transcription_requests' or (TG_TABLE_NAME='ai_evaluation_requests' and j->>'answer_id' is not null) then
      select session_id into sid from public.interview_answers where id=(j->>'answer_id')::uuid;
    elsif TG_TABLE_NAME in ('ai_evaluation_requests','job_generation_requests') then
      sid := (j->>'session_id')::uuid;
    end if;
    if attempt > 1 then
      update public.ai_usage_attempts set status='failed',finished_at=now(),
        error_code=coalesce(error_code,'LEASE_REPLACED'),
        provider_status=case when provider_status='sent' then 'unknown' else provider_status end
        where source=TG_TABLE_NAME and operation_id=op and status='processing';
    end if;
    resource := coalesce((j->>'answer_id')::uuid,(j->>'attempt_id')::uuid,
      (j->>'resume_id')::uuid,(j->>'job_description_id')::uuid,(j->>'session_id')::uuid,op);
    if TG_TABLE_NAME='transcription_requests' then
      select transcription_attempt_count > 1 into retried from public.interview_answers where id=resource;
    elsif TG_TABLE_NAME='speaking_transcription_requests' then
      select transcription_attempt_count > 1 into retried from public.speaking_attempts where id=resource;
    elsif TG_TABLE_NAME='ai_evaluation_requests' then
      if j->>'evaluation_kind'='answer' then
        select evaluation_attempt_count > 1 into retried from public.answer_feedback where evaluation_attempt_id=op;
      else
        select evaluation_attempt_count > 1 into retried from public.interview_session_feedback where evaluation_attempt_id=op;
      end if;
    elsif TG_TABLE_NAME='speaking_evaluation_requests' then
      select evaluation_attempt_count > 1 into retried from public.speaking_feedback where evaluation_attempt_id=op;
    elsif TG_TABLE_NAME='job_generation_requests' then
      if j->>'generation_kind'='analysis' then
        select analysis_attempt_count > 1 into retried from public.job_descriptions where id=resource;
      else retried := (j->>'attempt_count')::integer > 1; end if;
    elsif TG_TABLE_NAME='resume_generation_requests' then
      select status='failed' into retried from public.resume_generation_requests
        where resume_id=resource and id<>op and model=j->>'model' order by created_at desc,id limit 1;
    elsif TG_TABLE_NAME='resume_match_requests' then
      select status='failed' into retried from public.resume_match_requests
        where resume_id=resource and job_description_id=(j->>'job_description_id')::uuid and id<>op
        order by created_at desc,id limit 1;
    end if;
    kind := case TG_TABLE_NAME
      when 'transcription_requests' then 'interview_transcription'
      when 'ai_evaluation_requests' then 'interview_' || (j->>'evaluation_kind')
      when 'job_generation_requests' then 'job_' || (j->>'generation_kind')
      when 'resume_generation_requests' then 'resume_analysis'
      when 'resume_match_requests' then 'resume_job_match'
      when 'speaking_transcription_requests' then 'speaking_transcription'
      else 'speaking_evaluation' end;
    insert into public.ai_usage_attempts(source,operation_id,attempt_number,user_id,interview_id,operation_type,resource_id,is_retry,model,audio_seconds)
      values(TG_TABLE_NAME,op,attempt,u,sid,kind,resource,coalesce(retried,false),j->>'model',(j->>'duration_seconds')::numeric);
  else
    update public.ai_usage_attempts set status=j->>'status',
      error_code=coalesce(error_code,left(j->>'error_code',160)),
      finished_at=case when j->>'status' <> 'processing' then now() else null end,
      interview_id=coalesce(interview_id,case when TG_TABLE_NAME='job_generation_requests' then (j->>'session_id')::uuid end)
    where source=TG_TABLE_NAME and operation_id=op and attempt_number=(
      select max(attempt_number) from public.ai_usage_attempts where source=TG_TABLE_NAME and operation_id=op);
  end if;
  return new;
end;
$$;

do $$ declare t text; begin
  foreach t in array array['transcription_requests','ai_evaluation_requests','job_generation_requests',
    'resume_generation_requests','resume_match_requests','speaking_transcription_requests','speaking_evaluation_requests'] loop
    execute format('create trigger mirror_ai_request after insert or update on public.%I for each row execute function public.mirror_ai_request()',t);
  end loop;
end $$;

create function public.claim_tracked_resume_job_match(p_resume_id uuid,p_job_description_id uuid,p_user_id uuid,p_analysis_version text,p_model text,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cached jsonb;
begin
  -- Existing RPC takes the per-user transaction lock and checks both resources.
  cached := public.claim_resume_job_match(p_resume_id,p_job_description_id,p_user_id,p_analysis_version,p_model);
  if cached is not null then return cached; end if;
  if exists(select 1 from public.resume_match_requests where user_id=p_user_id and status='processing'
    and created_at > now()-interval '8 minutes') then raise exception 'AI_USER_OPERATION_ACTIVE'; end if;
  if (select count(*) from public.resume_match_requests where user_id=p_user_id and created_at > now()-interval '24 hours') >= 40 then
    raise exception 'RESUME_JOB_DAILY_LIMIT';
  end if;
  if (select count(*) from public.resume_match_requests where user_id=p_user_id and resume_id=p_resume_id
    and job_description_id=p_job_description_id and created_at > now()-interval '24 hours') >= 3 then
    raise exception 'RESUME_JOB_ATTEMPT_LIMIT';
  end if;
  insert into public.resume_match_requests(id,user_id,resume_id,job_description_id,model)
    values(p_attempt_id,p_user_id,p_resume_id,p_job_description_id,p_model);
  return null;
end;
$$;

-- Public list prices verified against official Groq documentation on 2026-10-28.
-- These are estimates, never invoices. Copy rates onto attempts before dispatch.
create table public.ai_model_rates (
  model text primary key, input_per_million numeric, output_per_million numeric,
  audio_per_hour numeric, verified_on date not null, source_url text not null
);
insert into public.ai_model_rates values
 ('openai/gpt-oss-120b',0.15,0.60,null,'2026-10-28','https://console.groq.com/docs/models'),
 ('openai/gpt-oss-20b',0.075,0.30,null,'2026-10-28','https://console.groq.com/docs/models'),
 ('whisper-large-v3-turbo',null,null,0.04,'2026-10-28','https://console.groq.com/docs/speech-to-text'),
 ('whisper-large-v3',null,null,0.111,'2026-10-28','https://console.groq.com/docs/speech-to-text');
alter table public.ai_model_rates enable row level security;
revoke all on public.ai_model_rates from public,anon,authenticated;
grant all on public.ai_model_rates to service_role;
alter table public.ai_usage_attempts add column input_rate numeric,
  add column output_rate numeric, add column audio_rate numeric, add column rate_verified_on date;

-- Called immediately before fetch, and after body consumption, including malformed
-- responses. Null usage stays unknown; it must never be reported as zero cost.
create function public.record_ai_provider(p_source text,p_operation_id uuid,p_user_id uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.ai_usage_attempts; state text := p_data->>'provider_status'; wait_seconds integer;
begin
  select * into r from public.ai_usage_attempts where source=p_source and operation_id=p_operation_id and user_id=p_user_id
    and (state='sent' or id=(p_data->>'usage_id')::uuid)
    order by attempt_number desc limit 1 for update;
  if r.id is null then raise exception 'AI_USAGE_CLAIM_REQUIRED'; end if;
  if state='sent' then
    if r.provider_status <> 'not_sent' or r.status <> 'processing' or r.started_at < now()-interval '8 minutes' then
      raise exception 'AI_PROVIDER_ALREADY_SENT';
    end if;
    if (p_data->>'input_token_upper_bound')::integer > 120000 or (p_data->>'output_token_limit')::integer > 3200
      or (p_data->>'audio_seconds')::numeric > 120 then raise exception 'AI_TOKEN_BUDGET_EXCEEDED'; end if;
    update public.ai_usage_attempts a set input_rate=p.input_per_million,
      output_rate=p.output_per_million,audio_rate=p.audio_per_hour,rate_verified_on=p.verified_on
      from public.ai_model_rates p where a.id=r.id and p.model=p_data->>'model';
  elsif r.provider_status not in ('sent','unknown') then
    if r.provider_status=state then return r.id; end if;
    raise exception 'AI_PROVIDER_STATE_CONFLICT';
  end if;
  update public.ai_usage_attempts set provider_status=state,
    model=coalesce(p_data->>'model',model),
    input_tokens=coalesce((p_data->>'input_tokens')::integer,input_tokens),
    output_tokens=coalesce((p_data->>'output_tokens')::integer,output_tokens),
    input_token_upper_bound=coalesce((p_data->>'input_token_upper_bound')::integer,input_token_upper_bound),
    output_token_limit=coalesce((p_data->>'output_token_limit')::integer,output_token_limit),
    audio_seconds=coalesce((p_data->>'audio_seconds')::numeric,audio_seconds),
    provider_request_id=left(p_data->>'provider_request_id',255),
    http_status=(p_data->>'http_status')::integer,error_code=left(p_data->>'error_code',160)
    where id=r.id;
  wait_seconds := (p_data->>'retry_after_seconds')::integer;
  if wait_seconds > 0 then
    update public.ai_capacity_settings set cooldown_until=greatest(coalesce(cooldown_until,now()),now()+make_interval(secs=>wait_seconds)) where singleton;
  end if;
  return r.id;
end;
$$;

revoke all on function public.mirror_ai_request() from public,anon,authenticated;
revoke all on function public.claim_tracked_resume_job_match(uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.record_ai_provider(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_tracked_resume_job_match(uuid,uuid,uuid,text,text,uuid) to service_role;
grant execute on function public.record_ai_provider(text,uuid,uuid,jsonb) to service_role;
create function public.finish_resume_match_request(p_attempt_id uuid,p_user_id uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('completed','failed') then raise exception 'AI_INVALID_STATUS'; end if;
  update public.resume_match_requests set status=p_status,completed_at=now()
    where id=p_attempt_id and user_id=p_user_id and status='processing';
end;
$$;
revoke all on function public.finish_resume_match_request(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_resume_match_request(uuid,uuid,text) to service_role;
-- Invoker-security views plus explicit ACLs: no administrative consumption data
-- is exposed through the mobile client's public/anonymous credentials.
create view public.ai_usage_costs with (security_invoker=true) as
select a.*, case when provider_status <> 'succeeded' then null
  when audio_seconds is not null then greatest(audio_seconds,10)*audio_rate/3600
  when input_tokens is not null and output_tokens is not null then
    (input_tokens*input_rate+output_tokens*output_rate)/1000000
  else null end as estimated_cost_usd
from public.ai_usage_attempts a;
revoke all on public.ai_usage_costs from public,anon,authenticated;
grant select on public.ai_usage_costs to service_role;
create view public.ai_usage_daily with (security_invoker=true) as
select (started_at at time zone 'UTC')::date as usage_day,
  count(*) as claimed_operations,
  count(*) filter(where provider_status <> 'not_sent') as provider_requests,
  count(*) filter(where status='failed') as failed_operations,
  count(*) filter(where is_retry and provider_status <> 'not_sent') as retried_requests,
  count(*) filter(where provider_status='unknown') as uncertain_requests,
  sum(input_tokens) as reported_input_tokens,sum(output_tokens) as reported_output_tokens,
  sum(audio_seconds) filter(where provider_status <> 'not_sent')/60 as attempted_audio_minutes,
  sum(estimated_cost_usd) as known_estimated_cost_usd,
  count(*) filter(where provider_status <> 'not_sent' and estimated_cost_usd is null) as requests_with_unknown_cost
from public.ai_usage_costs group by 1;
revoke all on public.ai_usage_daily from public,anon,authenticated;
grant select on public.ai_usage_daily to service_role;
notify pgrst,'reload schema';
commit;

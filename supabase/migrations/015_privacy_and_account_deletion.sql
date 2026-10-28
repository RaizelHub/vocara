begin;

-- No FK: the minimal job must survive Auth deletion until completion is recorded.
create table public.account_deletion_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid unique,
 status text not null default 'pending' check(status in ('pending','processing','failed','completed')),
 requested_at timestamptz not null default now(), available_at timestamptz not null default now()+interval '10 minutes',
 lease_token uuid, lease_until timestamptz, attempts integer not null default 0,
 processor_erasure_confirmed boolean not null default false, last_error_code text, completed_at timestamptz
);
alter table public.account_deletion_jobs enable row level security;
revoke all on public.account_deletion_jobs from public,anon,authenticated;
grant all on public.account_deletion_jobs to service_role;

create function public.account_is_active(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p_user_id)
 and not exists(select 1 from public.account_deletion_jobs where user_id=p_user_id)
$$;
revoke all on function public.account_is_active(uuid) from public,anon,authenticated;
grant execute on function public.account_is_active(uuid) to authenticated,service_role;

create function public.require_active_account() returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.account_is_active(auth.uid()) then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
end $$;
revoke all on function public.require_active_account() from public,anon;
grant execute on function public.require_active_account() to authenticated,service_role;

-- Restrictive policies supplement ownership policies; they cannot widen access.
do $$ declare r record; begin
 for r in select tablename from pg_tables where schemaname='public' and tablename <> 'account_deletion_jobs' loop
  execute format('create policy account_active_only on public.%I as restrictive for all to authenticated using (public.account_is_active((select auth.uid()))) with check (public.account_is_active((select auth.uid())))',r.tablename);
 end loop;
end $$;
create policy account_active_only on storage.objects as restrictive for all to authenticated
 using (public.account_is_active((select auth.uid()))) with check(public.account_is_active((select auth.uid())));

-- Existing SECURITY DEFINER user RPCs bypass RLS. Preserve their bodies/signatures,
-- but put the same gate before any statement. Fail migration on an unknown language.
do $$ declare r record; definition text; begin
 for r in select p.oid,p.proname,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 join pg_language l on l.oid=p.prolang where n.nspname='public' and p.prosecdef
 and p.prorettype <> 'trigger'::regtype and has_function_privilege('authenticated',p.oid,'execute')
 and p.proname not in ('account_is_active','require_active_account') loop
  if r.lanname <> 'plpgsql' then raise exception 'Review user RPC % before migration',r.proname; end if;
  definition:=pg_get_functiondef(r.oid);
  definition:=regexp_replace(definition,'\mbegin\M','begin PERFORM public.require_active_account();','i');
  execute definition;
  execute format('revoke execute on function %s from public,anon',r.oid::regprocedure);
 end loop;
end $$;

-- Serialize pending-deletion admission with new writes, including privileged AI
-- completion and Storage uploads already in flight. Deletes remain available to worker.
create function public.block_pending_account_writes() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; row_data jsonb:=to_jsonb(new);
begin
 if tg_table_schema='storage' then
  if new.bucket_id not in ('interview-audio','speaking-audio','resumes') then return new; end if;
  begin owner_id:=split_part(new.name,'/',1)::uuid; exception when invalid_text_representation then raise exception 'INVALID_STORAGE_PATH'; end;
 elsif tg_table_name='profiles' then owner_id:=new.id;
 elsif row_data ? 'user_id' then owner_id:=(row_data->>'user_id')::uuid;
 elsif tg_table_name='interview_questions' then select user_id into owner_id from public.interview_sessions where id=new.session_id;
 elsif tg_table_name='answer_feedback' then select user_id into owner_id from public.interview_answers where id=new.answer_id;
 end if;
 if owner_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('privacy:'||owner_id::text,0));
  if exists(select 1 from public.account_deletion_jobs where user_id=owner_id) then
   raise exception 'ACCOUNT_DELETION_PENDING' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.block_pending_account_writes() from public,anon,authenticated;
do $$ declare r record; begin
 for r in select distinct table_name from information_schema.columns where table_schema='public'
 and (column_name='user_id' or table_name in ('profiles','interview_questions','answer_feedback'))
 and table_name <> 'account_deletion_jobs' and table_name in(select tablename from pg_tables where schemaname='public') loop
 execute format('create trigger privacy_write_guard before insert or update on public.%I for each row execute function public.block_pending_account_writes()',r.table_name);
 end loop;
end $$;
create trigger privacy_write_guard before insert or update on storage.objects for each row execute function public.block_pending_account_writes();

create function public.request_account_deletion(p_user_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare job_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('privacy:'||p_user_id::text,0));
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'ACCOUNT_UNAVAILABLE'; end if;
 insert into public.account_deletion_jobs(user_id) values(p_user_id) on conflict(user_id) do nothing;
 select id into job_id from public.account_deletion_jobs where user_id=p_user_id;
 return job_id;
end $$;
revoke all on function public.request_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.request_account_deletion(uuid) to service_role;

create function public.get_account_deletion_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('status',status,'requestedAt',requested_at) from public.account_deletion_jobs where user_id=auth.uid()),'null'::jsonb)
$$;
revoke all on function public.get_account_deletion_status() from public,anon;
grant execute on function public.get_account_deletion_status() to authenticated;

create function public.claim_account_deletion() returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.account_deletion_jobs;
begin
 select * into r from public.account_deletion_jobs where user_id is not null and status<>'completed'
 and available_at<=now() and (lease_until is null or lease_until<now()) order by requested_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.account_deletion_jobs set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1 where id=r.id returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.claim_account_deletion() from public,anon,authenticated;
grant execute on function public.claim_account_deletion() to service_role;

create function public.finish_account_deletion(p_job uuid,p_lease uuid,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_error is null then
  if exists(select 1 from public.account_deletion_jobs j join auth.users u on u.id=j.user_id where j.id=p_job) then raise exception 'AUTH_DELETION_REQUIRED'; end if;
  update public.account_deletion_jobs set status='completed',user_id=null,completed_at=now(),lease_token=null,lease_until=null,last_error_code=null where id=p_job and lease_token=p_lease;
 else
  update public.account_deletion_jobs set status='failed',last_error_code='CLEANUP_RETRY_REQUIRED',available_at=now()+interval '15 minutes',lease_token=null,lease_until=null where id=p_job and lease_token=p_lease;
 end if;
end $$;
revoke all on function public.finish_account_deletion(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_account_deletion(uuid,uuid,text) to service_role;

-- Server-controlled interview state and question content must not be client editable.
revoke update on public.interview_sessions,public.interview_questions from authenticated;
revoke update(role,interview_type,difficulty,interviewer_style,status,total_questions,started_at,completed_at,duration_seconds) on public.interview_sessions from authenticated;
revoke update(question_number,question_text,question_type) on public.interview_questions from authenticated;
create function public.deletion_storage_batch(p_job uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 select user_id into owner_id from public.account_deletion_jobs where id=p_job and lease_token=p_lease and lease_until>now() and status='processing';
 if owner_id is null then raise exception 'DELETION_LEASE_REQUIRED'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name)) from
 (select bucket_id,name from storage.objects where bucket_id in ('interview-audio','speaking-audio','resumes')
 and (split_part(name,'/',1)=owner_id::text or storage.objects.owner_id=owner_id::text) order by bucket_id,name limit 100) o),'[]'::jsonb);
end $$;
revoke all on function public.deletion_storage_batch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.deletion_storage_batch(uuid,uuid) to service_role;
-- Operator confirms external erasure/review using the job ID, never a client identity.
create function public.confirm_account_processor_erasure(p_job uuid) returns void
language sql security definer set search_path='' as $$
 update public.account_deletion_jobs set processor_erasure_confirmed=true,available_at=greatest(requested_at+interval '10 minutes',now()) where id=p_job and status<>'completed'
$$;
revoke all on function public.confirm_account_processor_erasure(uuid) from public,anon,authenticated;
grant execute on function public.confirm_account_processor_erasure(uuid) to service_role;
commit;

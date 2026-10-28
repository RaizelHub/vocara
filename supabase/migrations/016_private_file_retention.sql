begin;
create table public.private_file_retention_settings (
 singleton boolean primary key default true check(singleton),
 orphan_cleanup_enabled boolean not null default false,
 orphan_grace_hours integer not null default 168 check(orphan_grace_hours between 24 and 8760)
);
insert into public.private_file_retention_settings(singleton) values(true);
create table public.private_file_cleanup_claims (
 bucket_id text not null,name text not null,user_id uuid not null references public.profiles(id) on delete cascade,
 claimed_at timestamptz not null default now(),primary key(bucket_id,name)
);
alter table public.private_file_retention_settings enable row level security;
alter table public.private_file_cleanup_claims enable row level security;
revoke all on public.private_file_retention_settings,public.private_file_cleanup_claims from public,anon,authenticated;
grant all on public.private_file_retention_settings,public.private_file_cleanup_claims to service_role;

create function public.private_file_is_referenced(p_bucket text,p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select case p_bucket when 'interview-audio' then exists(select 1 from public.interview_answers where audio_path=p_name)
 when 'speaking-audio' then exists(select 1 from public.speaking_attempts where audio_path=p_name)
 when 'resumes' then exists(select 1 from public.resumes where storage_path=p_name)
 else true end
$$;
revoke all on function public.private_file_is_referenced(text,text) from public,anon,authenticated;
grant execute on function public.private_file_is_referenced(text,text) to service_role;

create function public.protect_private_file_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_owner_id uuid; bucket text; path text; object_count integer;
begin
 if tg_table_schema='storage' then
  if new.bucket_id not in ('interview-audio','speaking-audio','resumes') then return new; end if;
  bucket:=new.bucket_id;path:=new.name;v_owner_id:=split_part(path,'/',1)::uuid;
 elsif tg_table_name='resumes' then bucket:='resumes';path:=new.storage_path;v_owner_id:=new.user_id;
 elsif tg_table_name='interview_answers' then bucket:='interview-audio';path:=new.audio_path;v_owner_id:=new.user_id;
 else bucket:='speaking-audio';path:=new.audio_path;v_owner_id:=new.user_id;
 end if;
 if path is null then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('privacy:'||v_owner_id::text,0));
 if exists(select 1 from public.private_file_cleanup_claims c where c.bucket_id=bucket and c.name=path) then
  raise exception 'PRIVATE_FILE_CLEANUP_PENDING' using errcode='23514';
 end if;
 if tg_table_schema='storage' and tg_op='INSERT' then
  if bucket='resumes' then
   select count(*) into object_count from storage.objects o where o.bucket_id=bucket and split_part(o.name,'/',1)=v_owner_id::text;
   if object_count>=20 then raise exception 'PRIVATE_FILE_LIMIT_REACHED' using errcode='23514'; end if;
  elsif bucket='interview-audio' then
   -- Bound abandoned re-recordings per answer, not completed history per user.
   select count(*) into object_count from storage.objects o where o.bucket_id=bucket
    and storage.foldername(o.name)=storage.foldername(path);
   if object_count>=10 then raise exception 'PRIVATE_FILE_LIMIT_REACHED' using errcode='23514'; end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.protect_private_file_lifecycle() from public,anon,authenticated;
create trigger private_file_lifecycle before insert or update on storage.objects for each row execute function public.protect_private_file_lifecycle();
create trigger private_file_lifecycle before insert or update of audio_path on public.interview_answers for each row execute function public.protect_private_file_lifecycle();
create trigger private_file_lifecycle before insert or update of audio_path on public.speaking_attempts for each row execute function public.protect_private_file_lifecycle();
create trigger private_file_lifecycle before insert or update of storage_path on public.resumes for each row execute function public.protect_private_file_lifecycle();

-- Dry-run by default. No referenced object is eligible, regardless of age/status.
create function public.claim_orphan_private_files(p_execute boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r record; config public.private_file_retention_settings; v_owner_id uuid; result jsonb:='[]';
begin
 select * into config from public.private_file_retention_settings where singleton;
 if p_execute and not config.orphan_cleanup_enabled then return '[]'::jsonb; end if;
 for r in select o.bucket_id,o.name from storage.objects o where o.bucket_id in ('interview-audio','speaking-audio','resumes')
 and o.created_at<now()-make_interval(hours=>config.orphan_grace_hours)
 and split_part(o.name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and not public.private_file_is_referenced(o.bucket_id,o.name) order by o.bucket_id,o.name limit 50 loop
  v_owner_id:=split_part(r.name,'/',1)::uuid;
  perform pg_advisory_xact_lock(hashtextextended('privacy:'||v_owner_id::text,0));
  if not public.account_is_active(v_owner_id) or public.private_file_is_referenced(r.bucket_id,r.name) then continue; end if;
  if p_execute then
   insert into public.private_file_cleanup_claims(bucket_id,name,user_id) values(r.bucket_id,r.name,v_owner_id) on conflict do nothing;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('bucket',r.bucket_id,'name',r.name));
 end loop;
 -- Include interrupted claims whose Storage deletion already succeeded, so the
 -- worker can reconcile and clear the metadata even after a lost response.
 if p_execute then
  select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name)),'[]'::jsonb) into result from
   (select bucket_id,name from public.private_file_cleanup_claims order by claimed_at limit 50) claims;
 end if;
 return result;
end $$;
create function public.finish_orphan_private_file(p_bucket text,p_name text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from storage.objects where bucket_id=p_bucket and name=p_name) then raise exception 'STORAGE_DELETE_REQUIRED'; end if;
 delete from public.private_file_cleanup_claims where bucket_id=p_bucket and name=p_name;
end $$;
revoke all on function public.claim_orphan_private_files(boolean) from public,anon,authenticated;
revoke all on function public.finish_orphan_private_file(text,text) from public,anon,authenticated;
grant execute on function public.claim_orphan_private_files(boolean) to service_role;
grant execute on function public.finish_orphan_private_file(text,text) to service_role;
commit;

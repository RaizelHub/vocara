-- Browser conversion produces canonical mono PCM WAV. Preserve all existing
-- ownership, active-account, reservation, immutable-object and quota checks.
alter table public.interview_answers drop constraint interview_answers_audio_mime_check;
alter table public.interview_answers add constraint interview_answers_audio_mime_check
 check(audio_mime_type is null or audio_mime_type in ('audio/mp4','audio/m4a','audio/x-m4a','audio/wav'));
alter table public.speaking_attempts drop constraint speaking_attempts_audio_mime_check;
alter table public.speaking_attempts add constraint speaking_attempts_audio_mime_check
 check(audio_mime_type is null or audio_mime_type in ('audio/mp4','audio/m4a','audio/x-m4a','audio/wav'));
update storage.buckets set allowed_mime_types=array['audio/mp4','audio/m4a','audio/x-m4a','audio/wav']
 where id in ('interview-audio','speaking-audio');

-- Change only the media allowlist in the existing, privacy-guarded RPC definitions.
do $$ declare n text; original text; updated text;
begin
 foreach n in array array['attach_answer_audio','attach_speaking_audio'] loop
  select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='public' and p.proname=n;
  if position('require_active_account' in original)=0 then raise exception 'Missing active-account guard'; end if;
  updated:=replace(original,'''audio/mp4'', ''audio/m4a'', ''audio/x-m4a''','''audio/mp4'', ''audio/m4a'', ''audio/x-m4a'', ''audio/wav''');
  updated:=replace(updated,'storage.extension(p_audio_path) <> ''m4a''','storage.extension(p_audio_path) not in (''m4a'',''wav'')');
  updated:=replace(updated,'\.m4a$','\.(m4a|wav)$');
  updated:=replace(updated,'v_folders := storage.foldername(p_audio_path);',
   'if (storage.extension(p_audio_path) = ''wav'') <> (p_audio_mime_type = ''audio/wav'') then raise exception ''Audio extension and MIME disagree'' using errcode=''22023''; end if; v_folders := storage.foldername(p_audio_path);');
  if updated=original then raise exception 'Missing media validation definition'; end if;
  execute updated;
 end loop;
end $$;

drop policy interview_audio_insert_own on storage.objects;
create policy interview_audio_insert_own on storage.objects for insert to authenticated with check (
 bucket_id='interview-audio' and owner_id=auth.uid()::text and (storage.foldername(name))[1]=auth.uid()::text
 and cardinality(storage.foldername(name))=3 and storage.extension(name) in ('m4a','wav')
 and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(m4a|wav)$'
 and exists(select 1 from public.interview_answers a where a.id::text=(storage.foldername(name))[3]
 and a.session_id::text=(storage.foldername(name))[2] and a.user_id=auth.uid())
);
create or replace function public.speaking_storage_allowed(p_name text,p_upload boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select public.account_is_active(auth.uid()) and split_part(p_name,'/',1)=auth.uid()::text and
 case when p_upload then exists(select 1 from public.speaking_attempts a where a.user_id=auth.uid()
 and a.session_id::text=split_part(p_name,'/',2)
 and split_part(p_name,'/',3) in (a.id::text||'.m4a',a.id::text||'.wav')
 and cardinality(string_to_array(p_name,'/'))=3)
 else not exists(select 1 from public.speaking_attempts a where a.user_id=auth.uid() and a.audio_path=p_name) end
$$;

-- Retry a lost speaking reservation response with the same client-generated ID.
do $$ declare definition text;
begin
 select pg_get_functiondef('public.reserve_speaking_attempt(uuid,uuid,uuid)'::regprocedure) into definition;
 if position('require_active_account' in definition)=0 then raise exception 'Missing active-account guard'; end if;
 definition:=replace(definition,'select coalesce(max(attempt_number), 0) + 1',
 'select * into v_attempt from public.speaking_attempts where id=p_attempt_id;
 if found then
  if v_attempt.user_id<>v_user_id or v_attempt.session_id<>p_session_id then raise exception ''Attempt identity conflict'' using errcode=''42501''; end if;
  return v_attempt;
 end if;
 select coalesce(max(attempt_number), 0) + 1');
 execute definition;
end $$;

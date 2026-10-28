begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(9);
insert into auth.users(id,email) values('a0000000-0000-4000-8000-000000000001','retention@example.invalid');
insert into storage.objects(bucket_id,name,owner_id,created_at) values
 ('resumes','a0000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/kept.pdf','a0000000-0000-4000-8000-000000000001',now()-interval '30 days'),
 ('resumes','a0000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000002/orphan.pdf','a0000000-0000-4000-8000-000000000001',now()-interval '30 days'),
 ('resumes','a0000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000003/recent.pdf','a0000000-0000-4000-8000-000000000001',now());
insert into public.resumes(id,user_id,file_name,storage_path,mime_type,file_size_bytes) values
 ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','kept.pdf','a0000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/kept.pdf','application/pdf',100);
select is(jsonb_array_length(public.claim_orphan_private_files(false)),1,'dry-run selects only old unreferenced objects');
select is((select count(*)::int from public.private_file_cleanup_claims),0,'dry-run creates no deletion claims');
select is(public.claim_orphan_private_files(true),'[]'::jsonb,'automatic cleanup disabled by default');
update public.private_file_retention_settings set orphan_cleanup_enabled=true;
select is(jsonb_array_length(public.claim_orphan_private_files(true)),1,'enabled cleanup atomically claims orphan');
select throws_ok($$insert into public.resumes(id,user_id,file_name,storage_path,mime_type,file_size_bytes) values('a1000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','orphan.pdf','a0000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000002/orphan.pdf','application/pdf',100)$$,'23514','PRIVATE_FILE_CLEANUP_PENDING','late attachment cannot race a cleanup claim');
select throws_ok($$select public.finish_orphan_private_file('resumes','a0000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000002/orphan.pdf')$$,'P0001','STORAGE_DELETE_REQUIRED','cleanup cannot report success before Storage deletion');
select is(jsonb_array_length(public.claim_orphan_private_files(true)),1,'interrupted cleanup reclaims same object');
-- Simulate Storage API deletion in the disposable fixture only.
delete from storage.objects where name like '%/orphan.pdf';
select is(jsonb_array_length(public.claim_orphan_private_files(true)),1,'lost removal response remains reconcilable');
select public.finish_orphan_private_file('resumes','a0000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000002/orphan.pdf');
select is((select count(*)::int from storage.objects),2,'referenced history and recent upload preserved');
select * from finish();rollback;

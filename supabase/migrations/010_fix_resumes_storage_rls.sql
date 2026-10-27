  -- Fix resumes storage bucket RLS policies to use 1-based PostgreSQL array indexing.

  begin;

  drop policy if exists "resumes_storage_select_own" on storage.objects;
  create policy "resumes_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

  drop policy if exists "resumes_storage_insert_own" on storage.objects;
  create policy "resumes_storage_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

  drop policy if exists "resumes_storage_update_own" on storage.objects;
  create policy "resumes_storage_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

  drop policy if exists "resumes_storage_delete_own" on storage.objects;
  create policy "resumes_storage_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

  commit;

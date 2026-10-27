-- Run only with `supabase test db --local` against a disposable local stack.
-- All data is synthetic and rolled back; provider results are mocked here.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);

create function pg_temp.questions(n integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'text','Synthetic question ' || x))
  from generate_series(1,n) x;
$$;
create temp table fixture as select gen_random_uuid() as uid, gen_random_uuid() as sid,
  pg_temp.questions(5) as questions;
insert into auth.users(id,email) select uid, uid::text || '@example.invalid' from fixture;
select set_config('request.jwt.claim.sub', (select uid::text from fixture), true);

select lives_ok($$select public.create_reserved_interview(sid,'Developer','standard','intermediate','balanced',questions) from fixture$$,
  'a free user can reserve all five answers');
select is((select usage_count from public.feature_usage where user_id=(select uid from fixture) and feature='ai_feedback'),5,'exact allowance boundary');
select lives_ok($$select public.create_reserved_interview(sid,'Developer','standard','intermediate','balanced',questions) from fixture$$,'lost response retry succeeds');
select is((select count(*)::integer from public.interview_reservations where user_id=(select uid from fixture)),1,'duplicate start has one reservation');
select is((select usage_count from public.feature_usage where user_id=(select uid from fixture) and feature='ai_feedback'),5,'duplicate does not consume allowance');
select throws_ok($$select public.create_reserved_interview(gen_random_uuid(),'Developer','standard','intermediate','balanced',pg_temp.questions(1))$$,
  'P0001','VOCARA_FEATURE_LIMIT_REACHED','insufficient allowance rejected');
select is((select count(*)::integer from public.interview_sessions where user_id=(select uid from fixture)),1,'rejected creation rolled back');
select throws_ok($$select public.create_reserved_interview(sid,'Different role','standard','intermediate','balanced',questions) from fixture$$,
  '22023','INTERVIEW_REQUEST_CONFLICT','same request ID cannot change payload');
select ok(not has_column_privilege('authenticated','public.interview_questions','question_text','INSERT'),'client cannot bypass atomic creation');
select ok(not has_function_privilege('authenticated','public.claim_answer_evaluation(uuid,uuid,uuid,text,text)','EXECUTE'),'client cannot impersonate service claims');
select is(jsonb_array_length(public.get_interview_recovery((select sid from fixture))->'questions'),5,'recovery returns ordered server questions');
select lives_ok($$select public.start_interview_session(sid) from fixture$$,'resume works with zero allowance left');

-- Drive the real claim/completion RPCs with mock results. No HTTP or Groq calls.
create function pg_temp.complete_mock_interview() returns void language plpgsql as $$
declare u uuid; s uuid; q record; a public.interview_answers; t uuid; e uuid; f uuid;
begin
  select uid,sid into u,s from fixture;
  for q in select * from public.interview_questions where session_id=s order by question_number loop
    insert into public.interview_answers(session_id,question_id,user_id,audio_path,duration_seconds,audio_mime_type,audio_size_bytes,audio_generation)
      values(s,q.id,u,u::text || '/' || s::text || '/' || gen_random_uuid()::text || '.m4a',20,'audio/mp4',100,1)
      returning * into a;
    t := gen_random_uuid();
    perform public.claim_answer_transcription(a.id,u,t);
    -- Duplicate concurrent/in-flight submission must be denied before provider work.
    begin
      perform public.claim_answer_transcription(a.id,u,gen_random_uuid());
      raise exception 'Expected duplicate transcription denial';
    exception when raise_exception then
      if sqlerrm <> 'TRANSCRIPTION_ALREADY_PROCESSING' then raise; end if;
    end;
    if q.question_number = 1 then
      perform public.fail_answer_transcription(a.id,u,t,'mock_failure','Synthetic interruption',true);
      t := gen_random_uuid();
      perform public.claim_answer_transcription(a.id,u,t);
    end if;
    perform public.verify_answer_audio(a.id,u,t,repeat(md5(a.id::text),2),20);
    perform public.complete_answer_transcription(a.id,u,t,'I built a useful tool and measured its outcome with the team.',20,13,39,repeat(md5(a.id::text),2),'mock-whisper','mock');
    e := gen_random_uuid();
    perform public.claim_answer_evaluation(a.id,u,e,'test-v1','mock');
    begin
      perform public.claim_answer_evaluation(a.id,u,gen_random_uuid(),'test-v1','mock');
      raise exception 'Expected duplicate evaluation denial';
    exception when raise_exception then
      if sqlerrm <> 'ANSWER_EVALUATION_ALREADY_PROCESSING' then raise; end if;
    end;
    if q.question_number = 1 then
      perform public.fail_answer_evaluation(a.id,u,e,'mock_failure','Synthetic interruption',true);
      e := gen_random_uuid();
      perform public.claim_answer_evaluation(a.id,u,e,'test-v1','mock');
    end if;
    perform public.complete_answer_evaluation(a.id,u,e,'test-v1',a.audio_generation,
      80,80,80,80,80,80,'Mock summary','[{"title":"Clear","detail":"Clear answer"}]',
      '[{"title":"Detail","detail":"Add detail","action":"Explain impact"}]',
      'Explain the outcome','I built a tool and measured the result.','[]','mock','mock',1,1);
    -- A completed claim returns cached feedback, without adding another request.
    perform public.claim_answer_evaluation(a.id,u,gen_random_uuid(),'test-v1','mock');
  end loop;
  f := gen_random_uuid();
  perform public.claim_interview_finalization(s,u,f,'test-v1','mock');
  perform public.complete_interview_finalization(s,u,f,'test-v1','Mock interview summary',
    '[{"title":"Clear","detail":"Clear answers"}]',
    '[{"title":"Impact","detail":"Explain impact","action":"Add outcomes"}]',
    'behavioral','Practice outcomes','mock','mock',1,1);
end;
$$;
select lives_ok('select pg_temp.complete_mock_interview()','all five prepaid answers and finalization complete at zero remaining allowance');
select is((select status from public.interview_sessions where id=(select sid from fixture)),'completed','normal completion persists');
select is((select count(*)::integer from public.ai_evaluation_requests where user_id=(select uid from fixture)),7,'five evaluations, one explicit failed-attempt retry and one summary; no duplicate claims');
select is((select usage_count from public.feature_usage where user_id=(select uid from fixture) and feature='ai_feedback'),5,'completion consumes no additional allowance');

select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
select is(public.get_interview_recovery((select sid from fixture)),null::jsonb,'another user cannot recover private content');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.get_interview_recovery(null)$$,'42501','NOT_AUTHENTICATED','authentication remains required');
select * from finish();
rollback;

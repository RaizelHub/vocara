-- Disposable local stack only; all synthetic state rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(30);
create temp table ai_fixture as select gen_random_uuid() uid,gen_random_uuid() sid,
  gen_random_uuid() qid,gen_random_uuid() aid,gen_random_uuid() op from generate_series(1,2);
insert into auth.users(id,email) select uid,uid::text || '@example.invalid' from ai_fixture;
insert into public.interview_sessions(id,user_id,role,interview_type,difficulty,interviewer_style,total_questions,status)
  select sid,uid,'Synthetic','standard','intermediate','balanced',1,'created' from ai_fixture;
insert into public.interview_questions(id,session_id,question_number,question_text)
  select qid,sid,1,'Synthetic question' from ai_fixture;
do $$ declare f record; begin
  for f in select * from ai_fixture loop
    perform set_config('request.jwt.claim.sub',f.uid::text,true);
    perform public.start_interview_session(f.sid);
  end loop;
end $$;
insert into public.interview_answers(id,session_id,question_id,user_id,audio_path,duration_seconds,audio_generation)
  select aid,sid,qid,uid,uid::text || '/synthetic.m4a',60,1 from ai_fixture;
create temp table first_ai as select * from ai_fixture order by uid limit 1;
create temp table second_ai as select * from ai_fixture where uid not in(select uid from first_ai);
update public.ai_capacity_settings set max_active=1,requests_per_minute=20;

select ok(not has_table_privilege('authenticated','public.ai_usage_attempts','SELECT'),'usage records are administrative');
select ok(not has_table_privilege('anon','public.ai_usage_costs','SELECT'),'anonymous clients cannot inspect costs');
select ok(not has_function_privilege('authenticated','public.record_ai_provider(text,uuid,uuid,jsonb)','EXECUTE'),'client cannot forge provider measurements');
select lives_ok($$select public.claim_answer_transcription(aid,uid,op) from first_ai$$,'reserved interview can claim processing');
select is((select count(*)::integer from public.ai_usage_attempts where user_id in(select uid from ai_fixture)),1,'claim creates one usage row');
select throws_ok($$select public.claim_answer_transcription(aid,uid,op) from second_ai$$,'P0001','AI_CAPACITY_BUSY','another user cannot exceed global capacity');
select is((select transcription_attempt_count from public.interview_answers where id=(select aid from second_ai)),0,'capacity rejection rolls back retry counter');
select is((select usage_count from public.feature_usage where user_id=(select uid from second_ai) and feature='ai_feedback'),1,'reserved allowance remains intact');
select throws_ok($$select public.record_ai_provider('transcription_requests',op,gen_random_uuid(),'{"provider_status":"sent"}') from first_ai$$,
  'P0001','AI_USAGE_CLAIM_REQUIRED','ownership is checked before provider dispatch');
select throws_ok($$select public.record_ai_provider('transcription_requests',op,uid,'{"provider_status":"sent","input_token_upper_bound":120001,"output_token_limit":3200}') from first_ai$$,
  'P0001','AI_TOKEN_BUDGET_EXCEEDED','server rejects excessive token budget');
select lives_ok($$select public.record_ai_provider('transcription_requests',op,uid,'{"provider_status":"sent","model":"whisper-large-v3-turbo","audio_seconds":60}') from first_ai$$,'valid dispatch recorded');
select throws_ok($$select public.record_ai_provider('transcription_requests',op,uid,'{"provider_status":"sent","model":"whisper-large-v3-turbo","audio_seconds":60}') from first_ai$$,
  'P0001','AI_PROVIDER_ALREADY_SENT','duplicate dispatch rejected');
select lives_ok($$select public.record_ai_provider('transcription_requests',op,uid,jsonb_build_object('provider_status','succeeded','http_status',200,'usage_id',(select id from public.ai_usage_attempts where operation_id=first_ai.op))) from first_ai$$,'successful response recorded');
select lives_ok($$select public.record_ai_provider('transcription_requests',op,uid,jsonb_build_object('provider_status','succeeded','http_status',200,'usage_id',(select id from public.ai_usage_attempts where operation_id=first_ai.op))) from first_ai$$,'replayed accounting is idempotent');
select is((select count(*)::integer from public.ai_usage_attempts where user_id=(select uid from first_ai)),1,'accounting replay creates no duplicate rows');
select ok((select abs(estimated_cost_usd-0.04/60)<0.00000001 from public.ai_usage_costs where user_id=(select uid from first_ai)),'audio estimate uses verified hourly rate');
select public.fail_answer_transcription(aid,uid,op,'synthetic_failure','Synthetic test only',true) from first_ai;
select lives_ok($$select public.claim_answer_transcription(aid,uid,op) from second_ai$$,'capacity released after terminal domain status');
select is((select count(*)::integer from public.ai_usage_attempts where user_id in(select uid from ai_fixture)),2,'separate users have separate records');
select lives_ok($$select public.record_ai_provider('transcription_requests',op,uid,'{"provider_status":"sent","model":"whisper-large-v3-turbo","audio_seconds":60}') from second_ai$$,'second user dispatch recorded');
select lives_ok($$select public.record_ai_provider('transcription_requests',op,uid,jsonb_build_object('provider_status','unknown','error_code','GROQ_TIMEOUT','usage_id',(select id from public.ai_usage_attempts where operation_id=second_ai.op))) from second_ai$$,'interrupted dispatch records uncertain outcome');
select public.fail_answer_transcription(aid,uid,op,'GROQ_TIMEOUT','Synthetic test only',true) from second_ai;
select throws_ok($$select public.claim_answer_transcription(aid,uid,gen_random_uuid()) from second_ai$$,
  'P0001','AI_USER_OPERATION_ACTIVE','uncertain provider lease survives domain failure');
select is((select transcription_attempt_count from public.interview_answers where id=(select aid from second_ai)),1,'uncertain retry refusal spends no attempt');
update public.ai_usage_attempts set started_at=now()-interval '9 minutes' where operation_id=(select op from second_ai);
create temp table ai_retry as select second_ai.*,gen_random_uuid() retry_op from second_ai;
select lives_ok($$select public.claim_answer_transcription(aid,uid,retry_op) from ai_retry$$,'explicit retry allowed after lease expiry');
select ok((select is_retry from public.ai_usage_attempts where operation_id=(select retry_op from ai_retry)),'resource retry counted despite a new claim UUID');
select lives_ok($$select public.record_ai_provider('transcription_requests',retry_op,uid,'{"provider_status":"sent","model":"whisper-large-v3-turbo","audio_seconds":60}') from ai_retry$$,'retry dispatch recorded separately');
select lives_ok($$select public.record_ai_provider('transcription_requests',retry_op,uid,jsonb_build_object('provider_status','rejected','http_status',429,'retry_after_seconds',90,'usage_id',(select id from public.ai_usage_attempts where operation_id=ai_retry.retry_op))) from ai_retry$$,'provider Retry-After creates a shared cooldown');
select throws_ok($$select public.claim_answer_transcription(aid,uid,gen_random_uuid()) from first_ai$$,
  'P0001','AI_CAPACITY_COOLDOWN','cooldown stops a different user before dispatch');
update public.ai_model_rates set audio_per_hour=1 where model='whisper-large-v3-turbo';
select ok((select abs(estimated_cost_usd-0.04/60)<0.00000001 from public.ai_usage_costs where operation_id=(select op from first_ai)),'price snapshots survive administrative rate changes');
select is((select estimated_cost_usd from public.ai_usage_costs where operation_id=(select op from second_ai)),null::numeric,'uncertain cost is not reported as zero');
update public.ai_capacity_settings set cooldown_until=null,max_active=100,requests_per_minute=1;
select throws_ok($$select public.claim_answer_transcription(aid,uid,gen_random_uuid()) from first_ai$$,
  'P0001','AI_CAPACITY_BUSY','shared rate cap works independently of active capacity');
select * from finish();
rollback;

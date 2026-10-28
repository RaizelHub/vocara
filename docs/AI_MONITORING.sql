-- Read-only administrator queries. Run manually in a trusted SQL session after
-- applying migration 014. Never expose the service-role key to the application.
select * from public.ai_usage_daily order by usage_day desc;

select date_trunc('month',usage_day) as usage_month,
  sum(provider_requests) provider_requests,sum(retried_requests) retried_requests,
  sum(failed_operations) failed_operations,sum(reported_input_tokens) reported_input_tokens,
  sum(reported_output_tokens) reported_output_tokens,sum(attempted_audio_minutes) attempted_audio_minutes,
  sum(known_estimated_cost_usd) known_estimated_cost_usd,
  sum(requests_with_unknown_cost) requests_with_unknown_cost
from public.ai_usage_daily group by 1 order by 1 desc;

-- Export ONLY this result to a private CSV for ai_cost_report.py --usage-csv.
-- Includes sessions with measured post-014 attempts, not historical sessions with
-- no usage collection. Costs belong to requests, including failed/invalid outputs.
select s.id interview_id,s.status,
  count(*) filter(where u.provider_status <> 'not_sent') provider_requests,
  count(*) filter(where u.is_retry and u.provider_status <> 'not_sent') retried_requests,
  count(*) filter(where u.status='failed') failed_operations,
  sum(u.input_tokens) reported_input_tokens,sum(u.output_tokens) reported_output_tokens,
  sum(u.audio_seconds) filter(where u.provider_status <> 'not_sent')/60 attempted_audio_minutes,
  sum(u.estimated_cost_usd) known_estimated_cost_usd,
  count(*) filter(where u.provider_status <> 'not_sent' and u.estimated_cost_usd is null) requests_with_unknown_cost
from public.interview_sessions s join public.ai_usage_costs u on u.interview_id=s.id
where s.started_at >= (select measurement_started_at from public.ai_capacity_settings where singleton)
group by s.id,s.status order by s.id;

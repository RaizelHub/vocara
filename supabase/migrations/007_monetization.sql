begin;

-- ---------------------------------------------------------------------------
-- VOCARA MONETIZATION
-- Free plan + Vocara Pro, RevenueCat as the source of truth.
-- Usage limits are enforced atomically server-side via check_feature_access().
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- plan_feature_limits: declarative plan matrix (server-only reads)
-- ---------------------------------------------------------------------------

create table public.plan_feature_limits (
  plan text not null check (plan in ('free', 'pro')),
  feature text not null,
  allowed boolean not null default true,
  period text check (period in ('day', 'month')),
  limit_value integer check (limit_value is null or limit_value >= 0),
  primary key (plan, feature)
);

insert into public.plan_feature_limits (plan, feature, allowed, period, limit_value) values
  ('free', 'ai_feedback',           true,  'day',   5),
  ('free', 'job_analysis',          true,  'month', 2),
  ('free', 'resume_analysis',       true,  'month', 1),
  ('free', 'personalized_interview', true, 'month', 1),
  ('free', 'deep_interview',        false, null,    null),
  ('free', 'full_history',          false, null,    null),
  ('pro',  'ai_feedback',           true,  null,    null),
  ('pro',  'job_analysis',          true,  null,    null),
  ('pro',  'resume_analysis',       true,  null,    null),
  ('pro',  'personalized_interview', true, null,    null),
  ('pro',  'deep_interview',        true,  null,    null),
  ('pro',  'full_history',          true,  null,    null);

alter table public.plan_feature_limits enable row level security;

-- ---------------------------------------------------------------------------
-- user_subscriptions: mirror of the RevenueCat entitlement.
-- Written ONLY by the revenuecat-webhook / sync-subscription edge functions
-- (service role); clients may read only their own row.
-- ---------------------------------------------------------------------------

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  rc_app_user_id text,
  rc_original_app_user_id text,
  rc_entitlement_id text,
  rc_entitlement_source text,
  rc_entitlement_created_at timestamptz,
  rc_entitlement_expires_at timestamptz,
  rc_management_url text,
  rc_last_event text,
  synced_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_rc_app_user_length check (
    rc_app_user_id is null or char_length(rc_app_user_id) <= 200
  ),
  constraint user_subscriptions_rc_original_length check (
    rc_original_app_user_id is null or char_length(rc_original_app_user_id) <= 200
  ),
  constraint user_subscriptions_rc_entitlement_length check (
    rc_entitlement_id is null or char_length(rc_entitlement_id) <= 120
  ),
  constraint user_subscriptions_rc_source_length check (
    rc_entitlement_source is null or char_length(rc_entitlement_source) <= 80
  ),
  constraint user_subscriptions_rc_management_url_length check (
    rc_management_url is null or char_length(rc_management_url) <= 2048
  ),
  constraint user_subscriptions_rc_last_event_length check (
    rc_last_event is null or char_length(rc_last_event) <= 120
  )
);

alter table public.user_subscriptions enable row level security;

create policy "user_subscriptions_select_own"
  on public.user_subscriptions
  for select
  using (auth.uid() = user_id);

-- No insert / update / delete policies: the service role (edge functions) is
-- the only writer, so subscribers cannot self-grant Pro.

-- ---------------------------------------------------------------------------
-- feature_usage: period-scoped counters for plan-based limits.
-- ---------------------------------------------------------------------------

create table public.feature_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  feature text not null,
  period_start date not null,
  period_end date not null,
  usage_count integer not null default 0 check (usage_count >= 0),
  primary key (user_id, feature, period_start),
  constraint feature_usage_period_check check (period_end >= period_start)
);

alter table public.feature_usage enable row level security;

create policy "feature_usage_select_own"
  on public.feature_usage
  for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- feature_usage_events: idempotency ledger (one row per reservation).
-- event_key is the evaluation attempt ID, so retries never double-count.
-- ---------------------------------------------------------------------------

create table public.feature_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  feature text not null,
  event_key text not null,
  plan text not null check (plan in ('free', 'pro')),
  counted boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, feature, event_key),
  constraint feature_usage_events_key_length check (char_length(event_key) <= 200)
);

alter table public.feature_usage_events enable row level security;

create policy "feature_usage_events_select_own"
  on public.feature_usage_events
  for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- revenuecat_webhook_events: webhook idempotency (event.id unique).
-- ---------------------------------------------------------------------------

create table public.revenuecat_webhook_events (
  event_id text primary key,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint revenuecat_webhook_events_id_length check (char_length(event_id) <= 200)
);

alter table public.revenuecat_webhook_events enable row level security;

-- ---------------------------------------------------------------------------
-- check_feature_access(p_user_id, p_feature, p_event_key)
-- Atomic, idempotent, plan-aware quota reservation.
--   * PRO_REQUIRED         -> feature is Pro-only and the user is Free
--   * FEATURE_LIMIT_REACHED -> free-plan period limit is exhausted
-- Service role only; clients cannot call it.
-- ---------------------------------------------------------------------------

create or replace function public.check_feature_access(
  p_user_id uuid,
  p_feature text,
  p_event_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_allowed boolean;
  v_period text;
  v_limit_value integer;
  v_period_start date;
  v_period_end date;
  v_count integer;
  v_already boolean;
begin
  if p_user_id is null or p_event_key is null
    or nullif(btrim(p_feature), '') is null
    or char_length(p_event_key) > 200
  then
    raise exception 'FEATURE_ACCESS_INVALID_INPUT' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'vocara-feature-usage:' || p_user_id::text || ':' || p_feature,
      0
    )
  );

  select case
    when s.plan = 'pro'
      and (s.rc_entitlement_expires_at is null or s.rc_entitlement_expires_at > now())
    then 'pro' else 'free'
  end
  into v_plan
  from public.user_subscriptions as s
  where s.user_id = p_user_id;
  v_plan := coalesce(v_plan, 'free');

  select exists (
    select 1
    from public.feature_usage_events
    where user_id = p_user_id
      and feature = p_feature
      and event_key = p_event_key
  )
  into v_already;

  if v_already then
    return jsonb_build_object(
      'feature', p_feature,
      'plan', v_plan,
      'allowed', true,
      'alreadyCounted', true
    );
  end if;

  select l.allowed, l.period, l.limit_value
  into v_allowed, v_period, v_limit_value
  from public.plan_feature_limits as l
  where l.plan = v_plan
    and l.feature = p_feature;

  if v_allowed is null then
    raise exception 'FEATURE_ACCESS_UNKNOWN_FEATURE' using errcode = 'P0001';
  end if;
  if not v_allowed then
    raise exception 'VOCARA_PRO_REQUIRED' using errcode = 'P0001';
  end if;

  if v_period is not null then
    if v_period = 'day' then
      v_period_start := current_date;
      v_period_end := current_date;
    else
      v_period_start := date_trunc('month', current_date)::date;
      v_period_end := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
    end if;

    insert into public.feature_usage (user_id, feature, period_start, period_end, usage_count)
    values (p_user_id, p_feature, v_period_start, v_period_end, 1)
    on conflict (user_id, feature, period_start)
    do update set usage_count = public.feature_usage.usage_count + 1
    returning usage_count into v_count;

    if v_limit_value is not null and v_count > v_limit_value then
      -- Rolls back the increment above: the counter stays at the limit.
      raise exception 'VOCARA_FEATURE_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.feature_usage_events (
    user_id, feature, event_key, plan, counted
  ) values (
    p_user_id, p_feature, p_event_key, v_plan, v_period is not null
  );

  return jsonb_build_object(
    'feature', p_feature,
    'plan', v_plan,
    'allowed', true,
    'alreadyCounted', false
  );
end;
$$;

revoke all on function public.check_feature_access(uuid, text, text) from public, anon, authenticated;
grant execute on function public.check_feature_access(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- sync_user_subscription(p_user_id, ...)
-- Upserts the RevenueCat entitlement mirror. Service role only.
-- ---------------------------------------------------------------------------

create or replace function public.sync_user_subscription(
  p_user_id uuid,
  p_plan text,
  p_rc_app_user_id text default null,
  p_rc_original_app_user_id text default null,
  p_rc_entitlement_id text default null,
  p_rc_entitlement_source text default null,
  p_rc_entitlement_created_at timestamptz default null,
  p_rc_entitlement_expires_at timestamptz default null,
  p_rc_management_url text default null,
  p_rc_last_event text default null
)
returns public.user_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.user_subscriptions;
begin
  if p_user_id is null or p_plan not in ('free', 'pro') then
    raise exception 'SUBSCRIPTION_SYNC_INVALID_INPUT' using errcode = '22023';
  end if;

  insert into public.user_subscriptions (
    user_id, plan, rc_app_user_id, rc_original_app_user_id, rc_entitlement_id,
    rc_entitlement_source, rc_entitlement_created_at, rc_entitlement_expires_at,
    rc_management_url, rc_last_event, synced_at
  ) values (
    p_user_id, p_plan, left(p_rc_app_user_id, 200), left(p_rc_original_app_user_id, 200),
    left(p_rc_entitlement_id, 120), left(p_rc_entitlement_source, 80),
    p_rc_entitlement_created_at, p_rc_entitlement_expires_at,
    left(p_rc_management_url, 2048), left(p_rc_last_event, 120), now()
  )
  on conflict (user_id) do update set
    plan = excluded.plan,
    rc_app_user_id = excluded.rc_app_user_id,
    rc_original_app_user_id = excluded.rc_original_app_user_id,
    rc_entitlement_id = excluded.rc_entitlement_id,
    rc_entitlement_source = excluded.rc_entitlement_source,
    rc_entitlement_created_at = excluded.rc_entitlement_created_at,
    rc_entitlement_expires_at = excluded.rc_entitlement_expires_at,
    rc_management_url = excluded.rc_management_url,
    rc_last_event = excluded.rc_last_event,
    synced_at = now(),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.sync_user_subscription(
  uuid, text, text, text, text, text, timestamptz, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.sync_user_subscription(
  uuid, text, text, text, text, text, timestamptz, timestamptz, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- get_feature_usage_summary()
-- Client-facing read: the caller's plan plus each feature's limit and usage.
-- Uses auth.uid() internally so users can only ever see their own numbers.
-- ---------------------------------------------------------------------------

create or replace function public.get_feature_usage_summary()
returns table (
  feature text,
  plan text,
  allowed boolean,
  period text,
  limit_value integer,
  used integer,
  period_start date,
  period_end date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan text;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select case
    when s.plan = 'pro'
      and (s.rc_entitlement_expires_at is null or s.rc_entitlement_expires_at > now())
    then 'pro' else 'free'
  end
  into v_plan
  from public.user_subscriptions as s
  where s.user_id = v_user_id;
  v_plan := coalesce(v_plan, 'free');

  return query
  select
    l.feature,
    l.plan::text,
    l.allowed,
    l.period,
    l.limit_value,
    case when l.period is not null then coalesce(u.usage_count, 0) else null end::integer as used,
    case
      when l.period = 'day' then current_date
      when l.period = 'month' then date_trunc('month', current_date)::date
      else null
    end as period_start,
    case
      when l.period = 'day' then current_date
      when l.period = 'month' then (date_trunc('month', current_date) + interval '1 month - 1 day')::date
      else null
    end as period_end
  from public.plan_feature_limits as l
  left join public.feature_usage as u
    on u.user_id = v_user_id
    and u.feature = l.feature
    and u.period_start = case
      when l.period = 'day' then current_date
      when l.period = 'month' then date_trunc('month', current_date)::date
      else null
    end
  where l.plan = v_plan
  order by l.feature;
end;
$$;

grant execute on function public.get_feature_usage_summary() to authenticated;

commit;

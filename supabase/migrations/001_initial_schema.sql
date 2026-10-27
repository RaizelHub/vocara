begin;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Core user data
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  target_role text,
  experience_level text,
  interview_timeline text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (char_length(full_name) <= 160),
  constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 2048),
  constraint profiles_target_role_length check (target_role is null or char_length(target_role) <= 160),
  constraint profiles_experience_level_length check (
    experience_level is null or char_length(experience_level) <= 80
  ),
  constraint profiles_interview_timeline_length check (
    interview_timeline is null or char_length(interview_timeline) <= 80
  )
);

create table public.user_focus_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  focus_area text not null,
  created_at timestamptz not null default now(),
  constraint user_focus_areas_user_focus_unique unique (user_id, focus_area),
  constraint user_focus_areas_value_check check (
    focus_area in (
      'confidence',
      'english_fluency',
      'grammar',
      'clearer_answers',
      'interview_structure',
      'technical_questions',
      'pronunciation',
      'speaking_naturally'
    )
  )
);

create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  default_difficulty text not null default 'intermediate',
  default_interviewer_style text not null default 'balanced',
  daily_goal_minutes integer not null default 10,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_difficulty_check check (
    default_difficulty in ('beginner', 'intermediate', 'advanced')
  ),
  constraint user_preferences_interviewer_style_check check (
    default_interviewer_style in ('supportive', 'balanced', 'challenging')
  ),
  constraint user_preferences_daily_goal_check check (
    daily_goal_minutes between 1 and 240
  )
);

-- ---------------------------------------------------------------------------
-- Interview foundation (content and feedback remain mocked in the app today)
-- ---------------------------------------------------------------------------

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  interview_type text not null,
  difficulty text not null,
  interviewer_style text not null,
  status text not null default 'created',
  total_questions integer not null,
  overall_score numeric(5, 2),
  duration_seconds integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint interview_sessions_id_user_unique unique (id, user_id),
  constraint interview_sessions_role_check check (char_length(btrim(role)) between 1 and 160),
  constraint interview_sessions_type_check check (char_length(btrim(interview_type)) between 1 and 80),
  constraint interview_sessions_difficulty_check check (
    difficulty in ('beginner', 'intermediate', 'advanced')
  ),
  constraint interview_sessions_style_check check (
    interviewer_style in ('supportive', 'balanced', 'challenging')
  ),
  constraint interview_sessions_status_check check (
    status in ('created', 'in_progress', 'completed', 'abandoned')
  ),
  constraint interview_sessions_question_count_check check (total_questions > 0),
  constraint interview_sessions_score_check check (
    overall_score is null or overall_score between 0 and 100
  ),
  constraint interview_sessions_duration_check check (
    duration_seconds is null or duration_seconds >= 0
  ),
  constraint interview_sessions_time_order_check check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

create table public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  question_number integer not null,
  question_text text not null,
  question_type text,
  created_at timestamptz not null default now(),
  constraint interview_questions_session_number_unique unique (session_id, question_number),
  constraint interview_questions_session_id_unique unique (session_id, id),
  constraint interview_questions_number_check check (question_number > 0),
  constraint interview_questions_text_check check (char_length(btrim(question_text)) > 0)
);

create table public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  question_id uuid not null,
  user_id uuid not null,
  transcript text,
  audio_path text,
  duration_seconds integer,
  word_count integer,
  speaking_pace numeric(7, 2),
  score numeric(5, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_answers_question_unique unique (question_id),
  constraint interview_answers_session_owner_fkey
    foreign key (session_id, user_id)
    references public.interview_sessions (id, user_id)
    on delete cascade,
  constraint interview_answers_question_session_fkey
    foreign key (session_id, question_id)
    references public.interview_questions (session_id, id)
    on delete cascade,
  constraint interview_answers_duration_check check (
    duration_seconds is null or duration_seconds >= 0
  ),
  constraint interview_answers_word_count_check check (word_count is null or word_count >= 0),
  constraint interview_answers_pace_check check (speaking_pace is null or speaking_pace >= 0),
  constraint interview_answers_score_check check (score is null or score between 0 and 100)
);

create table public.answer_feedback (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null unique references public.interview_answers (id) on delete cascade,
  clarity_score numeric(5, 2),
  grammar_score numeric(5, 2),
  confidence_score numeric(5, 2),
  structure_score numeric(5, 2),
  relevance_score numeric(5, 2),
  vocabulary_score numeric(5, 2),
  strengths jsonb,
  improvements jsonb,
  better_approach text,
  improved_answer text,
  filler_words jsonb,
  created_at timestamptz not null default now(),
  constraint answer_feedback_score_ranges_check check (
    (clarity_score is null or clarity_score between 0 and 100)
    and (grammar_score is null or grammar_score between 0 and 100)
    and (confidence_score is null or confidence_score between 0 and 100)
    and (structure_score is null or structure_score between 0 and 100)
    and (relevance_score is null or relevance_score between 0 and 100)
    and (vocabulary_score is null or vocabulary_score between 0 and 100)
  ),
  constraint answer_feedback_strengths_json_check check (
    strengths is null or jsonb_typeof(strengths) = 'array'
  ),
  constraint answer_feedback_improvements_json_check check (
    improvements is null or jsonb_typeof(improvements) = 'array'
  ),
  constraint answer_feedback_fillers_json_check check (
    filler_words is null or jsonb_typeof(filler_words) = 'array'
  )
);

-- ---------------------------------------------------------------------------
-- Query and RLS support indexes
-- ---------------------------------------------------------------------------

create index interview_sessions_user_created_idx
  on public.interview_sessions (user_id, created_at desc);

create index interview_sessions_user_status_idx
  on public.interview_sessions (user_id, status);

create index interview_sessions_user_completed_idx
  on public.interview_sessions (user_id, completed_at desc)
  where completed_at is not null;

create index interview_answers_user_idx
  on public.interview_answers (user_id);

create index interview_answers_session_idx
  on public.interview_answers (session_id);

-- ---------------------------------------------------------------------------
-- Reusable updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

create trigger interview_answers_set_updated_at
before update on public.interview_answers
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reliable auth.users -> profile/preferences provisioning
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        split_part(coalesce(new.email, ''), '@', 1),
        ''
      ),
      160
    ),
    case
      when char_length(nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), '')) <= 2048
        then nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), '')
      else null
    end
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Provision users that may already exist when this migration is applied.
insert into public.profiles (id, full_name, avatar_url)
select
  users.id,
  left(
    coalesce(
      nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(users.email, ''), '@', 1),
      ''
    ),
    160
  ),
  case
    when char_length(nullif(btrim(users.raw_user_meta_data ->> 'avatar_url'), '')) <= 2048
      then nullif(btrim(users.raw_user_meta_data ->> 'avatar_url'), '')
    else null
  end
from auth.users as users
on conflict (id) do nothing;

insert into public.user_preferences (user_id)
select users.id
from auth.users as users
on conflict (user_id) do nothing;

-- Keep the UI's one-to-three focus-area rule true even for direct API writes.
create or replace function public.enforce_focus_area_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 0)
  );

  select count(*)
  into v_count
  from public.user_focus_areas
  where user_id = new.user_id
    and id <> new.id;

  if v_count >= 3 then
    raise exception 'A user can have at most three focus areas' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger user_focus_areas_enforce_limit
before insert or update of user_id on public.user_focus_areas
for each row execute function public.enforce_focus_area_limit();

-- ---------------------------------------------------------------------------
-- Atomic career setup RPC. SECURITY DEFINER is required because authenticated
-- clients only receive column-level profile grants; authorization is enforced
-- inside the function through auth.uid() and schema-qualified writes.
-- ---------------------------------------------------------------------------

create or replace function public.complete_career_setup(
  p_target_role text,
  p_experience_level text,
  p_interview_timeline text,
  p_focus_areas text[]
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(btrim(p_target_role), '') is null then
    raise exception 'Target role is required' using errcode = '22023';
  end if;

  if nullif(btrim(p_experience_level), '') is null then
    raise exception 'Experience level is required' using errcode = '22023';
  end if;

  if nullif(btrim(p_interview_timeline), '') is null then
    raise exception 'Interview timeline is required' using errcode = '22023';
  end if;

  if coalesce(cardinality(p_focus_areas), 0) not between 1 and 3 then
    raise exception 'Choose between one and three focus areas' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_focus_areas) as value
    where value is null
      or value not in (
      'confidence',
      'english_fluency',
      'grammar',
      'clearer_answers',
      'interview_structure',
      'technical_questions',
      'pronunciation',
      'speaking_naturally'
    )
  ) then
    raise exception 'Unsupported focus area' using errcode = '22023';
  end if;

  update public.profiles
  set
    target_role = btrim(p_target_role),
    experience_level = btrim(p_experience_level),
    interview_timeline = btrim(p_interview_timeline),
    onboarding_completed = true
  where id = v_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  delete from public.user_focus_areas
  where user_id = v_user_id;

  insert into public.user_focus_areas (user_id, focus_area)
  select v_user_id, selected.focus_area
  from (
    select distinct unnest(p_focus_areas) as focus_area
  ) as selected;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_focus_areas enable row level security;
alter table public.user_preferences enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_questions enable row level security;
alter table public.interview_answers enable row level security;
alter table public.answer_feedback enable row level security;

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "focus_areas_select_own"
on public.user_focus_areas for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "focus_areas_insert_own"
on public.user_focus_areas for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "focus_areas_update_own"
on public.user_focus_areas for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "focus_areas_delete_own"
on public.user_focus_areas for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "preferences_select_own"
on public.user_preferences for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "preferences_insert_own"
on public.user_preferences for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "preferences_update_own"
on public.user_preferences for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "sessions_select_own"
on public.interview_sessions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "sessions_insert_own"
on public.interview_sessions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "sessions_update_own"
on public.interview_sessions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "sessions_delete_own"
on public.interview_sessions for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "questions_select_through_session"
on public.interview_questions for select
to authenticated
using (
  exists (
    select 1
    from public.interview_sessions as session
    where session.id = interview_questions.session_id
      and session.user_id = (select auth.uid())
  )
);

create policy "questions_insert_through_session"
on public.interview_questions for insert
to authenticated
with check (
  exists (
    select 1
    from public.interview_sessions as session
    where session.id = interview_questions.session_id
      and session.user_id = (select auth.uid())
  )
);

create policy "questions_update_through_session"
on public.interview_questions for update
to authenticated
using (
  exists (
    select 1
    from public.interview_sessions as session
    where session.id = interview_questions.session_id
      and session.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.interview_sessions as session
    where session.id = interview_questions.session_id
      and session.user_id = (select auth.uid())
  )
);

create policy "questions_delete_through_session"
on public.interview_questions for delete
to authenticated
using (
  exists (
    select 1
    from public.interview_sessions as session
    where session.id = interview_questions.session_id
      and session.user_id = (select auth.uid())
  )
);

create policy "answers_select_own"
on public.interview_answers for select
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.interview_sessions as session
    where session.id = interview_answers.session_id
      and session.user_id = (select auth.uid())
  )
);

create policy "answers_insert_own"
on public.interview_answers for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.interview_sessions as session
    where session.id = interview_answers.session_id
      and session.user_id = (select auth.uid())
  )
);

create policy "answers_update_own"
on public.interview_answers for update
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.interview_sessions as session
    where session.id = interview_answers.session_id
      and session.user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.interview_sessions as session
    where session.id = interview_answers.session_id
      and session.user_id = (select auth.uid())
  )
);

create policy "answers_delete_own"
on public.interview_answers for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.interview_sessions as session
    where session.id = interview_answers.session_id
      and session.user_id = (select auth.uid())
  )
);

create policy "feedback_select_through_answer"
on public.answer_feedback for select
to authenticated
using (
  exists (
    select 1
    from public.interview_answers as answer
    where answer.id = answer_feedback.answer_id
      and answer.user_id = (select auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- API privileges. RLS remains the final authorization boundary.
-- ---------------------------------------------------------------------------

revoke all on table
  public.profiles,
  public.user_focus_areas,
  public.user_preferences,
  public.interview_sessions,
  public.interview_questions,
  public.interview_answers,
  public.answer_feedback
from anon, authenticated, public;

grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

grant select, delete on public.user_focus_areas to authenticated;
grant insert (user_id, focus_area) on public.user_focus_areas to authenticated;
grant update (focus_area) on public.user_focus_areas to authenticated;

grant select on public.user_preferences to authenticated;
grant insert (
  user_id,
  default_difficulty,
  default_interviewer_style,
  daily_goal_minutes,
  notifications_enabled
) on public.user_preferences to authenticated;
grant update (
  default_difficulty,
  default_interviewer_style,
  daily_goal_minutes,
  notifications_enabled
) on public.user_preferences to authenticated;

grant select, delete on public.interview_sessions to authenticated;
grant insert (
  user_id,
  role,
  interview_type,
  difficulty,
  interviewer_style,
  status,
  total_questions,
  started_at
) on public.interview_sessions to authenticated;
grant update (
  role,
  interview_type,
  difficulty,
  interviewer_style,
  status,
  total_questions,
  duration_seconds,
  started_at,
  completed_at
) on public.interview_sessions to authenticated;

grant select, delete on public.interview_questions to authenticated;
grant insert (session_id, question_number, question_text, question_type)
  on public.interview_questions to authenticated;
grant update (question_number, question_text, question_type)
  on public.interview_questions to authenticated;

grant select, delete on public.interview_answers to authenticated;
grant insert (session_id, question_id, user_id, audio_path, duration_seconds)
  on public.interview_answers to authenticated;
grant update (audio_path, duration_seconds)
  on public.interview_answers to authenticated;
grant select on public.answer_feedback to authenticated;

grant all privileges on table
  public.profiles,
  public.user_focus_areas,
  public.user_preferences,
  public.interview_sessions,
  public.interview_questions,
  public.interview_answers,
  public.answer_feedback
to service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.enforce_focus_area_limit() from public, anon, authenticated;
revoke all on function public.complete_career_setup(text, text, text, text[])
  from public, anon;
grant execute on function public.complete_career_setup(text, text, text, text[])
  to authenticated, service_role;

commit;

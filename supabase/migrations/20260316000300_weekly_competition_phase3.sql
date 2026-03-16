begin;

create table if not exists public.competition_weeks (
  id uuid primary key default uuid_generate_v4(),
  week_key date not null unique,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_weeks_status_check
    check (status in ('active', 'finalized')),
  constraint competition_weeks_range_check
    check (ends_at > starts_at)
);

create index if not exists competition_weeks_status_idx
  on public.competition_weeks (status, starts_at desc);

create table if not exists public.weekly_leagues (
  id uuid primary key default uuid_generate_v4(),
  week_id uuid not null references public.competition_weeks (id) on delete cascade,
  tier text not null,
  cohort_number int not null default 1,
  title text not null,
  max_members int not null default 20,
  member_count int not null default 0,
  promotion_slots int not null default 3,
  demotion_slots int not null default 3,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, tier, cohort_number),
  constraint weekly_leagues_tier_check
    check (tier in ('bronze', 'silver', 'gold', 'diamond')),
  constraint weekly_leagues_status_check
    check (status in ('active', 'finalized')),
  constraint weekly_leagues_max_members_check
    check (max_members >= 5 and max_members <= 50),
  constraint weekly_leagues_member_count_check
    check (member_count >= 0),
  constraint weekly_leagues_promotion_slots_check
    check (promotion_slots >= 0 and promotion_slots <= 10),
  constraint weekly_leagues_demotion_slots_check
    check (demotion_slots >= 0 and demotion_slots <= 10)
);

create index if not exists weekly_leagues_week_idx
  on public.weekly_leagues (week_id, tier, cohort_number);

create table if not exists public.weekly_league_memberships (
  id uuid primary key default uuid_generate_v4(),
  week_id uuid not null references public.competition_weeks (id) on delete cascade,
  league_id uuid not null references public.weekly_leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  league_tier text not null,
  weekly_points int not null default 0,
  practice_points int not null default 0,
  flashcard_points int not null default 0,
  weekly_xp_earned int not null default 0,
  practice_sessions_completed int not null default 0,
  flashcard_sessions_completed int not null default 0,
  listening_items_completed int not null default 0,
  weakness_sessions_completed int not null default 0,
  flashcard_writing_answers_completed int not null default 0,
  completed_runs int not null default 0,
  accuracy_score_total numeric(8, 2) not null default 0,
  average_accuracy numeric(5, 2) not null default 0,
  rank_position int,
  promotion_state text not null default 'pending',
  reward_xp_awarded int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, user_id),
  constraint weekly_league_memberships_tier_check
    check (league_tier in ('bronze', 'silver', 'gold', 'diamond')),
  constraint weekly_league_memberships_weekly_points_check
    check (weekly_points >= 0),
  constraint weekly_league_memberships_practice_points_check
    check (practice_points >= 0),
  constraint weekly_league_memberships_flashcard_points_check
    check (flashcard_points >= 0),
  constraint weekly_league_memberships_weekly_xp_check
    check (weekly_xp_earned >= 0),
  constraint weekly_league_memberships_practice_sessions_check
    check (practice_sessions_completed >= 0),
  constraint weekly_league_memberships_flashcard_sessions_check
    check (flashcard_sessions_completed >= 0),
  constraint weekly_league_memberships_listening_items_check
    check (listening_items_completed >= 0),
  constraint weekly_league_memberships_weakness_sessions_check
    check (weakness_sessions_completed >= 0),
  constraint weekly_league_memberships_flashcard_writing_check
    check (flashcard_writing_answers_completed >= 0),
  constraint weekly_league_memberships_completed_runs_check
    check (completed_runs >= 0),
  constraint weekly_league_memberships_accuracy_total_check
    check (accuracy_score_total >= 0),
  constraint weekly_league_memberships_average_accuracy_check
    check (average_accuracy >= 0 and average_accuracy <= 100),
  constraint weekly_league_memberships_rank_check
    check (rank_position is null or rank_position >= 1),
  constraint weekly_league_memberships_promotion_state_check
    check (promotion_state in ('pending', 'promoted', 'safe', 'demoted', 'hold')),
  constraint weekly_league_memberships_reward_xp_check
    check (reward_xp_awarded >= 0)
);

create index if not exists weekly_league_memberships_league_idx
  on public.weekly_league_memberships (league_id, weekly_points desc, average_accuracy desc, updated_at asc);

create index if not exists weekly_league_memberships_user_idx
  on public.weekly_league_memberships (user_id, week_id desc);

create table if not exists public.weekly_rank_snapshots (
  id uuid primary key default uuid_generate_v4(),
  week_id uuid not null references public.competition_weeks (id) on delete cascade,
  league_id uuid not null references public.weekly_leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  league_tier text not null,
  rank_position int not null,
  total_members int not null,
  weekly_points int not null default 0,
  practice_points int not null default 0,
  flashcard_points int not null default 0,
  average_accuracy numeric(5, 2) not null default 0,
  promotion_state text not null,
  reward_xp_awarded int not null default 0,
  created_at timestamptz not null default now(),
  unique (week_id, user_id),
  constraint weekly_rank_snapshots_tier_check
    check (league_tier in ('bronze', 'silver', 'gold', 'diamond')),
  constraint weekly_rank_snapshots_rank_check
    check (rank_position >= 1),
  constraint weekly_rank_snapshots_total_members_check
    check (total_members >= 1),
  constraint weekly_rank_snapshots_points_check
    check (weekly_points >= 0 and practice_points >= 0 and flashcard_points >= 0),
  constraint weekly_rank_snapshots_accuracy_check
    check (average_accuracy >= 0 and average_accuracy <= 100),
  constraint weekly_rank_snapshots_promotion_state_check
    check (promotion_state in ('promoted', 'safe', 'demoted', 'hold')),
  constraint weekly_rank_snapshots_reward_xp_check
    check (reward_xp_awarded >= 0)
);

create index if not exists weekly_rank_snapshots_user_idx
  on public.weekly_rank_snapshots (user_id, created_at desc);

create table if not exists public.weekly_quest_definitions (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  title text not null,
  description text,
  reward_xp int not null default 0,
  metric_type text not null,
  target_count int not null,
  filter_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_quest_definitions_reward_xp_check
    check (reward_xp >= 0),
  constraint weekly_quest_definitions_metric_type_check
    check (
      metric_type in (
        'practice_sessions_completed',
        'practice_listening_items_completed',
        'practice_weakness_sessions_completed',
        'flashcard_writing_answers_completed',
        'weekly_xp_earned'
      )
    ),
  constraint weekly_quest_definitions_target_count_check
    check (target_count >= 1),
  constraint weekly_quest_definitions_filter_json_check
    check (jsonb_typeof(filter_json) = 'object')
);

create index if not exists weekly_quest_definitions_active_idx
  on public.weekly_quest_definitions (is_active, sort_order, created_at);

create table if not exists public.weekly_quest_progress (
  id uuid primary key default uuid_generate_v4(),
  week_id uuid not null references public.competition_weeks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  quest_definition_id uuid not null references public.weekly_quest_definitions (id) on delete cascade,
  progress_count int not null default 0,
  target_count int not null,
  is_completed boolean not null default false,
  completed_at timestamptz,
  reward_xp_granted int not null default 0,
  reward_granted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, user_id, quest_definition_id),
  constraint weekly_quest_progress_progress_count_check
    check (progress_count >= 0),
  constraint weekly_quest_progress_target_count_check
    check (target_count >= 1),
  constraint weekly_quest_progress_reward_xp_granted_check
    check (reward_xp_granted >= 0)
);

create index if not exists weekly_quest_progress_user_idx
  on public.weekly_quest_progress (user_id, week_id desc, is_completed, updated_at desc);

insert into public.weekly_quest_definitions (code, title, description, reward_xp, metric_type, target_count, filter_json, is_active, sort_order)
values
  ('practice_sessions_2', 'Complete 2 practice sessions', 'Finish two Practice Arena sessions this week.', 45, 'practice_sessions_completed', 2, '{}'::jsonb, true, 10),
  ('listening_items_15', 'Finish 15 listening items', 'Clear fifteen listening-focused practice items.', 60, 'practice_listening_items_completed', 15, '{}'::jsonb, true, 20),
  ('weakness_session_1', 'Complete 1 weakness recovery session', 'Finish one Weakness Recovery run in Practice Arena.', 40, 'practice_weakness_sessions_completed', 1, '{}'::jsonb, true, 30),
  ('flashcard_writing_10', 'Finish 10 flashcard writing answers', 'Complete ten Writing Sprint answers in Flashcard Arcade.', 50, 'flashcard_writing_answers_completed', 10, '{}'::jsonb, true, 40),
  ('weekly_xp_300', 'Earn 300 XP this week', 'Earn three hundred weekly XP from practice and flashcards.', 70, 'weekly_xp_earned', 300, '{}'::jsonb, true, 50)
on conflict (code) do update
set
  title = excluded.title,
  description = excluded.description,
  reward_xp = excluded.reward_xp,
  metric_type = excluded.metric_type,
  target_count = excluded.target_count,
  filter_json = excluded.filter_json,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

create or replace view public.weekly_leaderboard_entries as
select
  membership.id,
  membership.week_id,
  membership.league_id,
  membership.user_id,
  membership.league_tier,
  membership.weekly_points,
  membership.practice_points,
  membership.flashcard_points,
  membership.weekly_xp_earned,
  membership.average_accuracy,
  membership.practice_sessions_completed,
  membership.flashcard_sessions_completed,
  membership.rank_position,
  row_number() over (
    partition by membership.league_id
    order by membership.weekly_points desc, membership.average_accuracy desc, membership.updated_at asc
  ) as computed_rank,
  row_number() over (
    partition by membership.league_id
    order by membership.practice_points desc, membership.average_accuracy desc, membership.updated_at asc
  ) as practice_rank,
  row_number() over (
    partition by membership.league_id
    order by membership.flashcard_points desc, membership.average_accuracy desc, membership.updated_at asc
  ) as flashcard_rank,
  row_number() over (
    partition by membership.league_id
    order by membership.average_accuracy desc, membership.weekly_points desc, membership.updated_at asc
  ) as accuracy_rank
from public.weekly_league_memberships membership;

create or replace function public.refresh_weekly_league_member_counts(p_week_id uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.weekly_leagues league
  set
    member_count = coalesce(source.member_count, 0),
    updated_at = now()
  from (
    select
      membership.league_id,
      count(*)::int as member_count
    from public.weekly_league_memberships membership
    where p_week_id is null or membership.week_id = p_week_id
    group by membership.league_id
  ) source
  where league.id = source.league_id;
$$;

create or replace function public.finalize_ended_competition_weeks()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  finalized_count int := 0;
  current_week record;
begin
  for current_week in
    select *
    from public.competition_weeks
    where status = 'active'
      and ends_at <= now()
    order by starts_at asc
  loop
    perform public.refresh_weekly_league_member_counts(current_week.id);

    with ranked as (
      select
        membership.id,
        membership.user_id,
        membership.week_id,
        membership.league_id,
        membership.league_tier,
        membership.weekly_points,
        membership.practice_points,
        membership.flashcard_points,
        membership.average_accuracy,
        row_number() over (
          partition by membership.league_id
          order by membership.weekly_points desc, membership.average_accuracy desc, membership.updated_at asc
        ) as rank_position,
        count(*) over (partition by membership.league_id) as total_members,
        league.promotion_slots,
        league.demotion_slots
      from public.weekly_league_memberships membership
      join public.weekly_leagues league on league.id = membership.league_id
      where membership.week_id = current_week.id
    ),
    rewards as (
      select
        ranked.*,
        case
          when ranked.league_tier = 'diamond' and ranked.rank_position <= least(ranked.total_members, ranked.promotion_slots) then 'hold'
          when ranked.rank_position <= least(ranked.total_members, ranked.promotion_slots) then 'promoted'
          when ranked.league_tier <> 'bronze'
            and ranked.total_members > ranked.demotion_slots
            and ranked.rank_position > ranked.total_members - ranked.demotion_slots then 'demoted'
          else 'safe'
        end as promotion_state,
        case
          when ranked.rank_position = 1 then 40
          when ranked.rank_position = 2 then 28
          when ranked.rank_position = 3 then 20
          when ranked.rank_position <= 6 then 10
          else 0
        end as reward_xp_awarded
      from ranked
    )
    update public.weekly_league_memberships membership
    set
      rank_position = rewards.rank_position,
      promotion_state = rewards.promotion_state,
      reward_xp_awarded = rewards.reward_xp_awarded,
      updated_at = now()
    from rewards
    where membership.id = rewards.id;

    insert into public.weekly_rank_snapshots (
      week_id,
      league_id,
      user_id,
      league_tier,
      rank_position,
      total_members,
      weekly_points,
      practice_points,
      flashcard_points,
      average_accuracy,
      promotion_state,
      reward_xp_awarded
    )
    select
      membership.week_id,
      membership.league_id,
      membership.user_id,
      membership.league_tier,
      membership.rank_position,
      count(*) over (partition by membership.league_id) as total_members,
      membership.weekly_points,
      membership.practice_points,
      membership.flashcard_points,
      membership.average_accuracy,
      membership.promotion_state,
      membership.reward_xp_awarded
    from public.weekly_league_memberships membership
    where membership.week_id = current_week.id
    on conflict (week_id, user_id) do update
    set
      league_id = excluded.league_id,
      league_tier = excluded.league_tier,
      rank_position = excluded.rank_position,
      total_members = excluded.total_members,
      weekly_points = excluded.weekly_points,
      practice_points = excluded.practice_points,
      flashcard_points = excluded.flashcard_points,
      average_accuracy = excluded.average_accuracy,
      promotion_state = excluded.promotion_state,
      reward_xp_awarded = excluded.reward_xp_awarded,
      created_at = now();

    update public.user_gamification_profiles profile
    set
      lifetime_xp = profile.lifetime_xp + snapshot.reward_xp_awarded,
      updated_at = now()
    from public.weekly_rank_snapshots snapshot
    where snapshot.week_id = current_week.id
      and snapshot.user_id = profile.user_id
      and snapshot.reward_xp_awarded > 0;

    update public.profiles profile
    set
      xp_total = coalesce(profile.xp_total, 0) + snapshot.reward_xp_awarded
    from public.weekly_rank_snapshots snapshot
    where snapshot.week_id = current_week.id
      and snapshot.user_id = profile.id
      and snapshot.reward_xp_awarded > 0;

    update public.weekly_leagues
    set
      status = 'finalized',
      updated_at = now()
    where week_id = current_week.id;

    update public.competition_weeks
    set
      status = 'finalized',
      updated_at = now()
    where id = current_week.id;

    finalized_count := finalized_count + 1;
  end loop;

  return finalized_count;
end;
$$;

alter table public.competition_weeks enable row level security;
alter table public.weekly_leagues enable row level security;
alter table public.weekly_league_memberships enable row level security;
alter table public.weekly_rank_snapshots enable row level security;
alter table public.weekly_quest_definitions enable row level security;
alter table public.weekly_quest_progress enable row level security;

drop policy if exists "Authenticated read competition weeks" on public.competition_weeks;
create policy "Authenticated read competition weeks" on public.competition_weeks
  for select to authenticated
  using (true);

drop policy if exists "Admins manage competition weeks" on public.competition_weeks;
create policy "Admins manage competition weeks" on public.competition_weeks
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Authenticated read weekly leagues" on public.weekly_leagues;
create policy "Authenticated read weekly leagues" on public.weekly_leagues
  for select to authenticated
  using (true);

drop policy if exists "Admins manage weekly leagues" on public.weekly_leagues;
create policy "Admins manage weekly leagues" on public.weekly_leagues
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students read current league memberships" on public.weekly_league_memberships;
create policy "Students read current league memberships" on public.weekly_league_memberships
  for select using (
    public.is_admin()
    or user_id = auth.uid()
    or exists (
      select 1
      from public.weekly_league_memberships own_membership
      where own_membership.user_id = auth.uid()
        and own_membership.week_id = weekly_league_memberships.week_id
        and own_membership.league_id = weekly_league_memberships.league_id
    )
  );

drop policy if exists "Students insert own weekly memberships" on public.weekly_league_memberships;
create policy "Students insert own weekly memberships" on public.weekly_league_memberships
  for insert with check (
    public.is_admin()
    or user_id = auth.uid()
  );

drop policy if exists "Students update own weekly memberships" on public.weekly_league_memberships;
create policy "Students update own weekly memberships" on public.weekly_league_memberships
  for update using (
    public.is_admin()
    or user_id = auth.uid()
  )
  with check (
    public.is_admin()
    or user_id = auth.uid()
  );

drop policy if exists "Admins manage weekly memberships" on public.weekly_league_memberships;
create policy "Admins manage weekly memberships" on public.weekly_league_memberships
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students read own weekly snapshots" on public.weekly_rank_snapshots;
create policy "Students read own weekly snapshots" on public.weekly_rank_snapshots
  for select using (
    public.is_admin()
    or user_id = auth.uid()
  );

drop policy if exists "Admins manage weekly snapshots" on public.weekly_rank_snapshots;
create policy "Admins manage weekly snapshots" on public.weekly_rank_snapshots
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Authenticated read active weekly quest definitions" on public.weekly_quest_definitions;
create policy "Authenticated read active weekly quest definitions" on public.weekly_quest_definitions
  for select to authenticated
  using (is_active = true or public.is_admin());

drop policy if exists "Admins manage weekly quest definitions" on public.weekly_quest_definitions;
create policy "Admins manage weekly quest definitions" on public.weekly_quest_definitions
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students read own weekly quest progress" on public.weekly_quest_progress;
create policy "Students read own weekly quest progress" on public.weekly_quest_progress
  for select using (
    public.is_admin()
    or user_id = auth.uid()
  );

drop policy if exists "Students insert own weekly quest progress" on public.weekly_quest_progress;
create policy "Students insert own weekly quest progress" on public.weekly_quest_progress
  for insert with check (
    public.is_admin()
    or user_id = auth.uid()
  );

drop policy if exists "Students update own weekly quest progress" on public.weekly_quest_progress;
create policy "Students update own weekly quest progress" on public.weekly_quest_progress
  for update using (
    public.is_admin()
    or user_id = auth.uid()
  )
  with check (
    public.is_admin()
    or user_id = auth.uid()
  );

drop policy if exists "Admins manage weekly quest progress" on public.weekly_quest_progress;
create policy "Admins manage weekly quest progress" on public.weekly_quest_progress
  for all using (public.is_admin())
  with check (public.is_admin());

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    null;
  end;

  if exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) then
    if not exists (
      select 1
      from cron.job
      where jobname = 'finalize_ended_competition_weeks_hourly'
    ) then
      perform cron.schedule(
        'finalize_ended_competition_weeks_hourly',
        '15 * * * *',
        'select public.finalize_ended_competition_weeks();'
      );
    end if;
  end if;
exception when others then
  null;
end;
$$;

commit;

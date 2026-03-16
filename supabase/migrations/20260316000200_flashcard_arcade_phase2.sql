begin;

alter table public.user_gamification_profiles
  add column if not exists flashcard_xp int not null default 0;

alter table public.user_gamification_profiles
  add column if not exists flashcard_sessions_completed int not null default 0;

update public.user_gamification_profiles
set flashcard_xp = coalesce(flashcard_xp, 0)
where flashcard_xp is null;

update public.user_gamification_profiles
set flashcard_sessions_completed = coalesce(flashcard_sessions_completed, 0)
where flashcard_sessions_completed is null;

alter table public.user_gamification_profiles
  drop constraint if exists user_gamification_profiles_flashcard_xp_check;

alter table public.user_gamification_profiles
  add constraint user_gamification_profiles_flashcard_xp_check
    check (flashcard_xp >= 0);

alter table public.user_gamification_profiles
  drop constraint if exists user_gamification_profiles_flashcard_sessions_completed_check;

alter table public.user_gamification_profiles
  add constraint user_gamification_profiles_flashcard_sessions_completed_check
    check (flashcard_sessions_completed >= 0);

create table if not exists public.flashcard_decks (
  id uuid primary key default uuid_generate_v4(),
  slug text unique,
  title text not null,
  description text,
  source_type text not null default 'system',
  source_session_id uuid references public.course_sessions (id) on delete set null,
  source_template_session_id uuid references public.template_sessions (id) on delete set null,
  cefr_level text,
  theme_tag text,
  scenario_tag text,
  is_system boolean not null default true,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flashcard_decks_source_type_check
    check (source_type in ('system', 'session', 'template_session', 'theme', 'weakness')),
  constraint flashcard_decks_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists flashcard_decks_source_session_idx
  on public.flashcard_decks (source_type, source_session_id)
  where source_session_id is not null;

create unique index if not exists flashcard_decks_source_template_idx
  on public.flashcard_decks (source_type, source_template_session_id)
  where source_template_session_id is not null;

create index if not exists flashcard_decks_active_idx
  on public.flashcard_decks (is_active, source_type, updated_at desc);

create table if not exists public.flashcard_deck_items (
  id uuid primary key default uuid_generate_v4(),
  deck_id uuid not null references public.flashcard_decks (id) on delete cascade,
  flashcard_id uuid not null references public.flashcards (id) on delete cascade,
  position int not null default 1,
  weight numeric(5, 2) not null default 1,
  source_session_flashcard_id uuid references public.session_flashcards (id) on delete set null,
  source_template_flashcard_id uuid references public.template_session_flashcards (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deck_id, flashcard_id),
  unique (deck_id, position),
  constraint flashcard_deck_items_weight_check
    check (weight > 0 and weight <= 10),
  constraint flashcard_deck_items_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists flashcard_deck_items_deck_idx
  on public.flashcard_deck_items (deck_id, position);

create index if not exists flashcard_deck_items_flashcard_idx
  on public.flashcard_deck_items (flashcard_id, deck_id);

create table if not exists public.user_flashcard_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  flashcard_id uuid not null references public.flashcards (id) on delete cascade,
  seen_count int not null default 0,
  correct_count int not null default 0,
  incorrect_count int not null default 0,
  mastery_score numeric(5, 2) not null default 0,
  mastery_stage text not null default 'new',
  last_game_mode text,
  last_practiced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, flashcard_id),
  constraint user_flashcard_progress_seen_count_check
    check (seen_count >= 0),
  constraint user_flashcard_progress_correct_count_check
    check (correct_count >= 0),
  constraint user_flashcard_progress_incorrect_count_check
    check (incorrect_count >= 0),
  constraint user_flashcard_progress_mastery_score_check
    check (mastery_score >= 0 and mastery_score <= 100),
  constraint user_flashcard_progress_mastery_stage_check
    check (mastery_stage in ('new', 'learning', 'review', 'strong', 'mastered'))
);

create index if not exists user_flashcard_progress_user_idx
  on public.user_flashcard_progress (user_id, mastery_stage, mastery_score asc, updated_at desc);

create index if not exists user_flashcard_progress_flashcard_idx
  on public.user_flashcard_progress (flashcard_id, updated_at desc);

create table if not exists public.flashcard_game_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  deck_id uuid references public.flashcard_decks (id) on delete set null,
  deck_key text not null,
  deck_title text not null default 'Flashcards',
  source_type text not null default 'session',
  mode text not null default 'study',
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  total_cards int not null default 0,
  total_prompts int not null default 0,
  correct_answers int not null default 0,
  incorrect_answers int not null default 0,
  accuracy_rate numeric(5, 2) not null default 0,
  xp_earned int not null default 0,
  score int not null default 0,
  combo_max int not null default 0,
  lives_left int,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flashcard_game_sessions_source_type_check
    check (source_type in ('system', 'session', 'template_session', 'theme', 'weakness')),
  constraint flashcard_game_sessions_mode_check
    check (mode in ('study', 'speed_match', 'writing_sprint', 'memory_grid', 'survival')),
  constraint flashcard_game_sessions_status_check
    check (status in ('active', 'completed', 'abandoned')),
  constraint flashcard_game_sessions_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  constraint flashcard_game_sessions_total_cards_check
    check (total_cards >= 0 and total_cards <= 120),
  constraint flashcard_game_sessions_total_prompts_check
    check (total_prompts >= 0 and total_prompts <= 240),
  constraint flashcard_game_sessions_correct_answers_check
    check (correct_answers >= 0 and correct_answers <= 240),
  constraint flashcard_game_sessions_incorrect_answers_check
    check (incorrect_answers >= 0 and incorrect_answers <= 240),
  constraint flashcard_game_sessions_accuracy_rate_check
    check (accuracy_rate >= 0 and accuracy_rate <= 100),
  constraint flashcard_game_sessions_xp_earned_check
    check (xp_earned >= 0),
  constraint flashcard_game_sessions_score_check
    check (score >= 0),
  constraint flashcard_game_sessions_combo_max_check
    check (combo_max >= 0),
  constraint flashcard_game_sessions_lives_left_check
    check (lives_left is null or (lives_left >= 0 and lives_left <= 9))
);

create index if not exists flashcard_game_sessions_user_idx
  on public.flashcard_game_sessions (user_id, status, started_at desc);

create index if not exists flashcard_game_sessions_completed_idx
  on public.flashcard_game_sessions (user_id, completed_at desc)
  where completed_at is not null;

create index if not exists flashcard_game_sessions_deck_idx
  on public.flashcard_game_sessions (deck_key, mode, completed_at desc);

create table if not exists public.flashcard_game_events (
  id uuid primary key default uuid_generate_v4(),
  game_session_id uuid not null references public.flashcard_game_sessions (id) on delete cascade,
  flashcard_id uuid references public.flashcards (id) on delete set null,
  event_type text not null default 'seen',
  is_correct boolean,
  response_ms int,
  xp_earned int not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint flashcard_game_events_event_type_check
    check (event_type in ('seen', 'correct', 'incorrect', 'match', 'write', 'memory', 'complete', 'life_lost')),
  constraint flashcard_game_events_response_ms_check
    check (response_ms is null or response_ms >= 0),
  constraint flashcard_game_events_xp_earned_check
    check (xp_earned >= 0),
  constraint flashcard_game_events_payload_object_check
    check (jsonb_typeof(payload) = 'object')
);

create index if not exists flashcard_game_events_session_idx
  on public.flashcard_game_events (game_session_id, created_at asc);

create index if not exists flashcard_game_events_flashcard_idx
  on public.flashcard_game_events (flashcard_id, created_at desc);

alter table public.flashcard_decks enable row level security;
alter table public.flashcard_deck_items enable row level security;
alter table public.user_flashcard_progress enable row level security;
alter table public.flashcard_game_sessions enable row level security;
alter table public.flashcard_game_events enable row level security;

drop policy if exists "Authenticated read active flashcard decks" on public.flashcard_decks;
create policy "Authenticated read active flashcard decks" on public.flashcard_decks
  for select to authenticated
  using (is_active = true or public.is_admin());

drop policy if exists "Admins manage flashcard decks" on public.flashcard_decks;
create policy "Admins manage flashcard decks" on public.flashcard_decks
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Authenticated read flashcard deck items" on public.flashcard_deck_items;
create policy "Authenticated read flashcard deck items" on public.flashcard_deck_items
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.flashcard_decks deck
      where deck.id = flashcard_deck_items.deck_id
        and deck.is_active = true
    )
  );

drop policy if exists "Admins manage flashcard deck items" on public.flashcard_deck_items;
create policy "Admins manage flashcard deck items" on public.flashcard_deck_items
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students read own flashcard progress" on public.user_flashcard_progress;
create policy "Students read own flashcard progress" on public.user_flashcard_progress
  for select using (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Students insert own flashcard progress" on public.user_flashcard_progress;
create policy "Students insert own flashcard progress" on public.user_flashcard_progress
  for insert with check (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Students update own flashcard progress" on public.user_flashcard_progress;
create policy "Students update own flashcard progress" on public.user_flashcard_progress
  for update using (
    auth.uid() = user_id
    or public.is_admin()
  )
  with check (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Admins manage flashcard progress" on public.user_flashcard_progress;
create policy "Admins manage flashcard progress" on public.user_flashcard_progress
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students read own flashcard game sessions" on public.flashcard_game_sessions;
create policy "Students read own flashcard game sessions" on public.flashcard_game_sessions
  for select using (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Students insert own flashcard game sessions" on public.flashcard_game_sessions;
create policy "Students insert own flashcard game sessions" on public.flashcard_game_sessions
  for insert with check (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Students update own flashcard game sessions" on public.flashcard_game_sessions;
create policy "Students update own flashcard game sessions" on public.flashcard_game_sessions
  for update using (
    auth.uid() = user_id
    or public.is_admin()
  )
  with check (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Admins manage flashcard game sessions" on public.flashcard_game_sessions;
create policy "Admins manage flashcard game sessions" on public.flashcard_game_sessions
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students read own flashcard game events" on public.flashcard_game_events;
create policy "Students read own flashcard game events" on public.flashcard_game_events
  for select using (
    public.is_admin()
    or exists (
      select 1
      from public.flashcard_game_sessions session_row
      where session_row.id = flashcard_game_events.game_session_id
        and session_row.user_id = auth.uid()
    )
  );

drop policy if exists "Students insert own flashcard game events" on public.flashcard_game_events;
create policy "Students insert own flashcard game events" on public.flashcard_game_events
  for insert with check (
    public.is_admin()
    or exists (
      select 1
      from public.flashcard_game_sessions session_row
      where session_row.id = flashcard_game_events.game_session_id
        and session_row.user_id = auth.uid()
    )
  );

drop policy if exists "Admins manage flashcard game events" on public.flashcard_game_events;
create policy "Admins manage flashcard game events" on public.flashcard_game_events
  for all using (public.is_admin())
  with check (public.is_admin());

commit;

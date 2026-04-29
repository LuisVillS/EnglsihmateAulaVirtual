begin;

alter table public.flashcard_decks
  add column if not exists owner_user_id uuid references public.profiles (id) on delete cascade;

create index if not exists flashcard_decks_owner_idx
  on public.flashcard_decks (owner_user_id, updated_at desc)
  where owner_user_id is not null;

alter table public.flashcard_decks
  drop constraint if exists flashcard_decks_source_type_check;

alter table public.flashcard_decks
  add constraint flashcard_decks_source_type_check
    check (source_type in ('system', 'session', 'template_session', 'theme', 'weakness', 'student'));

alter table public.flashcard_game_sessions
  drop constraint if exists flashcard_game_sessions_source_type_check;

alter table public.flashcard_game_sessions
  add constraint flashcard_game_sessions_source_type_check
    check (source_type in ('system', 'session', 'template_session', 'theme', 'weakness', 'student'));

drop policy if exists "Authenticated read active flashcard decks" on public.flashcard_decks;
create policy "Authenticated read active flashcard decks" on public.flashcard_decks
  for select to authenticated
  using (
    public.is_admin()
    or (is_active = true and owner_user_id is null)
    or owner_user_id = auth.uid()
  );

drop policy if exists "Admins manage flashcard decks" on public.flashcard_decks;
create policy "Admins manage flashcard decks" on public.flashcard_decks
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students manage own flashcard decks" on public.flashcard_decks;
create policy "Students manage own flashcard decks" on public.flashcard_decks
  for all to authenticated
  using (
    owner_user_id = auth.uid()
    and source_type = 'student'
    and is_system = false
  )
  with check (
    owner_user_id = auth.uid()
    and source_type = 'student'
    and is_system = false
  );

drop policy if exists "Authenticated read flashcard deck items" on public.flashcard_deck_items;
create policy "Authenticated read flashcard deck items" on public.flashcard_deck_items
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.flashcard_decks deck
      where deck.id = flashcard_deck_items.deck_id
        and (
          (deck.is_active = true and deck.owner_user_id is null)
          or deck.owner_user_id = auth.uid()
        )
    )
  );

drop policy if exists "Admins manage flashcard deck items" on public.flashcard_deck_items;
create policy "Admins manage flashcard deck items" on public.flashcard_deck_items
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students manage own flashcard deck items" on public.flashcard_deck_items;
create policy "Students manage own flashcard deck items" on public.flashcard_deck_items
  for all to authenticated
  using (
    exists (
      select 1
      from public.flashcard_decks deck
      where deck.id = flashcard_deck_items.deck_id
        and deck.owner_user_id = auth.uid()
        and deck.source_type = 'student'
        and deck.is_system = false
    )
  )
  with check (
    exists (
      select 1
      from public.flashcard_decks deck
      where deck.id = flashcard_deck_items.deck_id
        and deck.owner_user_id = auth.uid()
        and deck.source_type = 'student'
        and deck.is_system = false
    )
  );

commit;

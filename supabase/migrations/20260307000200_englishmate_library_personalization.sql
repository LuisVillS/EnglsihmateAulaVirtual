begin;

create table if not exists public.library_book_user_state (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  library_book_id uuid not null references public.library_books (id) on delete cascade,
  in_my_library boolean not null default false,
  started_reading boolean not null default false,
  completed boolean not null default false,
  last_page_number integer,
  last_location text,
  progress_percent numeric,
  last_opened_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, library_book_id)
);

create index if not exists library_book_user_state_user_idx
  on public.library_book_user_state (user_id, last_opened_at desc nulls last);

create index if not exists library_book_user_state_book_idx
  on public.library_book_user_state (library_book_id, user_id);

create index if not exists library_book_user_state_library_idx
  on public.library_book_user_state (user_id, in_my_library, completed, started_reading);

create table if not exists public.library_book_notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  library_book_id uuid not null references public.library_books (id) on delete cascade,
  page_number integer,
  selected_text text,
  note_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_book_notes_user_idx
  on public.library_book_notes (user_id, library_book_id, updated_at desc);

create index if not exists library_book_notes_book_idx
  on public.library_book_notes (library_book_id, user_id);

alter table public.library_book_user_state enable row level security;
alter table public.library_book_notes enable row level security;

drop policy if exists "Students read own library state" on public.library_book_user_state;
create policy "Students read own library state" on public.library_book_user_state
  for select to authenticated
  using (public.is_admin() or auth.uid() = user_id);

drop policy if exists "Students manage own library state" on public.library_book_user_state;
create policy "Students manage own library state" on public.library_book_user_state
  for all to authenticated
  using (public.is_admin() or auth.uid() = user_id)
  with check (public.is_admin() or auth.uid() = user_id);

drop policy if exists "Students read own library notes" on public.library_book_notes;
create policy "Students read own library notes" on public.library_book_notes
  for select to authenticated
  using (public.is_admin() or auth.uid() = user_id);

drop policy if exists "Students manage own library notes" on public.library_book_notes;
create policy "Students manage own library notes" on public.library_book_notes
  for all to authenticated
  using (public.is_admin() or auth.uid() = user_id)
  with check (public.is_admin() or auth.uid() = user_id);

commit;

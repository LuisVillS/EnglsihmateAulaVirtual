alter table public.template_session_items
  drop constraint if exists template_session_items_type_check;

alter table public.template_session_items
  add constraint template_session_items_type_check
    check (type in ('slides', 'link', 'file', 'exercise', 'video', 'flashcards'));

alter table public.session_items
  drop constraint if exists session_items_type_check;

alter table public.session_items
  add constraint session_items_type_check
    check (type in ('file', 'exercise', 'recording', 'live_link', 'link', 'note', 'slides', 'video', 'flashcards'));

create table if not exists public.session_flashcards (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.course_sessions (id) on delete cascade,
  word text not null,
  meaning text not null,
  image_url text not null,
  card_order integer not null default 1,
  accepted_answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.session_flashcards
  add column if not exists image_url text;

alter table public.session_flashcards
  add column if not exists card_order integer not null default 1;

alter table public.session_flashcards
  add column if not exists accepted_answers jsonb not null default '[]'::jsonb;

alter table public.session_flashcards
  add column if not exists updated_at timestamptz not null default now();

update public.session_flashcards
set accepted_answers = '[]'::jsonb
where accepted_answers is null
   or jsonb_typeof(accepted_answers) <> 'array';

alter table public.session_flashcards
  drop constraint if exists session_flashcards_accepted_answers_array_check;

alter table public.session_flashcards
  add constraint session_flashcards_accepted_answers_array_check
    check (jsonb_typeof(accepted_answers) = 'array');

create index if not exists session_flashcards_session_idx
  on public.session_flashcards (session_id, card_order, created_at);

create table if not exists public.template_session_flashcards (
  id uuid primary key default uuid_generate_v4(),
  template_session_id uuid not null references public.template_sessions (id) on delete cascade,
  word text not null,
  meaning text not null,
  image_url text not null,
  card_order integer not null default 1,
  accepted_answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.template_session_flashcards
  add column if not exists image_url text;

alter table public.template_session_flashcards
  add column if not exists card_order integer not null default 1;

alter table public.template_session_flashcards
  add column if not exists accepted_answers jsonb not null default '[]'::jsonb;

alter table public.template_session_flashcards
  add column if not exists updated_at timestamptz not null default now();

update public.template_session_flashcards
set accepted_answers = '[]'::jsonb
where accepted_answers is null
   or jsonb_typeof(accepted_answers) <> 'array';

alter table public.template_session_flashcards
  drop constraint if exists template_session_flashcards_accepted_answers_array_check;

alter table public.template_session_flashcards
  add constraint template_session_flashcards_accepted_answers_array_check
    check (jsonb_typeof(accepted_answers) = 'array');

create index if not exists template_session_flashcards_session_idx
  on public.template_session_flashcards (template_session_id, card_order, created_at);

alter table public.session_flashcards enable row level security;
alter table public.template_session_flashcards enable row level security;

drop policy if exists "Students read session flashcards" on public.session_flashcards;
create policy "Students read session flashcards" on public.session_flashcards
  for select using (
    public.is_admin()
    or exists (
      select 1
      from public.course_sessions cs
      join public.profiles p on p.commission_id = cs.commission_id
      where cs.id = session_flashcards.session_id
        and p.id = auth.uid()
    )
  );

drop policy if exists "Admins manage session flashcards" on public.session_flashcards;
create policy "Admins manage session flashcards" on public.session_flashcards
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage template session flashcards" on public.template_session_flashcards;
create policy "Admins manage template session flashcards" on public.template_session_flashcards
  for all using (public.is_admin()) with check (public.is_admin());

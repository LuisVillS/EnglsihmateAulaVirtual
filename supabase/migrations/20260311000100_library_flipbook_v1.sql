begin;

create table if not exists public.library_flipbook_layout_profiles (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  page_width integer not null,
  page_height integer not null,
  gutter integer not null default 32,
  padding_top integer not null default 56,
  padding_right integer not null default 56,
  padding_bottom integer not null default 64,
  padding_left integer not null default 56,
  font_family text not null,
  font_size integer not null,
  line_height numeric not null,
  paragraph_spacing integer not null default 18,
  generator_version text not null default 'flipbook-v1',
  active boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_flipbook_manifests (
  id uuid primary key default uuid_generate_v4(),
  library_book_id uuid not null references public.library_books (id) on delete cascade,
  layout_profile_id uuid not null references public.library_flipbook_layout_profiles (id) on delete cascade,
  source_fingerprint text not null,
  source_name text,
  source_hash text not null,
  manifest_version text not null default 'flipbook-v1',
  metadata_json jsonb not null default '{}'::jsonb,
  toc_json jsonb not null default '[]'::jsonb,
  anchor_map_json jsonb not null default '{}'::jsonb,
  page_count integer not null default 0,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (library_book_id, layout_profile_id, source_fingerprint)
);

create table if not exists public.library_flipbook_pages (
  id uuid primary key default uuid_generate_v4(),
  manifest_id uuid not null references public.library_flipbook_manifests (id) on delete cascade,
  page_id text not null,
  page_index integer not null,
  layout_profile_id uuid not null references public.library_flipbook_layout_profiles (id) on delete cascade,
  chapter_id text,
  section_id text,
  start_locator text,
  end_locator text,
  html text not null,
  text_segments_json jsonb not null default '[]'::jsonb,
  flags_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manifest_id, page_index),
  unique (manifest_id, page_id)
);

create table if not exists public.library_flipbook_user_state (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  library_book_id uuid not null references public.library_books (id) on delete cascade,
  layout_profile_id uuid references public.library_flipbook_layout_profiles (id) on delete set null,
  manifest_id uuid references public.library_flipbook_manifests (id) on delete set null,
  current_page_id text,
  current_page_index integer,
  saved_page_id text,
  saved_page_index integer,
  progress_percent numeric,
  chapter_id text,
  started_reading boolean not null default false,
  completed boolean not null default false,
  last_opened_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, library_book_id)
);

create index if not exists library_flipbook_manifests_book_idx
  on public.library_flipbook_manifests (library_book_id, generated_at desc);

create index if not exists library_flipbook_pages_manifest_idx
  on public.library_flipbook_pages (manifest_id, page_index);

create index if not exists library_flipbook_user_state_user_idx
  on public.library_flipbook_user_state (user_id, updated_at desc);

create index if not exists library_flipbook_user_state_book_idx
  on public.library_flipbook_user_state (library_book_id, user_id);

alter table public.library_flipbook_layout_profiles enable row level security;
alter table public.library_flipbook_manifests enable row level security;
alter table public.library_flipbook_pages enable row level security;
alter table public.library_flipbook_user_state enable row level security;

drop policy if exists "Authenticated read flipbook layout profiles" on public.library_flipbook_layout_profiles;
create policy "Authenticated read flipbook layout profiles" on public.library_flipbook_layout_profiles
  for select to authenticated
  using (active = true or public.is_admin());

drop policy if exists "Admins manage flipbook layout profiles" on public.library_flipbook_layout_profiles;
create policy "Admins manage flipbook layout profiles" on public.library_flipbook_layout_profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Authenticated read flipbook manifests" on public.library_flipbook_manifests;
create policy "Authenticated read flipbook manifests" on public.library_flipbook_manifests
  for select to authenticated
  using (public.is_admin() or exists (
    select 1
    from public.library_books b
    where b.id = library_book_id
      and b.publish_status = 'published'
      and b.active = true
      and b.readable_online = true
      and lower(coalesce(b.language_code, '')) = 'eng'
  ));

drop policy if exists "Authenticated manage flipbook manifests" on public.library_flipbook_manifests;
create policy "Authenticated manage flipbook manifests" on public.library_flipbook_manifests
  for all to authenticated
  using (public.is_admin() or exists (
    select 1
    from public.library_books b
    where b.id = library_book_id
      and b.publish_status = 'published'
      and b.active = true
      and b.readable_online = true
      and lower(coalesce(b.language_code, '')) = 'eng'
  ))
  with check (public.is_admin() or exists (
    select 1
    from public.library_books b
    where b.id = library_book_id
      and b.publish_status = 'published'
      and b.active = true
      and b.readable_online = true
      and lower(coalesce(b.language_code, '')) = 'eng'
  ));

drop policy if exists "Authenticated read flipbook pages" on public.library_flipbook_pages;
create policy "Authenticated read flipbook pages" on public.library_flipbook_pages
  for select to authenticated
  using (public.is_admin() or exists (
    select 1
    from public.library_flipbook_manifests m
    join public.library_books b on b.id = m.library_book_id
    where m.id = manifest_id
      and b.publish_status = 'published'
      and b.active = true
      and b.readable_online = true
      and lower(coalesce(b.language_code, '')) = 'eng'
  ));

drop policy if exists "Authenticated manage flipbook pages" on public.library_flipbook_pages;
create policy "Authenticated manage flipbook pages" on public.library_flipbook_pages
  for all to authenticated
  using (public.is_admin() or exists (
    select 1
    from public.library_flipbook_manifests m
    join public.library_books b on b.id = m.library_book_id
    where m.id = manifest_id
      and b.publish_status = 'published'
      and b.active = true
      and b.readable_online = true
      and lower(coalesce(b.language_code, '')) = 'eng'
  ))
  with check (public.is_admin() or exists (
    select 1
    from public.library_flipbook_manifests m
    join public.library_books b on b.id = m.library_book_id
    where m.id = manifest_id
      and b.publish_status = 'published'
      and b.active = true
      and b.readable_online = true
      and lower(coalesce(b.language_code, '')) = 'eng'
  ));

drop policy if exists "Students read own flipbook state" on public.library_flipbook_user_state;
create policy "Students read own flipbook state" on public.library_flipbook_user_state
  for select to authenticated
  using (public.is_admin() or auth.uid() = user_id);

drop policy if exists "Students manage own flipbook state" on public.library_flipbook_user_state;
create policy "Students manage own flipbook state" on public.library_flipbook_user_state
  for all to authenticated
  using (public.is_admin() or auth.uid() = user_id)
  with check (public.is_admin() or auth.uid() = user_id);

insert into public.library_flipbook_layout_profiles (
  slug,
  name,
  page_width,
  page_height,
  gutter,
  padding_top,
  padding_right,
  padding_bottom,
  padding_left,
  font_family,
  font_size,
  line_height,
  paragraph_spacing,
  generator_version,
  config_json
)
values (
  'canonical-v1',
  'Canonical Flipbook',
  860,
  1180,
  36,
  72,
  64,
  80,
  64,
  'Georgia, Times New Roman, serif',
  19,
  1.6,
  18,
  'flipbook-v1',
  jsonb_build_object(
    'maxPageUnits', 92,
    'headingBaseUnits', 12,
    'paragraphBaseUnits', 8,
    'imageBaseUnits', 22,
    'sentenceChunkSize', 420
  )
)
on conflict (slug) do nothing;

commit;

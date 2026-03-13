begin;

create table if not exists public.library_books (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  title text not null,
  subtitle text,
  normalized_title text not null,
  normalized_author text,
  description text,
  author_display text,
  authors_json jsonb,
  language_code text not null,
  cefr_level text,
  category text,
  tags text[] not null default '{}'::text[],
  cover_url text,
  thumbnail_url text,
  source_name text not null default 'openlibrary',
  openlibrary_work_key text,
  openlibrary_edition_key text,
  internet_archive_identifier text,
  first_publish_year int,
  ebook_access text,
  has_fulltext boolean not null default false,
  readable_online boolean not null default false,
  preview_only boolean not null default false,
  borrowable boolean not null default false,
  reader_url text,
  embed_url text,
  publish_status text not null default 'published',
  featured boolean not null default false,
  active boolean not null default true,
  duplicate_group_key text,
  source_payload jsonb,
  metadata_verified_at timestamptz,
  last_embed_check_at timestamptz,
  source_sync_status text not null default 'pending',
  source_sync_error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.library_books
  drop constraint if exists library_books_publish_status_check;

alter table public.library_books
  add constraint library_books_publish_status_check
    check (publish_status in ('draft', 'published', 'archived'));

alter table public.library_books
  drop constraint if exists library_books_cefr_level_check;

alter table public.library_books
  add constraint library_books_cefr_level_check
    check (cefr_level is null or cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1'));

alter table public.library_books
  drop constraint if exists library_books_source_sync_status_check;

alter table public.library_books
  add constraint library_books_source_sync_status_check
    check (source_sync_status in ('pending', 'ok', 'stale', 'error'));

create unique index if not exists library_books_slug_idx
  on public.library_books (slug);

create index if not exists library_books_normalized_title_idx
  on public.library_books (normalized_title);

create index if not exists library_books_language_idx
  on public.library_books (language_code);

create index if not exists library_books_cefr_idx
  on public.library_books (cefr_level);

create index if not exists library_books_active_idx
  on public.library_books (active);

create index if not exists library_books_readable_online_idx
  on public.library_books (readable_online);

create index if not exists library_books_work_key_idx
  on public.library_books (openlibrary_work_key);

create index if not exists library_books_archive_identifier_idx
  on public.library_books (internet_archive_identifier);

create index if not exists library_books_publish_status_idx
  on public.library_books (publish_status, featured, published_at desc nulls last);

create index if not exists library_books_duplicate_group_idx
  on public.library_books (duplicate_group_key);

create index if not exists library_books_author_idx
  on public.library_books (normalized_author);

create index if not exists library_books_category_idx
  on public.library_books (category);

create index if not exists library_books_tags_gin_idx
  on public.library_books using gin (tags);

create table if not exists public.library_book_staging (
  id uuid primary key default uuid_generate_v4(),
  raw_title text,
  normalized_title text,
  normalized_author text,
  author_display text,
  language_code text,
  cefr_level text,
  category text,
  tags text[] not null default '{}'::text[],
  openlibrary_work_key text,
  openlibrary_edition_key text,
  internet_archive_identifier text,
  first_publish_year int,
  ebook_access text,
  has_fulltext boolean not null default false,
  readable_online boolean not null default false,
  preview_only boolean not null default false,
  borrowable boolean not null default false,
  cover_url text,
  thumbnail_url text,
  reader_url text,
  embed_url text,
  source_payload jsonb,
  ingestion_status text not null default 'pending',
  duplicate_group_key text,
  duplicate_of_book_id uuid references public.library_books (id) on delete set null,
  rejection_reason text,
  metadata_score numeric,
  metadata_verified_at timestamptz,
  last_embed_check_at timestamptz,
  source_sync_status text not null default 'pending',
  source_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.library_book_staging
  drop constraint if exists library_book_staging_ingestion_status_check;

alter table public.library_book_staging
  add constraint library_book_staging_ingestion_status_check
    check (ingestion_status in ('pending', 'needs_review', 'approved', 'duplicate', 'rejected', 'published'));

alter table public.library_book_staging
  drop constraint if exists library_book_staging_cefr_level_check;

alter table public.library_book_staging
  add constraint library_book_staging_cefr_level_check
    check (cefr_level is null or cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1'));

alter table public.library_book_staging
  drop constraint if exists library_book_staging_source_sync_status_check;

alter table public.library_book_staging
  add constraint library_book_staging_source_sync_status_check
    check (source_sync_status in ('pending', 'ok', 'stale', 'error'));

create index if not exists library_book_staging_status_idx
  on public.library_book_staging (ingestion_status, created_at desc);

create index if not exists library_book_staging_work_key_idx
  on public.library_book_staging (openlibrary_work_key);

create index if not exists library_book_staging_archive_identifier_idx
  on public.library_book_staging (internet_archive_identifier);

create index if not exists library_book_staging_duplicate_group_idx
  on public.library_book_staging (duplicate_group_key);

create index if not exists library_book_staging_duplicate_of_idx
  on public.library_book_staging (duplicate_of_book_id);

create index if not exists library_book_staging_author_idx
  on public.library_book_staging (normalized_author);

create index if not exists library_book_staging_tags_gin_idx
  on public.library_book_staging using gin (tags);

create table if not exists public.library_book_aliases (
  id uuid primary key default uuid_generate_v4(),
  library_book_id uuid not null references public.library_books (id) on delete cascade,
  alias_type text not null,
  alias_value text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists library_book_aliases_type_value_idx
  on public.library_book_aliases (alias_type, alias_value);

create index if not exists library_book_aliases_book_idx
  on public.library_book_aliases (library_book_id, alias_type);

create table if not exists public.library_book_reads (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  library_book_id uuid not null references public.library_books (id) on delete cascade,
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  progress_json jsonb
);

create index if not exists library_book_reads_user_idx
  on public.library_book_reads (user_id, last_seen_at desc);

create index if not exists library_book_reads_book_idx
  on public.library_book_reads (library_book_id, opened_at desc);

create table if not exists public.library_book_favorites (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  library_book_id uuid not null references public.library_books (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, library_book_id)
);

create index if not exists library_book_favorites_user_idx
  on public.library_book_favorites (user_id, created_at desc);

create index if not exists library_book_favorites_book_idx
  on public.library_book_favorites (library_book_id, created_at desc);

create table if not exists public.library_import_jobs (
  id uuid primary key default uuid_generate_v4(),
  source_name text not null default 'openlibrary',
  query text,
  status text not null default 'pending',
  imported_count int not null default 0,
  rejected_count int not null default 0,
  notes text,
  payload jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.library_import_jobs
  drop constraint if exists library_import_jobs_status_check;

alter table public.library_import_jobs
  add constraint library_import_jobs_status_check
    check (status in ('pending', 'running', 'completed', 'failed'));

create index if not exists library_import_jobs_status_idx
  on public.library_import_jobs (status, started_at desc);

alter table public.library_books enable row level security;
alter table public.library_book_staging enable row level security;
alter table public.library_book_aliases enable row level security;
alter table public.library_book_reads enable row level security;
alter table public.library_book_favorites enable row level security;
alter table public.library_import_jobs enable row level security;

drop policy if exists "Authenticated read published library books" on public.library_books;
create policy "Authenticated read published library books" on public.library_books
  for select to authenticated
  using (
    public.is_admin()
    or (
      publish_status = 'published'
      and active = true
      and readable_online = true
      and lower(coalesce(language_code, '')) = 'eng'
    )
  );

drop policy if exists "Admins manage library books" on public.library_books;
create policy "Admins manage library books" on public.library_books
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins manage library staging" on public.library_book_staging;
create policy "Admins manage library staging" on public.library_book_staging
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins manage library aliases" on public.library_book_aliases;
create policy "Admins manage library aliases" on public.library_book_aliases
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students read own library reads" on public.library_book_reads;
create policy "Students read own library reads" on public.library_book_reads
  for select to authenticated
  using (public.is_admin() or auth.uid() = user_id);

drop policy if exists "Students create own library reads" on public.library_book_reads;
create policy "Students create own library reads" on public.library_book_reads
  for insert to authenticated
  with check (public.is_admin() or auth.uid() = user_id);

drop policy if exists "Students update own library reads" on public.library_book_reads;
create policy "Students update own library reads" on public.library_book_reads
  for update to authenticated
  using (public.is_admin() or auth.uid() = user_id)
  with check (public.is_admin() or auth.uid() = user_id);

drop policy if exists "Students read own library favorites" on public.library_book_favorites;
create policy "Students read own library favorites" on public.library_book_favorites
  for select to authenticated
  using (public.is_admin() or auth.uid() = user_id);

drop policy if exists "Students manage own library favorites" on public.library_book_favorites;
create policy "Students manage own library favorites" on public.library_book_favorites
  for all to authenticated
  using (public.is_admin() or auth.uid() = user_id)
  with check (public.is_admin() or auth.uid() = user_id);

drop policy if exists "Admins manage library import jobs" on public.library_import_jobs;
create policy "Admins manage library import jobs" on public.library_import_jobs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;

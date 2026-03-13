begin;

create table if not exists public.library_book_sources (
  id uuid primary key default uuid_generate_v4(),
  library_book_id uuid not null references public.library_books (id) on delete cascade,
  source_name text not null,
  source_role text not null default 'supplemental',
  source_format text not null default 'external_link',
  source_status text not null default 'pending',
  source_identifier text,
  source_url text,
  reader_url text,
  embed_url text,
  download_url text,
  cover_url text,
  thumbnail_url text,
  language_code text,
  readable boolean not null default false,
  is_preferred_read boolean not null default false,
  is_preferred_metadata boolean not null default false,
  availability_json jsonb,
  metadata_json jsonb,
  cache_status text not null default 'not_cached',
  cache_key text,
  cache_content_type text,
  cache_etag text,
  cache_last_modified text,
  cache_bytes bigint,
  cache_checked_at timestamptz,
  cached_at timestamptz,
  cache_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.library_book_sources
  drop constraint if exists library_book_sources_source_role_check;

alter table public.library_book_sources
  add constraint library_book_sources_source_role_check
    check (source_role in ('metadata', 'read', 'audiobook', 'hybrid', 'supplemental'));

alter table public.library_book_sources
  drop constraint if exists library_book_sources_source_format_check;

alter table public.library_book_sources
  add constraint library_book_sources_source_format_check
    check (source_format in ('archive_embed', 'epub', 'external_audio', 'catalog_record', 'external_link'));

alter table public.library_book_sources
  drop constraint if exists library_book_sources_source_status_check;

alter table public.library_book_sources
  add constraint library_book_sources_source_status_check
    check (source_status in ('pending', 'active', 'not_found', 'disabled', 'error'));

alter table public.library_book_sources
  drop constraint if exists library_book_sources_cache_status_check;

alter table public.library_book_sources
  add constraint library_book_sources_cache_status_check
    check (cache_status in ('not_cached', 'fetching', 'ready', 'error'));

create unique index if not exists library_book_sources_book_name_role_idx
  on public.library_book_sources (library_book_id, source_name, source_role);

create index if not exists library_book_sources_book_idx
  on public.library_book_sources (library_book_id, source_status, source_name);

create index if not exists library_book_sources_identifier_idx
  on public.library_book_sources (source_name, source_identifier);

create index if not exists library_book_sources_cache_status_idx
  on public.library_book_sources (cache_status, cache_checked_at desc nulls last);

create unique index if not exists library_book_sources_preferred_read_idx
  on public.library_book_sources (library_book_id)
  where is_preferred_read = true and source_status = 'active';

create unique index if not exists library_book_sources_preferred_metadata_idx
  on public.library_book_sources (library_book_id)
  where is_preferred_metadata = true and source_status = 'active';

insert into public.library_book_sources (
  library_book_id,
  source_name,
  source_role,
  source_format,
  source_status,
  source_identifier,
  source_url,
  reader_url,
  embed_url,
  cover_url,
  thumbnail_url,
  language_code,
  readable,
  is_preferred_read,
  is_preferred_metadata,
  availability_json,
  metadata_json,
  created_at,
  updated_at
)
select
  b.id,
  'openlibrary',
  'hybrid',
  case
    when coalesce(b.embed_url, '') <> '' or coalesce(b.internet_archive_identifier, '') <> '' then 'archive_embed'
    else 'catalog_record'
  end,
  case
    when b.active = false or b.publish_status = 'archived' then 'disabled'
    else 'active'
  end,
  coalesce(nullif(b.openlibrary_edition_key, ''), nullif(b.openlibrary_work_key, ''), nullif(b.internet_archive_identifier, ''), b.slug),
  case
    when coalesce(b.openlibrary_work_key, '') <> '' then 'https://openlibrary.org/works/' || b.openlibrary_work_key
    when coalesce(b.openlibrary_edition_key, '') <> '' then 'https://openlibrary.org/books/' || b.openlibrary_edition_key
    else null
  end,
  b.reader_url,
  b.embed_url,
  b.cover_url,
  b.thumbnail_url,
  b.language_code,
  coalesce(b.readable_online, false),
  coalesce(b.readable_online, false),
  true,
  jsonb_build_object(
    'ebook_access', b.ebook_access,
    'has_fulltext', b.has_fulltext,
    'readable_online', b.readable_online,
    'preview_only', b.preview_only,
    'borrowable', b.borrowable
  ),
  jsonb_build_object(
    'openlibrary_work_key', b.openlibrary_work_key,
    'openlibrary_edition_key', b.openlibrary_edition_key,
    'source_name', b.source_name,
    'first_publish_year', b.first_publish_year
  ),
  b.created_at,
  b.updated_at
from public.library_books b
where not exists (
  select 1
  from public.library_book_sources s
  where s.library_book_id = b.id
    and s.source_name = 'openlibrary'
    and s.source_role = 'hybrid'
);

alter table public.library_book_sources enable row level security;

drop policy if exists "Authenticated read active library sources" on public.library_book_sources;
create policy "Authenticated read active library sources" on public.library_book_sources
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.library_books b
      where b.id = library_book_sources.library_book_id
        and b.publish_status = 'published'
        and b.active = true
    )
  );

drop policy if exists "Admins manage library book sources" on public.library_book_sources;
create policy "Admins manage library book sources" on public.library_book_sources
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;

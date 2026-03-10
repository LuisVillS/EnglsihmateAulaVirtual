# Library Metadata Migration: Open Library to Gutenberg

## Current Integration Points

- `KEEP BUT MODIFY`: `library_books`
  - Still the canonical catalog table.
  - New imports now set `source_name = 'gutenberg'`.
  - Existing Open Library columns remain for backward compatibility with older books.
- `KEEP BUT MODIFY`: `library_book_sources`
  - Still the canonical source/provider table.
  - New Gutenberg imports create a metadata source row with `source_name = 'gutenberg'`.
  - Manual EPUB sources remain unchanged and stay the preferred read source.
- `KEEP`: `library_book_aliases`
  - Still useful for duplicate management.
  - Alias generation now also supports generic metadata provider IDs.
- `KEEP`: `library_book_reads`
  - Reader analytics only. Not part of metadata migration.
- `KEEP`: `library_book_user_state`
  - Reading state only. Not part of metadata migration.
- `DEPRECATE`: `library_book_staging`
  - The main admin flow already bypasses staging.
  - Staging code still exists in the repo, so the table is not safe to drop yet.
- `SAFE TO DROP LATER`: `library_import_jobs`
  - No active runtime dependency in the current library workflow.
- `KEEP FOR BACKWARD COMPATIBILITY`: Open Library-specific columns on `library_books`
  - `openlibrary_work_key`
  - `openlibrary_edition_key`
  - `internet_archive_identifier`
  - `ebook_access`
  - `has_fulltext`
  - `readable_online`
  - `preview_only`
  - `borrowable`
  - `reader_url`
  - `embed_url`
  - These are still needed for legacy books that use Archive/Open Library fallback.

## Required Schema Change

The code migration does not require new tables or new columns.

The only required schema adjustment is to move the default metadata provider from Open Library to Gutenberg for newly inserted catalog/import-job rows that omit `source_name`.

```sql
begin;

alter table if exists public.library_books
  alter column source_name set default 'gutenberg';

alter table if exists public.library_import_jobs
  alter column source_name set default 'gutenberg';

commit;
```

## Cleanup SQL After Verification

Do not run this yet on production. These are later cleanup candidates after all legacy Open Library books have either been migrated or archived and after the remaining staging code is removed.

### Safe later

```sql
begin;

drop table if exists public.library_import_jobs;

commit;
```

### Drop after code removal and data review

```sql
begin;

drop table if exists public.library_book_staging;

commit;
```

### Open Library-specific columns to review later

Do not drop these until there are no legacy Open Library-backed books left and the Archive fallback is no longer needed.

```sql
-- library_books
-- openlibrary_work_key
-- openlibrary_edition_key
-- internet_archive_identifier
-- ebook_access
-- has_fulltext
-- preview_only
-- borrowable
-- reader_url
-- embed_url
```

## Final Architecture

- Metadata provider for new imports: Gutenberg API
- Reading source priority: uploaded EPUB first, unchanged
- Legacy fallback: existing Open Library / Archive books still work
- Student catalog / EPUB reader: unchanged by this migration

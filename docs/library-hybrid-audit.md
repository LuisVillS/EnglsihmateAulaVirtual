# EnglishMate Library Hybrid Source Audit

## 1. Current Library Architecture

- Student pages already existed and were reused:
  - `/app/library`
  - `/app/library/book/[slug]`
  - `/app/library/read/[slug]`
- Admin pages already existed and were reused:
  - `/admin/library`
  - `/admin/library/import`
  - `/admin/library/staging`
  - `/admin/library/duplicates`
  - `/admin/library/books/[id]`
- The canonical catalog before this change was `library_books`.
- The previous implementation assumed one logical book row with one primary readable source baked into the same row.
- Open Library plus Internet Archive metadata lived directly on `library_books`.

## 2. Current Reading Experience Architecture

- Before this update, the reader was not first-party.
- `/app/library/read/[slug]` was an EnglishMate page shell around an Internet Archive BookReader iframe.
- The current bookmark UI already existed and was preserved.
- Background auto-progress infrastructure partially existed in API form, but the reader UI was not actually calling it.
- Result: manual bookmark saving worked, but auto resume was weak and depended on third-party iframe behavior.

## 3. Current Database Tables

### KEEP BUT MODIFY

- `library_books`
  - Canonical curated catalog.
  - Actively used by student pages, admin pages, search/filter endpoints, and reader routes.
  - Compatible with the new model if it stays the canonical book row and linked sources move into a child table.

- `library_book_staging`
  - Admin import/review queue for Open Library ingestion.
  - Still used by admin import, publish, and dedupe flows.
  - Compatible as the staging layer for Open Library discovery.

- `library_book_user_state`
  - Per-user reading state and My Library state.
  - Actively used for bookmarks, reading state, and My Library.
  - It now remains the source of truth for:
    - manual bookmarks
    - auto resume location
    - progress percent
    - started/completed state

### KEEP

- `library_book_aliases`
  - Used for dedupe and canonical record alias tracking.
  - Still valid in the hybrid model.

- `library_book_reads`
  - Used for open/read analytics.
  - Still valid and independent from the source model.

### KEEP FOR BACKWARD COMPATIBILITY

- Legacy Open Library / Archive columns on `library_books`
  - `openlibrary_work_key`
  - `openlibrary_edition_key`
  - `internet_archive_identifier`
  - `reader_url`
  - `embed_url`
  - `source_payload`
  - These are still referenced by the existing admin flow and act as a safe fallback while the child source table is introduced.

- `library_book_favorites`
  - Not the primary saved-library model anymore.
  - Still referenced by old code paths and the `/favorite` API route.
  - Not safe to drop yet.

### UNKNOWN / REQUIRES CAUTION

- `library_book_notes`
  - Schema exists.
  - No active feature depth yet.
  - Not safe to drop because it is user-data-shaped and intended for future notes.

### UNUSED / CANDIDATE FOR DROP

- `library_import_jobs`
  - No active code references were found in the current app flow.
  - Candidate for cleanup, but still separate from the required rollout SQL.

## 4. Current Open Library Integration Points

- `lib/library/openlibrary.js`
  - Search API integration
  - normalization
  - work/edition hydration
- `app/api/admin/library/search-openlibrary/route.js`
  - admin search endpoint
- `lib/library/admin.js`
  - import to staging
  - publish from staging
  - recheck against Open Library

Open Library remains discovery-first in the updated design.

## 5. Current Progress / Bookmark Implementation

- Manual bookmark fields:
  - `saved_page_number`
  - `saved_page_code`
- Auto progress fields already existed:
  - `last_page_number`
  - `last_location`
  - `progress_percent`
- Previous limitation:
  - Archive iframe state was not reliable enough to drive resume for every title.
- Updated model:
  - manual bookmarks remain manual and intentional
  - Standard Ebooks EPUB reading now auto-saves `last_location` and `progress_percent`
  - manual bookmarks still coexist independently

## 6. Current Storage / Cache Implementation

- Before this update, library books did not use file caching.
- The project already had reusable Cloudflare R2 infrastructure in `lib/r2.js`.
- This update reuses that existing infrastructure for lazy Standard Ebooks EPUB caching.

## 7. Risks / Conflicts In The Previous Model

- One-book-one-source assumption made hybrid source reuse difficult.
- Reader ownership was external for readable books.
- Archive embed resume was inherently inconsistent.
- Standard Ebooks cannot be iframe-embedded as the main reader because it requires a first-party EPUB flow.

## 8. Target Architecture

- `library_books` stays the canonical logical book record.
- New child table: `library_book_sources`
  - one canonical book
  - many source records
  - source-specific metadata
  - preferred read source flag
  - preferred metadata source flag
  - lazy cache metadata for EPUB assets
- Open Library remains:
  - discovery
  - cover/metadata
  - broad readable fallback via Archive where needed
- Standard Ebooks becomes:
  - preferred first-party read source where matched
  - same-origin EPUB asset
  - lazy cached to R2

## 9. New Schema

### Added

- `library_book_sources`
  - child table linked to `library_books`
  - supports `openlibrary`, `standard_ebooks`, and future `audiobook`/external rows
  - tracks preferred read source and preferred metadata source
  - tracks cache metadata for Standard Ebooks EPUBs

### Preserved

- `library_books`
- `library_book_staging`
- `library_book_aliases`
- `library_book_reads`
- `library_book_user_state`
- `library_book_notes`

### Required Migration

- [`20260308_library_hybrid_sources.sql`](/c:/Users/luise/OneDrive/Escritorio/EnglishmateApp/supabase/migrations/20260308_library_hybrid_sources.sql)

What it does:

- creates `library_book_sources`
- adds constraints and indexes
- backfills existing Open Library rows from `library_books`
- enables RLS and adds source policies

## 10. Data Migration Strategy

### Immediate

- Existing canonical books remain in `library_books`.
- The migration backfills a linked Open Library source row for every existing book.

### Runtime / Incremental

- On publish from staging:
  - Open Library source row is synced
  - Standard Ebooks matching runs
  - matched Standard Ebooks source becomes preferred read source
- On admin recheck:
  - Open Library source refresh runs
  - Standard Ebooks match refresh runs
- On student read:
  - if a Standard Ebooks source row is missing for a book, the system can lazily create it once and then reuse DB state

### Progress Preservation

- Existing `library_book_user_state` rows are preserved.
- Manual bookmarks remain intact.
- Standard Ebooks auto-resume now writes into the existing `last_location` and `progress_percent` fields.

## 11. Cleanup Plan

### Safe To Keep Now

- `library_books`
- `library_book_staging`
- `library_book_aliases`
- `library_book_reads`
- `library_book_user_state`
- `library_book_notes`
- Open Library columns on `library_books`

### Candidate For Drop Later

- `library_import_jobs`
  - no active code path found
  - validate in staging first, then drop separately

### Drop After Code Removal

- `library_book_favorites`
  - only after:
    - old `/favorite` route is removed
    - old favorite UI code is removed
    - no clients depend on it

### Do Not Drop Yet

- Archive/Open Library columns on `library_books`
  - still used as compatibility fallback
  - still useful for read fallback and existing admin flows

## 12. Optional Cleanup SQL After Verification

These are not part of the required rollout.

### Candidate: `library_import_jobs`

```sql
begin;
drop table if exists public.library_import_jobs cascade;
commit;
```

### Candidate Later: `library_book_favorites`

Run only after removing old code that still references it.

```sql
begin;
drop table if exists public.library_book_favorites cascade;
commit;
```

## 13. Reader Conclusion

- Old reader model: internal shell around a third-party Archive iframe.
- New first-party reader: Standard Ebooks EPUB flow inside the existing `/app/library/read/[slug]` page.
- Archive remains available as fallback where needed.

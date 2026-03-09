begin;

alter table if exists public.library_book_staging
  add column if not exists uploaded_epub_key text,
  add column if not exists uploaded_epub_file_name text,
  add column if not exists uploaded_epub_content_type text,
  add column if not exists uploaded_epub_bytes bigint;

create index if not exists library_book_staging_uploaded_epub_key_idx
  on public.library_book_staging (uploaded_epub_key)
  where uploaded_epub_key is not null;

commit;

begin;

alter table if exists public.library_book_staging
  add column if not exists standard_ebooks_url text;

commit;

begin;

alter table if exists public.library_books
  alter column source_name set default 'gutenberg';

alter table if exists public.library_import_jobs
  alter column source_name set default 'gutenberg';

commit;

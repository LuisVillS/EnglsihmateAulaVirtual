begin;

alter table if exists public.library_book_user_state
  add column if not exists saved_page_number integer;

create index if not exists library_book_user_state_saved_page_idx
  on public.library_book_user_state (user_id, saved_page_number);

commit;

begin;

alter table public.flashcard_decks
  add column if not exists cover_image_url text;

commit;

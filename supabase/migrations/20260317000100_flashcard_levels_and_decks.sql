begin;

alter table public.flashcards
  add column if not exists cefr_level text;

alter table public.flashcards
  add column if not exists theme_tag text;

update public.flashcards
set cefr_level = upper(trim(coalesce(cefr_level, '')))
where cefr_level is not null;

update public.flashcards
set theme_tag = lower(regexp_replace(trim(coalesce(theme_tag, '')), '\s+', '_', 'g'))
where theme_tag is not null;

alter table public.flashcards
  drop constraint if exists flashcards_cefr_level_check;

alter table public.flashcards
  add constraint flashcards_cefr_level_check
    check (
      cefr_level is null
      or cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')
    );

create index if not exists flashcards_cefr_theme_idx
  on public.flashcards (cefr_level, theme_tag, word);

create index if not exists flashcard_decks_cefr_theme_idx
  on public.flashcard_decks (cefr_level, theme_tag, is_active, updated_at desc);

commit;

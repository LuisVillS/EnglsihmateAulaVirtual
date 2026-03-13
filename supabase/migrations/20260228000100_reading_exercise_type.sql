begin;

alter table public.exercises
  drop constraint if exists exercises_type_check;

alter table public.exercises
  add constraint exercises_type_check
    check (type in ('scramble', 'audio_match', 'reading_exercise', 'image_match', 'pairs', 'cloze'));

commit;

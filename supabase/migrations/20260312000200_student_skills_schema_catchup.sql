alter table public.student_skill_overrides
  add column if not exists speaking_value_0_100 numeric(5, 2);

update public.student_skill_overrides
set speaking_value_0_100 = listening_value_0_100
where speaking_value_0_100 is null
  and listening_value_0_100 is not null;

alter table public.student_skill_overrides
  alter column listening_value_0_100 drop not null;

alter table public.student_skill_overrides
  drop constraint if exists student_skill_overrides_speaking_check;

alter table public.student_skill_overrides
  add constraint student_skill_overrides_speaking_check
    check (speaking_value_0_100 is null or (speaking_value_0_100 >= 0 and speaking_value_0_100 <= 100));

alter table public.student_level_history
  add column if not exists final_vocabulary_0_100 numeric(5, 2) not null default 0;

alter table public.student_level_history
  drop constraint if exists student_level_history_vocabulary_check;

alter table public.student_level_history
  add constraint student_level_history_vocabulary_check
    check (final_vocabulary_0_100 >= 0 and final_vocabulary_0_100 <= 100);

comment on column public.student_skill_overrides.speaking_value_0_100
  is 'Manual speaking score (0-100) set by admin/teacher.';

comment on column public.student_level_history.final_vocabulary_0_100
  is 'Vocabulary score snapshot (0-100) captured when the level is closed.';

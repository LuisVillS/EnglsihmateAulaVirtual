-- Exercise skill tags: remove "speaking" and allow "listening"
update public.exercises
set skill_tag = case
  when lower(coalesce(skill_tag, '')) = 'speaking' and type = 'audio_match' then 'listening'
  when lower(coalesce(skill_tag, '')) = 'speaking' then 'grammar'
  when lower(coalesce(skill_tag, '')) in ('grammar', 'reading', 'listening') then lower(skill_tag)
  else 'grammar'
end;

alter table public.exercises
  drop constraint if exists exercises_skill_tag_check;

alter table public.exercises
  add constraint exercises_skill_tag_check
    check (skill_tag in ('grammar', 'reading', 'listening'));

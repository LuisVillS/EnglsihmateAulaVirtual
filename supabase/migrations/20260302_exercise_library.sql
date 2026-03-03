begin;

create table if not exists public.exercise_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  skill text not null,
  cefr_level text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, skill, cefr_level)
);

alter table public.exercise_categories
  drop constraint if exists exercise_categories_skill_check;

alter table public.exercise_categories
  add constraint exercise_categories_skill_check
    check (skill in ('grammar', 'listening', 'reading', 'vocabulary'));

alter table public.exercise_categories
  drop constraint if exists exercise_categories_cefr_level_check;

alter table public.exercise_categories
  add constraint exercise_categories_cefr_level_check
    check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1'));

create index if not exists exercise_categories_skill_level_idx
  on public.exercise_categories (skill, cefr_level, name);

alter table public.exercises
  add column if not exists title text;

alter table public.exercises
  add column if not exists cefr_level text;

alter table public.exercises
  add column if not exists category_id uuid references public.exercise_categories (id) on delete set null;

update public.exercises
set title = coalesce(nullif(trim(title), ''), nullif(trim(prompt), ''), 'Untitled exercise')
where title is null
   or trim(title) = '';

update public.exercises e
set cefr_level = case
  when upper(coalesce(l.level, '')) like '%A1%' then 'A1'
  when upper(coalesce(l.level, '')) like '%A2%' then 'A2'
  when upper(coalesce(l.level, '')) like '%B1%' then 'B1'
  when upper(coalesce(l.level, '')) like '%B2%' then 'B2'
  when upper(coalesce(l.level, '')) like '%C1%' then 'C1'
  else 'A1'
end
from public.lessons l
where e.lesson_id = l.id
  and (e.cefr_level is null or trim(e.cefr_level) = '');

update public.exercises
set cefr_level = 'A1'
where cefr_level is null
   or trim(cefr_level) = '';

alter table public.exercises
  alter column title set not null;

alter table public.exercises
  alter column cefr_level set not null;

alter table public.exercises
  drop constraint if exists exercises_skill_tag_check;

alter table public.exercises
  add constraint exercises_skill_tag_check
    check (skill_tag in ('grammar', 'reading', 'listening', 'vocabulary'));

alter table public.exercises
  drop constraint if exists exercises_cefr_level_check;

alter table public.exercises
  add constraint exercises_cefr_level_check
    check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1'));

create index if not exists exercises_skill_level_category_idx
  on public.exercises (skill_tag, cefr_level, category_id, status, created_at);

insert into public.exercise_categories (name, skill, cefr_level)
select distinct
  'General' as name,
  e.skill_tag as skill,
  e.cefr_level as cefr_level
from public.exercises e
where e.skill_tag in ('grammar', 'reading', 'listening', 'vocabulary')
  and e.cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1')
on conflict (name, skill, cefr_level) do nothing;

update public.exercises e
set category_id = ec.id
from public.exercise_categories ec
where e.category_id is null
  and ec.name = 'General'
  and ec.skill = e.skill_tag
  and ec.cefr_level = e.cefr_level;

alter table public.exercises
  alter column category_id set not null;

alter table public.template_session_items
  add column if not exists exercise_points numeric(6, 2);

alter table public.template_session_items
  add column if not exists exercise_order int;

update public.template_session_items tsi
set exercise_points = coalesce(
  nullif((e.content_json ->> 'point_value')::numeric, null),
  10
)
from public.exercises e
where tsi.exercise_id = e.id
  and tsi.exercise_points is null
  and tsi.exercise_id is not null;

update public.template_session_items
set exercise_points = 10
where exercise_points is null;

with ranked_template_items as (
  select
    id,
    row_number() over (
      partition by template_session_id
      order by created_at asc, id asc
    ) as row_idx
  from public.template_session_items
)
update public.template_session_items tsi
set exercise_order = ranked_template_items.row_idx
from ranked_template_items
where ranked_template_items.id = tsi.id
  and tsi.exercise_order is null;

update public.template_session_items
set exercise_order = 1
where exercise_order is null;

alter table public.template_session_items
  alter column exercise_points set default 10;

alter table public.template_session_items
  alter column exercise_points set not null;

alter table public.template_session_items
  alter column exercise_order set default 1;

alter table public.template_session_items
  alter column exercise_order set not null;

alter table public.template_session_items
  drop constraint if exists template_session_items_exercise_points_check;

alter table public.template_session_items
  add constraint template_session_items_exercise_points_check
    check (exercise_points >= 0 and exercise_points <= 100);

alter table public.template_session_items
  drop constraint if exists template_session_items_exercise_order_check;

alter table public.template_session_items
  add constraint template_session_items_exercise_order_check
    check (exercise_order >= 1);

create index if not exists template_session_items_exercise_order_idx
  on public.template_session_items (template_session_id, exercise_order, created_at);

alter table public.session_items
  add column if not exists exercise_points numeric(6, 2);

alter table public.session_items
  add column if not exists exercise_order int;

update public.session_items si
set exercise_points = coalesce(
  nullif((e.content_json ->> 'point_value')::numeric, null),
  10
)
from public.exercises e
where si.exercise_id = e.id
  and si.exercise_points is null
  and si.exercise_id is not null;

update public.session_items
set exercise_points = 10
where exercise_points is null;

with ranked_session_items as (
  select
    id,
    row_number() over (
      partition by session_id
      order by created_at asc, id asc
    ) as row_idx
  from public.session_items
)
update public.session_items si
set exercise_order = ranked_session_items.row_idx
from ranked_session_items
where ranked_session_items.id = si.id
  and si.exercise_order is null;

update public.session_items
set exercise_order = 1
where exercise_order is null;

alter table public.session_items
  alter column exercise_points set default 10;

alter table public.session_items
  alter column exercise_points set not null;

alter table public.session_items
  alter column exercise_order set default 1;

alter table public.session_items
  alter column exercise_order set not null;

alter table public.session_items
  drop constraint if exists session_items_exercise_points_check;

alter table public.session_items
  add constraint session_items_exercise_points_check
    check (exercise_points >= 0 and exercise_points <= 100);

alter table public.session_items
  drop constraint if exists session_items_exercise_order_check;

alter table public.session_items
  add constraint session_items_exercise_order_check
    check (exercise_order >= 1);

create index if not exists session_items_exercise_order_idx
  on public.session_items (session_id, exercise_order, created_at);

alter table public.exercise_categories enable row level security;

drop policy if exists "Admins manage exercise categories" on public.exercise_categories;
create policy "Admins manage exercise categories" on public.exercise_categories
  for all using (public.is_admin())
  with check (public.is_admin());

commit;

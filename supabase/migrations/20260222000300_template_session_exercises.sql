-- Assign Duolingo exercises directly to template/class items and propagated session items.

alter table public.template_session_items
  add column if not exists exercise_id uuid references public.exercises (id) on delete set null;

create index if not exists template_session_items_exercise_idx
  on public.template_session_items (exercise_id, template_session_id)
  where exercise_id is not null;

alter table public.session_items
  add column if not exists exercise_id uuid references public.exercises (id) on delete set null;

create index if not exists session_items_exercise_idx
  on public.session_items (exercise_id, session_id)
  where exercise_id is not null;

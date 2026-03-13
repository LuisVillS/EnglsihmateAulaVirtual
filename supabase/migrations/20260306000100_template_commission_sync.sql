-- Template -> Commission sync support (safe additive migration)

alter table if exists public.course_commissions
  add column if not exists template_id uuid references public.course_templates (id) on delete set null;

alter table if exists public.course_commissions
  add column if not exists template_frequency_snapshot text;

alter table if exists public.course_commissions
  add column if not exists template_course_duration_months_snapshot int;

alter table if exists public.course_commissions
  add column if not exists template_class_duration_minutes_snapshot int;

create index if not exists course_commissions_template_idx
  on public.course_commissions (template_id)
  where template_id is not null;

alter table if exists public.course_sessions
  add column if not exists template_session_id uuid references public.template_sessions (id) on delete set null;

create index if not exists course_sessions_template_session_idx
  on public.course_sessions (template_session_id)
  where template_session_id is not null;

create unique index if not exists course_sessions_commission_template_session_uidx
  on public.course_sessions (commission_id, template_session_id)
  where template_session_id is not null;

alter table if exists public.session_items
  add column if not exists template_session_item_id uuid references public.template_session_items (id) on delete set null;

create index if not exists session_items_template_item_idx
  on public.session_items (template_session_item_id)
  where template_session_item_id is not null;

create unique index if not exists session_items_session_template_item_uidx
  on public.session_items (session_id, template_session_item_id)
  where template_session_item_id is not null;

alter table public.course_sessions
  add column if not exists zoom_link text;

alter table public.course_sessions
  add column if not exists recording_passcode text;

alter table public.course_sessions
  add column if not exists recording_published_at timestamptz;

update public.course_sessions
set zoom_link = live_link
where zoom_link is null
  and live_link is not null;

alter table public.course_sessions
  drop constraint if exists course_sessions_recording_requires_passcode_check;

alter table public.course_sessions
  add constraint course_sessions_recording_requires_passcode_check
    check (recording_link is null or nullif(btrim(recording_passcode), '') is not null);

create table if not exists public.email_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null references public.course_sessions (id) on delete cascade,
  email_type text not null check (email_type in ('zoom_reminder', 'recording_published')),
  template_id int not null,
  sent_at timestamptz,
  status text not null default 'processing' check (status in ('processing', 'sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_id, email_type)
);

alter table public.email_log
  add column if not exists user_id uuid references public.profiles (id) on delete cascade;

alter table public.email_log
  add column if not exists session_id uuid references public.course_sessions (id) on delete cascade;

alter table public.email_log
  add column if not exists email_type text;

alter table public.email_log
  add column if not exists template_id int;

alter table public.email_log
  add column if not exists sent_at timestamptz;

alter table public.email_log
  add column if not exists status text not null default 'processing';

alter table public.email_log
  add column if not exists error_message text;

alter table public.email_log
  add column if not exists created_at timestamptz not null default now();

alter table public.email_log
  add column if not exists updated_at timestamptz not null default now();

update public.email_log
set status = case
  when status in ('processing', 'sent', 'failed') then status
  else 'failed'
end;

update public.email_log
set template_id = coalesce(template_id, 0);

alter table public.email_log
  alter column template_id set not null;

alter table public.email_log
  drop constraint if exists email_log_email_type_check;

alter table public.email_log
  add constraint email_log_email_type_check
    check (email_type in ('zoom_reminder', 'recording_published'));

alter table public.email_log
  drop constraint if exists email_log_status_check;

alter table public.email_log
  add constraint email_log_status_check
    check (status in ('processing', 'sent', 'failed'));

create unique index if not exists email_log_user_session_type_idx
  on public.email_log (user_id, session_id, email_type);

create index if not exists email_log_session_status_idx
  on public.email_log (session_id, email_type, status);

alter table public.email_log enable row level security;

drop policy if exists "Admins manage email log" on public.email_log;
create policy "Admins manage email log" on public.email_log
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.blog_digest_runs (
  id uuid primary key default uuid_generate_v4(),
  digest_key text not null unique,
  digest_kind text not null default 'weekly' check (digest_kind in ('weekly')),
  local_date date not null,
  weekday_label text not null check (weekday_label in ('monday', 'saturday', 'other')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  reason text,
  source_window_start timestamptz,
  source_window_end timestamptz,
  post_count integer not null default 0,
  post_ids uuid[] not null default '{}',
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.blog_digest_runs
  add column if not exists id uuid default uuid_generate_v4(),
  add column if not exists digest_key text,
  add column if not exists digest_kind text not null default 'weekly',
  add column if not exists local_date date,
  add column if not exists weekday_label text,
  add column if not exists status text not null default 'pending',
  add column if not exists reason text,
  add column if not exists source_window_start timestamptz,
  add column if not exists source_window_end timestamptz,
  add column if not exists post_count integer not null default 0,
  add column if not exists post_ids uuid[] not null default '{}',
  add column if not exists recipient_count integer not null default 0,
  add column if not exists sent_count integer not null default 0,
  add column if not exists failed_count integer not null default 0,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists completed_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists blog_digest_runs_digest_key_uidx
  on public.blog_digest_runs (digest_key);

create index if not exists blog_digest_runs_status_completed_idx
  on public.blog_digest_runs (status, completed_at desc);

create index if not exists blog_digest_runs_local_date_idx
  on public.blog_digest_runs (local_date desc, weekday_label);

drop trigger if exists blog_digest_runs_set_updated_at on public.blog_digest_runs;
create trigger blog_digest_runs_set_updated_at
before update on public.blog_digest_runs
for each row execute function public.set_blog_updated_at();

alter table public.blog_digest_runs enable row level security;

drop policy if exists "Admins read blog digest runs" on public.blog_digest_runs;
create policy "Admins read blog digest runs" on public.blog_digest_runs
  for select using (public.is_admin());

drop policy if exists "Admins manage blog digest runs" on public.blog_digest_runs;
create policy "Admins manage blog digest runs" on public.blog_digest_runs
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.auth_rate_limits (
  scope_key text primary key,
  scope text not null,
  identifier text,
  ip_address text,
  attempt_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_rate_limits_scope_idx
  on public.auth_rate_limits (scope, updated_at desc);

create index if not exists auth_rate_limits_locked_idx
  on public.auth_rate_limits (locked_until);

alter table public.auth_rate_limits enable row level security;

alter table public.password_recovery_codes
  add column if not exists attempts integer not null default 0;

alter table public.password_recovery_codes
  add column if not exists used_at timestamptz;

alter table public.password_recovery_codes
  add column if not exists requested_ip text;

create index if not exists password_recovery_codes_email_created_idx
  on public.password_recovery_codes (email, created_at desc);

alter table public.password_recovery_codes enable row level security;

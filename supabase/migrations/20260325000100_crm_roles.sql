create table if not exists public.crm_user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email = lower(email)),
  role text not null check (role in ('crm_admin', 'crm_operator')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_operator_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email = lower(email)),
  full_name text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_user_roles
  add column if not exists is_active boolean not null default true;

alter table public.crm_user_roles
  add column if not exists updated_at timestamptz not null default now();

alter table public.crm_operator_profiles
  add column if not exists phone text;

alter table public.crm_operator_profiles
  add column if not exists notes text;

alter table public.crm_operator_profiles
  add column if not exists is_active boolean not null default true;

alter table public.crm_operator_profiles
  add column if not exists updated_at timestamptz not null default now();

create index if not exists crm_user_roles_role_idx on public.crm_user_roles (role);
create index if not exists crm_user_roles_active_idx on public.crm_user_roles (is_active);
create index if not exists crm_operator_profiles_active_idx on public.crm_operator_profiles (is_active);

alter table public.crm_user_roles enable row level security;
alter table public.crm_operator_profiles enable row level security;

drop policy if exists "CRM user roles self read" on public.crm_user_roles;
create policy "CRM user roles self read" on public.crm_user_roles
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "CRM user roles admin manage" on public.crm_user_roles;
create policy "CRM user roles admin manage" on public.crm_user_roles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "CRM operator profiles self read" on public.crm_operator_profiles;
create policy "CRM operator profiles self read" on public.crm_operator_profiles
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "CRM operator profiles admin manage" on public.crm_operator_profiles;
create policy "CRM operator profiles admin manage" on public.crm_operator_profiles
  for all using (public.is_admin()) with check (public.is_admin());

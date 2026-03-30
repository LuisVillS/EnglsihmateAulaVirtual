create table if not exists public.crm_calling_sessions (
  id uuid primary key default gen_random_uuid(),
  operator_user_id uuid not null references auth.users (id) on delete cascade,
  campaign_key text not null default 'all_open',
  selected_stage_id uuid references public.crm_stages (id) on delete set null,
  selected_source_origin text,
  active_lead_id uuid references public.crm_leads (id) on delete set null,
  queue_lead_ids jsonb not null default '[]'::jsonb,
  session_lead_ids jsonb not null default '[]'::jsonb,
  paused_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_calling_sessions_queue_ids_array check (jsonb_typeof(queue_lead_ids) = 'array'),
  constraint crm_calling_sessions_session_ids_array check (jsonb_typeof(session_lead_ids) = 'array')
);

create index if not exists crm_calling_sessions_operator_paused_idx
on public.crm_calling_sessions (operator_user_id, paused_at desc);

create index if not exists crm_calling_sessions_active_lead_idx
on public.crm_calling_sessions (active_lead_id);

alter table public.crm_calling_sessions enable row level security;

drop policy if exists "CRM calling sessions self read" on public.crm_calling_sessions;
create policy "CRM calling sessions self read" on public.crm_calling_sessions
  for select using (
    auth.uid() = operator_user_id
    or public.is_crm_admin()
    or public.is_admin()
  );

drop policy if exists "CRM calling sessions self manage" on public.crm_calling_sessions;
create policy "CRM calling sessions self manage" on public.crm_calling_sessions
  for all using (
    auth.uid() = operator_user_id
    or public.is_crm_admin()
    or public.is_admin()
  )
  with check (
    auth.uid() = operator_user_id
    or public.is_crm_admin()
    or public.is_admin()
  );

create table if not exists public.crm_inbound_events (
  id uuid primary key default uuid_generate_v4(),
  provider text not null
    check (provider in ('web_form', 'meta', 'legacy_webhook')),
  event_type text not null,
  source_type text,
  source_provider text,
  site_key text,
  host text,
  form_key text,
  form_label text,
  page_path text,
  external_event_id text,
  external_lead_id text,
  payload_json jsonb not null default '{}'::jsonb,
  headers_json jsonb not null default '{}'::jsonb,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'valid', 'invalid', 'skipped')),
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processed', 'failed', 'ignored')),
  processing_error text,
  signature_valid boolean,
  turnstile_valid boolean,
  ip_hash text,
  user_agent text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists crm_inbound_events_provider_received_idx
  on public.crm_inbound_events (provider, received_at desc);

create unique index if not exists crm_inbound_events_provider_external_event_idx
  on public.crm_inbound_events (provider, external_event_id)
  where external_event_id is not null;

create index if not exists crm_inbound_events_external_lead_idx
  on public.crm_inbound_events (external_lead_id)
  where external_lead_id is not null;

create index if not exists crm_inbound_events_form_key_idx
  on public.crm_inbound_events (form_key)
  where form_key is not null;

create index if not exists crm_inbound_events_site_key_idx
  on public.crm_inbound_events (site_key)
  where site_key is not null;

create index if not exists crm_inbound_events_processing_status_idx
  on public.crm_inbound_events (processing_status, received_at desc);

alter table public.crm_inbound_events enable row level security;

drop policy if exists "CRM inbound events read" on public.crm_inbound_events;
create policy "CRM inbound events read" on public.crm_inbound_events
  for select using (public.has_crm_access());

drop policy if exists "CRM inbound events manage" on public.crm_inbound_events;
create policy "CRM inbound events manage" on public.crm_inbound_events
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

create table if not exists public.crm_lead_touchpoints (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.crm_leads (id) on delete cascade,
  inbound_event_id uuid not null references public.crm_inbound_events (id) on delete cascade,
  touch_type text not null,
  source_type text not null,
  source_provider text,
  site_key text,
  host text,
  form_key text,
  form_label text,
  page_path text,
  created_at timestamptz not null default now()
);

create index if not exists crm_lead_touchpoints_lead_idx
  on public.crm_lead_touchpoints (lead_id, created_at desc);

create index if not exists crm_lead_touchpoints_event_idx
  on public.crm_lead_touchpoints (inbound_event_id);

alter table public.crm_lead_touchpoints enable row level security;

drop policy if exists "CRM lead touchpoints read" on public.crm_lead_touchpoints;
create policy "CRM lead touchpoints read" on public.crm_lead_touchpoints
  for select using (public.has_crm_access());

drop policy if exists "CRM lead touchpoints manage" on public.crm_lead_touchpoints;
create policy "CRM lead touchpoints manage" on public.crm_lead_touchpoints
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

alter table public.crm_leads
  drop constraint if exists crm_leads_source_type_check;

alter table public.crm_leads
  add constraint crm_leads_source_type_check
  check (
    source_type in (
      'classroom_pre_enrollment',
      'meta_lead_ad',
      'meta_lead',
      'formspree',
      'web_form',
      'manual'
    )
  );

alter table public.crm_leads
  add column if not exists source_provider text;

alter table public.crm_leads
  add column if not exists source_event_id text;

alter table public.crm_leads
  add column if not exists source_payload jsonb not null default '{}'::jsonb;

alter table public.crm_leads
  add column if not exists raw_source_type text;

alter table public.crm_leads
  add column if not exists raw_source_label text;

alter table public.crm_leads
  add column if not exists raw_source_event_id text;

alter table public.crm_leads
  add column if not exists raw_source_metadata jsonb not null default '{}'::jsonb;

alter table public.crm_leads
  add column if not exists raw_source_payload jsonb not null default '{}'::jsonb;

alter table public.crm_leads
  add column if not exists phone_dialable text;

alter table public.crm_leads
  add column if not exists phone_validation_status text;

alter table public.crm_leads
  add column if not exists phone_validation_reason text;

alter table public.crm_leads
  add column if not exists phone_raw_input text;

alter table public.crm_leads
  add column if not exists site_key text;

alter table public.crm_leads
  add column if not exists host text;

alter table public.crm_leads
  add column if not exists form_key text;

alter table public.crm_leads
  add column if not exists form_label text;

alter table public.crm_leads
  add column if not exists page_path text;

alter table public.crm_leads
  add column if not exists landing_url text;

alter table public.crm_leads
  add column if not exists referrer_url text;

alter table public.crm_leads
  add column if not exists utm_source text;

alter table public.crm_leads
  add column if not exists utm_medium text;

alter table public.crm_leads
  add column if not exists utm_campaign text;

alter table public.crm_leads
  add column if not exists utm_term text;

alter table public.crm_leads
  add column if not exists utm_content text;

alter table public.crm_leads
  add column if not exists first_submission_at timestamptz;

alter table public.crm_leads
  add column if not exists last_submission_at timestamptz;

alter table public.crm_leads
  add column if not exists latest_inbound_event_id uuid references public.crm_inbound_events (id) on delete set null;

alter table public.crm_leads
  add column if not exists external_lead_id text;

alter table public.crm_leads
  add column if not exists meta_page_id text;

alter table public.crm_leads
  add column if not exists meta_form_id text;

alter table public.crm_leads
  add column if not exists meta_ad_id text;

alter table public.crm_leads
  add column if not exists meta_campaign_id text;

create index if not exists crm_leads_source_site_form_idx
  on public.crm_leads (source_type, source_provider, site_key, form_key, created_at desc);

create unique index if not exists crm_leads_source_provider_external_lead_idx
  on public.crm_leads (source_provider, external_lead_id)
  where external_lead_id is not null;

create index if not exists crm_leads_latest_inbound_event_idx
  on public.crm_leads (latest_inbound_event_id)
  where latest_inbound_event_id is not null;

update public.crm_leads
set first_submission_at = coalesce(first_submission_at, created_at),
    last_submission_at = coalesce(last_submission_at, updated_at)
where first_submission_at is null
   or last_submission_at is null;

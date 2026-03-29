create table if not exists public.crm_stages (
  id uuid primary key default uuid_generate_v4(),
  stage_key text not null unique,
  name text not null,
  position int not null,
  pipeline_state text not null default 'open'
    check (pipeline_state in ('open', 'won', 'lost')),
  is_active boolean not null default true,
  is_default boolean not null default false,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_stages_pipeline_state_valid check (
    (pipeline_state = 'open' and is_won = false and is_lost = false)
    or (pipeline_state = 'won' and is_won = true and is_lost = false)
    or (pipeline_state = 'lost' and is_won = false and is_lost = true)
  )
);

create table if not exists public.crm_leads (
  id uuid primary key default uuid_generate_v4(),
  source_type text not null
    check (source_type in ('classroom_pre_enrollment', 'meta_lead_ad', 'formspree', 'manual')),
  source_label text,
  user_id uuid references public.profiles (id) on delete set null,
  pre_enrollment_id uuid unique references public.pre_enrollments (id) on delete set null,
  email text,
  full_name text,
  phone text,
  current_stage_id uuid references public.crm_stages (id) on delete set null,
  lead_status text not null default 'open'
    check (lead_status in ('open', 'won', 'lost', 'archived')),
  current_pre_enrollment_status text,
  assigned_operator_user_id uuid references auth.users (id) on delete set null,
  queue_claimed_by_user_id uuid references auth.users (id) on delete set null,
  queue_claimed_at timestamptz,
  queue_claim_expires_at timestamptz,
  last_call_outcome text,
  last_interaction_at timestamptz,
  next_action_at timestamptz,
  approved_revenue_billing_month date,
  approved_revenue_soles int not null default 0,
  approved_payment_count int not null default 0,
  latest_approved_payment_at timestamptz,
  approved_pre_enrollment_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_leads_pre_enrollment_status_valid check (
    current_pre_enrollment_status is null
    or current_pre_enrollment_status in (
      'PENDING_EMAIL_VERIFICATION',
      'EMAIL_VERIFIED',
      'IN_PROGRESS',
      'RESERVED',
      'PAYMENT_SUBMITTED',
      'PAID_AUTO',
      'APPROVED',
      'REJECTED',
      'EXPIRED',
      'ABANDONED'
    )
  ),
  constraint crm_leads_last_call_outcome_valid check (
    last_call_outcome is null
    or last_call_outcome in (
      'attempted',
      'connected',
      'no_answer',
      'voicemail',
      'callback_requested',
      'wrong_number',
      'not_interested'
    )
  ),
  constraint crm_leads_queue_claim_valid check (
    queue_claim_expires_at is null
    or queue_claimed_by_user_id is not null
  ),
  constraint crm_leads_status_timestamps_valid check (
    not (won_at is not null and lost_at is not null)
    and (lead_status <> 'won' or won_at is not null)
    and (lead_status <> 'lost' or lost_at is not null)
  )
);

create table if not exists public.crm_interactions (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.crm_leads (id) on delete cascade,
  interaction_kind text not null
    check (interaction_kind in ('note', 'call', 'system')),
  direction text not null default 'system'
    check (direction in ('inbound', 'outbound', 'system')),
  operator_user_id uuid references auth.users (id) on delete set null,
  summary text,
  notes text,
  call_outcome text
    check (
      call_outcome is null
      or call_outcome in (
        'attempted',
        'connected',
        'no_answer',
        'voicemail',
        'callback_requested',
        'wrong_number',
        'not_interested'
      )
    ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_stage_history (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.crm_leads (id) on delete cascade,
  from_stage_id uuid references public.crm_stages (id) on delete set null,
  to_stage_id uuid not null references public.crm_stages (id) on delete cascade,
  changed_by_user_id uuid references auth.users (id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_automations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  trigger_event text not null
    check (trigger_event in ('lead_created', 'lead_stage_changed', 'lead_won')),
  trigger_stage_id uuid references public.crm_stages (id) on delete set null,
  delivery_channel text not null
    check (delivery_channel in ('brevo_email')),
  template_key text,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_automation_jobs (
  id uuid primary key default uuid_generate_v4(),
  automation_id uuid references public.crm_automations (id) on delete set null,
  lead_id uuid references public.crm_leads (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  attempt_count int not null default 0,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_webhook_events (
  id uuid primary key default uuid_generate_v4(),
  provider text not null,
  event_type text,
  external_event_id text,
  dedupe_key text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_stages_pipeline_idx
  on public.crm_stages (pipeline_state, is_active, position);

create index if not exists crm_leads_status_stage_idx
  on public.crm_leads (lead_status, current_stage_id, created_at);

create index if not exists crm_leads_queue_idx
  on public.crm_leads (lead_status, queue_claim_expires_at, next_action_at, created_at);

create index if not exists crm_leads_user_idx
  on public.crm_leads (user_id, pre_enrollment_id);

create index if not exists crm_leads_operator_idx
  on public.crm_leads (assigned_operator_user_id, queue_claimed_by_user_id);

create index if not exists crm_interactions_lead_idx
  on public.crm_interactions (lead_id, created_at desc);

create index if not exists crm_interactions_operator_idx
  on public.crm_interactions (operator_user_id, created_at desc);

create index if not exists crm_stage_history_lead_idx
  on public.crm_stage_history (lead_id, created_at desc);

create index if not exists crm_automation_jobs_status_idx
  on public.crm_automation_jobs (status, scheduled_for);

create unique index if not exists crm_webhook_events_dedupe_key_idx
  on public.crm_webhook_events (dedupe_key)
  where dedupe_key is not null;

create unique index if not exists crm_webhook_events_provider_event_idx
  on public.crm_webhook_events (provider, external_event_id)
  where external_event_id is not null;

insert into public.crm_stages (
  stage_key,
  name,
  position,
  pipeline_state,
  is_active,
  is_default,
  is_won,
  is_lost
)
values
  ('new_lead', 'New Lead', 100, 'open', true, true, false, false),
  ('attempting_contact', 'Attempting Contact', 200, 'open', true, false, false, false),
  ('qualified', 'Qualified', 300, 'open', true, false, false, false),
  ('won_enrolled', 'Won / Enrolled', 900, 'won', true, false, true, false),
  ('lost_closed', 'Lost / Closed', 1000, 'lost', true, false, false, true)
on conflict (stage_key) do update
  set name = excluded.name,
      position = excluded.position,
      pipeline_state = excluded.pipeline_state,
      is_active = excluded.is_active,
      is_default = excluded.is_default,
      is_won = excluded.is_won,
      is_lost = excluded.is_lost,
      updated_at = now();

create or replace function public.crm_current_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role
  from public.crm_user_roles
  where user_id = auth.uid()
    and is_active = true
  limit 1
$$;

create or replace function public.is_crm_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.crm_user_roles
      where user_id = auth.uid()
        and role = 'crm_admin'
        and is_active = true
    )
$$;

create or replace function public.has_crm_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.crm_user_roles
      where user_id = auth.uid()
        and role in ('crm_admin', 'crm_operator')
        and is_active = true
    )
$$;

create or replace function public.has_crm_manage_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.crm_user_roles
      where user_id = auth.uid()
        and role = 'crm_admin'
        and is_active = true
    )
$$;

create or replace function public.crm_stage_key_for_pre_enrollment_status(p_status text)
returns text
language sql
stable
set search_path = public
as $$
  select case upper(coalesce(p_status, ''))
    when 'APPROVED' then 'won_enrolled'
    when 'PAYMENT_SUBMITTED' then 'qualified'
    when 'PAID_AUTO' then 'qualified'
    when 'REJECTED' then 'lost_closed'
    when 'EXPIRED' then 'lost_closed'
    when 'ABANDONED' then 'lost_closed'
    else 'new_lead'
  end
$$;

create or replace function public.crm_lead_status_for_stage_key(p_stage_key text)
returns text
language sql
stable
set search_path = public
as $$
  select case lower(coalesce(p_stage_key, ''))
    when 'won_enrolled' then 'won'
    when 'lost_closed' then 'lost'
    else 'open'
  end
$$;

create or replace function public.crm_revenue_billing_month_for_pre_enrollment(p_pre_enrollment_id uuid)
returns date
language sql
stable
set search_path = public
as $$
  select date_trunc(
    'month',
    coalesce(pe.start_month, cc.start_date, pe.created_at::date)
  )::date
  from public.pre_enrollments pe
  left join public.course_commissions cc
    on cc.id = pe.selected_schedule_id
  where pe.id = p_pre_enrollment_id
$$;

create or replace function public.crm_approved_revenue_snapshot(p_pre_enrollment_id uuid)
returns table (
  billing_month date,
  approved_revenue_soles int,
  approved_payment_count int,
  latest_approved_payment_at timestamptz
)
language sql
stable
set search_path = public
as $$
  with target as (
    select
      pe.user_id as student_id,
      public.crm_revenue_billing_month_for_pre_enrollment(pe.id) as billing_month
    from public.pre_enrollments pe
    where pe.id = p_pre_enrollment_id
  )
  select
    target.billing_month,
    coalesce(sum(pay.amount_soles), 0)::int as approved_revenue_soles,
    count(pay.id)::int as approved_payment_count,
    max(coalesce(pay.approved_at, pay.created_at)) as latest_approved_payment_at
  from target
  left join public.payments pay
    on pay.student_id = target.student_id
   and pay.status = 'approved'
   and pay.billing_month = target.billing_month
  group by target.billing_month
$$;

create or replace function public.crm_upsert_lead_from_pre_enrollment(
  p_pre_enrollment_id uuid,
  p_reason text default 'pre_enrollment_sync',
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pre record;
  v_existing public.crm_leads%rowtype;
  v_stage_key text;
  v_stage_id uuid;
  v_target_stage_id uuid;
  v_target_status text;
  v_now timestamptz := now();
  v_lead_id uuid;
  v_billing_month date;
  v_revenue_soles int := 0;
  v_payment_count int := 0;
  v_latest_payment_at timestamptz := null;
  v_approved_at timestamptz := null;
  v_lost_at timestamptz := null;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'pre_enrollment_sync');
begin
  select
    pe.*,
    pr.email as profile_email,
    pr.full_name as profile_full_name,
    pr.phone as profile_phone
  into v_pre
  from public.pre_enrollments pe
  left join public.profiles pr
    on pr.id = pe.user_id
  where pe.id = p_pre_enrollment_id;

  if not found then
    return null;
  end if;

  v_stage_key := public.crm_stage_key_for_pre_enrollment_status(v_pre.status);
  v_target_status := public.crm_lead_status_for_stage_key(v_stage_key);

  select id
  into v_stage_id
  from public.crm_stages
  where stage_key = v_stage_key
  limit 1;

  select
    snapshot.billing_month,
    snapshot.approved_revenue_soles,
    snapshot.approved_payment_count,
    snapshot.latest_approved_payment_at
  into
    v_billing_month,
    v_revenue_soles,
    v_payment_count,
    v_latest_payment_at
  from public.crm_approved_revenue_snapshot(p_pre_enrollment_id) as snapshot;

  if upper(coalesce(v_pre.status, '')) = 'APPROVED' then
    v_approved_at := coalesce(v_pre.reviewed_at, v_now);
  end if;

  if v_target_status = 'lost' then
    v_lost_at := v_now;
  end if;

  select *
  into v_existing
  from public.crm_leads
  where pre_enrollment_id = p_pre_enrollment_id
  for update;

  if found then
    v_target_stage_id := coalesce(v_stage_id, v_existing.current_stage_id);

    update public.crm_leads
    set source_type = 'classroom_pre_enrollment',
        source_label = coalesce(v_existing.source_label, 'Classroom'),
        user_id = v_pre.user_id,
        email = coalesce(v_pre.profile_email, v_existing.email),
        full_name = coalesce(v_pre.profile_full_name, v_existing.full_name),
        phone = coalesce(v_pre.profile_phone, v_existing.phone),
        current_stage_id = coalesce(v_target_stage_id, v_existing.current_stage_id),
        lead_status = v_target_status,
        current_pre_enrollment_status = v_pre.status,
        approved_revenue_billing_month = v_billing_month,
        approved_revenue_soles = coalesce(v_revenue_soles, 0),
        approved_payment_count = coalesce(v_payment_count, 0),
        latest_approved_payment_at = v_latest_payment_at,
        approved_pre_enrollment_at = coalesce(v_existing.approved_pre_enrollment_at, v_approved_at),
        won_at = case
          when v_target_status = 'won' then coalesce(v_existing.won_at, v_approved_at, v_now)
          else v_existing.won_at
        end,
        lost_at = case
          when v_target_status = 'lost' then coalesce(v_existing.lost_at, v_lost_at)
          when v_target_status = 'won' then null
          else v_existing.lost_at
        end,
        last_synced_at = v_now,
        updated_at = v_now
    where id = v_existing.id
    returning id into v_lead_id;

    if v_existing.current_stage_id is distinct from v_target_stage_id and v_target_stage_id is not null then
      insert into public.crm_stage_history (
        lead_id,
        from_stage_id,
        to_stage_id,
        changed_by_user_id,
        reason,
        metadata,
        created_at
      )
      values (
        v_lead_id,
        v_existing.current_stage_id,
        v_target_stage_id,
        p_actor_user_id,
        v_reason,
        jsonb_build_object(
          'pre_enrollment_id', p_pre_enrollment_id,
          'pre_enrollment_status', v_pre.status
        ),
        v_now
      );
    end if;
  else
    insert into public.crm_leads (
      source_type,
      source_label,
      user_id,
      pre_enrollment_id,
      email,
      full_name,
      phone,
      current_stage_id,
      lead_status,
      current_pre_enrollment_status,
      approved_revenue_billing_month,
      approved_revenue_soles,
      approved_payment_count,
      latest_approved_payment_at,
      approved_pre_enrollment_at,
      won_at,
      lost_at,
      last_synced_at,
      created_at,
      updated_at
    )
    values (
      'classroom_pre_enrollment',
      'Classroom',
      v_pre.user_id,
      p_pre_enrollment_id,
      v_pre.profile_email,
      v_pre.profile_full_name,
      v_pre.profile_phone,
      v_stage_id,
      v_target_status,
      v_pre.status,
      v_billing_month,
      coalesce(v_revenue_soles, 0),
      coalesce(v_payment_count, 0),
      v_latest_payment_at,
      v_approved_at,
      case when v_target_status = 'won' then coalesce(v_approved_at, v_now) else null end,
      case when v_target_status = 'lost' then v_lost_at else null end,
      v_now,
      v_now,
      v_now
    )
    returning id into v_lead_id;

    if v_stage_id is not null then
      insert into public.crm_stage_history (
        lead_id,
        from_stage_id,
        to_stage_id,
        changed_by_user_id,
        reason,
        metadata,
        created_at
      )
      values (
        v_lead_id,
        null,
        v_stage_id,
        p_actor_user_id,
        v_reason,
        jsonb_build_object(
          'pre_enrollment_id', p_pre_enrollment_id,
          'pre_enrollment_status', v_pre.status
        ),
        v_now
      );
    end if;
  end if;

  return v_lead_id;
end;
$$;

create or replace function public.crm_sync_approved_pre_enrollment(
  p_pre_enrollment_id uuid,
  p_reason text default 'approved_sync',
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status
  into v_status
  from public.pre_enrollments
  where id = p_pre_enrollment_id;

  if v_status is null then
    return null;
  end if;

  if upper(v_status) <> 'APPROVED' then
    return null;
  end if;

  return public.crm_upsert_lead_from_pre_enrollment(
    p_pre_enrollment_id,
    p_reason,
    p_actor_user_id
  );
end;
$$;

create or replace function public.crm_claim_next_lead(
  p_operator_user_id uuid default null,
  p_claim_timeout_seconds int default 900
)
returns setof public.crm_leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_operator uuid := coalesce(p_operator_user_id, auth.uid());
  v_claim_timeout int := greatest(60, least(coalesce(p_claim_timeout_seconds, 900), 3600));
  v_claimed_id uuid;
begin
  if v_effective_operator is null then
    raise exception 'CRM queue claim requires an operator user id';
  end if;

  if auth.uid() is not null
     and auth.uid() <> v_effective_operator
     and not public.has_crm_manage_access()
     and not public.is_admin() then
    raise exception 'CRM queue claim denied for a different operator';
  end if;

  if not public.has_crm_access() and auth.uid() is not null then
    raise exception 'CRM access denied';
  end if;

  with candidate as (
    select lead.id
    from public.crm_leads lead
    left join public.crm_stages stage
      on stage.id = lead.current_stage_id
    where lead.lead_status = 'open'
      and coalesce(stage.is_won, false) = false
      and coalesce(stage.is_lost, false) = false
      and (
        lead.queue_claimed_by_user_id is null
        or lead.queue_claimed_by_user_id = v_effective_operator
        or lead.queue_claim_expires_at is null
        or lead.queue_claim_expires_at <= now()
      )
      and (
        lead.next_action_at is null
        or lead.next_action_at <= now()
      )
    order by
      case when lead.next_action_at is not null then 0 else 1 end,
      lead.next_action_at asc nulls last,
      lead.last_interaction_at asc nulls first,
      lead.created_at asc
    for update skip locked
    limit 1
  )
  update public.crm_leads as target
  set queue_claimed_by_user_id = v_effective_operator,
      queue_claimed_at = now(),
      queue_claim_expires_at = now() + make_interval(secs => v_claim_timeout),
      updated_at = now()
  from candidate
  where target.id = candidate.id
  returning target.id into v_claimed_id;

  if v_claimed_id is null then
    return;
  end if;

  return query
  select *
  from public.crm_leads
  where id = v_claimed_id;
end;
$$;

create or replace function public.crm_submit_call_outcome(
  p_lead_id uuid,
  p_operator_user_id uuid default null,
  p_call_outcome text default 'attempted',
  p_note text default null,
  p_next_action_at timestamptz default null,
  p_release_claim boolean default true,
  p_metadata jsonb default '{}'::jsonb
)
returns public.crm_interactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_operator uuid := coalesce(p_operator_user_id, auth.uid());
  v_now timestamptz := now();
  v_lead public.crm_leads%rowtype;
  v_interaction public.crm_interactions%rowtype;
  v_call_outcome text := lower(coalesce(nullif(trim(p_call_outcome), ''), 'attempted'));
begin
  if p_lead_id is null then
    raise exception 'CRM call outcome requires a lead id';
  end if;

  if v_effective_operator is null then
    raise exception 'CRM call outcome requires an operator user id';
  end if;

  if v_call_outcome not in (
    'attempted',
    'connected',
    'no_answer',
    'voicemail',
    'callback_requested',
    'wrong_number',
    'not_interested'
  ) then
    raise exception 'Unsupported CRM call outcome: %', v_call_outcome;
  end if;

  if auth.uid() is not null
     and auth.uid() <> v_effective_operator
     and not public.has_crm_manage_access()
     and not public.is_admin() then
    raise exception 'CRM call outcome denied for a different operator';
  end if;

  if not public.has_crm_access() and auth.uid() is not null then
    raise exception 'CRM access denied';
  end if;

  select *
  into v_lead
  from public.crm_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'CRM lead not found';
  end if;

  if v_lead.queue_claimed_by_user_id is not null
     and v_lead.queue_claimed_by_user_id <> v_effective_operator
     and coalesce(v_lead.queue_claim_expires_at, v_now) > v_now
     and not public.has_crm_manage_access()
     and not public.is_admin() then
    raise exception 'CRM lead is currently claimed by another operator';
  end if;

  insert into public.crm_interactions (
    lead_id,
    interaction_kind,
    direction,
    operator_user_id,
    summary,
    notes,
    call_outcome,
    metadata,
    created_at
  )
  values (
    p_lead_id,
    'call',
    'outbound',
    v_effective_operator,
    case v_call_outcome
      when 'connected' then 'Connected call'
      when 'no_answer' then 'No answer'
      when 'voicemail' then 'Voicemail'
      when 'callback_requested' then 'Callback requested'
      when 'wrong_number' then 'Wrong number'
      when 'not_interested' then 'Not interested'
      else 'Call attempted'
    end,
    p_note,
    v_call_outcome,
    coalesce(p_metadata, '{}'::jsonb),
    v_now
  )
  returning * into v_interaction;

  update public.crm_leads
  set last_call_outcome = v_call_outcome,
      last_interaction_at = v_now,
      next_action_at = p_next_action_at,
      queue_claimed_by_user_id = case when coalesce(p_release_claim, true) then null else v_effective_operator end,
      queue_claimed_at = case when coalesce(p_release_claim, true) then null else v_now end,
      queue_claim_expires_at = case
        when coalesce(p_release_claim, true) then null
        else greatest(coalesce(v_lead.queue_claim_expires_at, v_now), v_now)
      end,
      updated_at = v_now
  where id = p_lead_id;

  return v_interaction;
end;
$$;

create or replace function public.crm_sync_lead_from_pre_enrollment_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crm_upsert_lead_from_pre_enrollment(
    new.id,
    'pre_enrollment_trigger',
    null
  );
  return new;
end;
$$;

create or replace function public.crm_sync_leads_from_payment_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := coalesce(new.student_id, old.student_id);
  v_row record;
begin
  if v_student_id is null then
    return coalesce(new, old);
  end if;

  for v_row in
    select id
    from public.pre_enrollments
    where user_id = v_student_id
  loop
    perform public.crm_upsert_lead_from_pre_enrollment(
      v_row.id,
      'payments_trigger',
      null
    );
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists crm_pre_enrollments_sync_lead on public.pre_enrollments;
create trigger crm_pre_enrollments_sync_lead
after insert or update of status, step, selected_level, selected_course_type, start_month, selected_schedule_id, payment_submitted_at
on public.pre_enrollments
for each row
execute function public.crm_sync_lead_from_pre_enrollment_trigger();

drop trigger if exists crm_payments_sync_leads on public.payments;
create trigger crm_payments_sync_leads
after insert or update of status, amount_soles, approved_at, billing_month
on public.payments
for each row
execute function public.crm_sync_leads_from_payment_trigger();

drop trigger if exists crm_payments_sync_leads_delete on public.payments;
create trigger crm_payments_sync_leads_delete
after delete
on public.payments
for each row
execute function public.crm_sync_leads_from_payment_trigger();

alter table public.crm_stages enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_interactions enable row level security;
alter table public.crm_stage_history enable row level security;
alter table public.crm_automations enable row level security;
alter table public.crm_automation_jobs enable row level security;
alter table public.crm_webhook_events enable row level security;

drop policy if exists "CRM stages read" on public.crm_stages;
create policy "CRM stages read" on public.crm_stages
  for select using (public.has_crm_access());

drop policy if exists "CRM stages manage" on public.crm_stages;
create policy "CRM stages manage" on public.crm_stages
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

drop policy if exists "CRM leads read" on public.crm_leads;
create policy "CRM leads read" on public.crm_leads
  for select using (public.has_crm_access());

drop policy if exists "CRM leads manage" on public.crm_leads;
create policy "CRM leads manage" on public.crm_leads
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

drop policy if exists "CRM interactions read" on public.crm_interactions;
create policy "CRM interactions read" on public.crm_interactions
  for select using (public.has_crm_access());

drop policy if exists "CRM interactions insert" on public.crm_interactions;
create policy "CRM interactions insert" on public.crm_interactions
  for insert with check (public.has_crm_access());

drop policy if exists "CRM interactions manage" on public.crm_interactions;
create policy "CRM interactions manage" on public.crm_interactions
  for update using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

drop policy if exists "CRM stage history read" on public.crm_stage_history;
create policy "CRM stage history read" on public.crm_stage_history
  for select using (public.has_crm_access());

drop policy if exists "CRM stage history manage" on public.crm_stage_history;
create policy "CRM stage history manage" on public.crm_stage_history
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

drop policy if exists "CRM automations manage" on public.crm_automations;
create policy "CRM automations manage" on public.crm_automations
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

drop policy if exists "CRM automation jobs manage" on public.crm_automation_jobs;
create policy "CRM automation jobs manage" on public.crm_automation_jobs
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

drop policy if exists "CRM webhook events manage" on public.crm_webhook_events;
create policy "CRM webhook events manage" on public.crm_webhook_events
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

do $$
declare
  v_row record;
begin
  for v_row in
    select id
    from public.pre_enrollments
  loop
    perform public.crm_upsert_lead_from_pre_enrollment(
      v_row.id,
      'm3_backfill',
      null
    );
  end loop;
end;
$$;

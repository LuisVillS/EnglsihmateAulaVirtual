alter table public.crm_user_roles
  add column if not exists provisioned_by_user_id uuid references auth.users (id) on delete set null;

alter table public.crm_user_roles
  add column if not exists provisioned_at timestamptz;

alter table public.crm_stages
  add column if not exists brevo_template_code text;

alter table public.crm_stages
  add column if not exists brevo_template_id text;

alter table public.crm_stages
  add column if not exists brevo_template_config jsonb not null default '{}'::jsonb;

alter table public.crm_stages
  add column if not exists archived_at timestamptz;

alter table public.crm_stages
  add column if not exists archived_by_user_id uuid references auth.users (id) on delete set null;

alter table public.crm_stages
  add column if not exists archive_reason text;

alter table public.crm_leads
  add column if not exists source_origin text not null default 'manual';

alter table public.crm_leads
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

alter table public.crm_leads
  add column if not exists archived_at timestamptz;

alter table public.crm_leads
  add column if not exists archived_by_user_id uuid references auth.users (id) on delete set null;

alter table public.crm_leads
  add column if not exists archive_reason text;

do $$
begin
  alter table public.crm_leads drop constraint if exists crm_leads_source_origin_valid;
exception
  when undefined_object then null;
end $$;

alter table public.crm_leads
  add constraint crm_leads_source_origin_valid
  check (source_origin in ('meta', 'formspree', 'pre_enrollment', 'manual', 'other'));

create index if not exists crm_user_roles_provisioned_idx
  on public.crm_user_roles (provisioned_by_user_id);

create index if not exists crm_stages_management_idx
  on public.crm_stages (is_active, archived_at, position);

create index if not exists crm_leads_source_origin_idx
  on public.crm_leads (source_origin, lead_status, created_at);

create index if not exists crm_leads_archive_idx
  on public.crm_leads (lead_status, archived_at, updated_at);

update public.crm_leads
set source_origin = case
  when source_type = 'meta_lead_ad' then 'meta'
  when source_type = 'formspree' then 'formspree'
  when source_type = 'classroom_pre_enrollment' then 'pre_enrollment'
  else coalesce(source_origin, 'manual')
end
where source_origin is null
   or source_origin = 'manual'
   or source_origin not in ('meta', 'formspree', 'pre_enrollment', 'manual', 'other');

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
  v_source_metadata jsonb := '{}'::jsonb;
begin
  select
    pe.*,
    pr.email as profile_email,
    pr.full_name as profile_full_name,
    pr.phone as profile_phone
  into v_pre
  from public.pre_enrollments pe
  left join public.profiles pr on pr.id = pe.user_id
  where pe.id = p_pre_enrollment_id;

  if not found then
    return null;
  end if;

  v_stage_key := public.crm_stage_key_for_pre_enrollment_status(v_pre.status);

  select id
  into v_stage_id
  from public.crm_stages
  where stage_key = v_stage_key
    and is_active = true
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

  select *
  into v_existing
  from public.crm_leads
  where pre_enrollment_id = p_pre_enrollment_id
  for update;

  v_source_metadata := jsonb_strip_nulls(
    jsonb_build_object(
      'source_origin', 'pre_enrollment',
      'source_type', 'classroom_pre_enrollment',
      'source_label', 'Classroom',
      'pre_enrollment_id', p_pre_enrollment_id,
      'pre_enrollment_status', v_pre.status,
      'pre_enrollment_step', v_pre.step,
      'selected_level', v_pre.selected_level,
      'selected_frequency', v_pre.selected_frequency,
      'selected_start_time', v_pre.selected_start_time,
      'selected_course_type', v_pre.selected_course_type,
      'start_month', v_pre.start_month,
      'selected_course_id', v_pre.selected_course_id,
      'selected_schedule_id', v_pre.selected_schedule_id,
      'modality', v_pre.modality,
      'price_total', v_pre.price_total,
      'reservation_expires_at', v_pre.reservation_expires_at,
      'terms_accepted_at', v_pre.terms_accepted_at,
      'payment_method', v_pre.payment_method,
      'payment_proof_url', v_pre.payment_proof_url,
      'payment_proof_meta', v_pre.payment_proof_meta,
      'payment_submitted_at', v_pre.payment_submitted_at,
      'mp_payment_id', v_pre.mp_payment_id,
      'mp_status', v_pre.mp_status,
      'reviewed_by', v_pre.reviewed_by,
      'reviewed_at', v_pre.reviewed_at,
      'review_notes', v_pre.review_notes,
      'student_code', v_pre.student_code,
      'period', v_pre.period,
      'profile_email', v_pre.profile_email,
      'profile_full_name', v_pre.profile_full_name,
      'profile_phone', v_pre.profile_phone
    )
  );

  if found then
    v_target_stage_id := coalesce(v_stage_id, v_existing.current_stage_id);
    v_target_status := coalesce(public.crm_lead_status_for_stage_key(v_stage_key), 'open');

    if v_existing.archived_at is not null then
      v_target_status := 'archived';
    end if;

    update public.crm_leads
    set source_origin = 'pre_enrollment',
        source_type = 'classroom_pre_enrollment',
        source_label = coalesce(v_existing.source_label, 'Classroom'),
        user_id = v_pre.user_id,
        email = coalesce(v_pre.profile_email, v_existing.email),
        full_name = coalesce(v_pre.profile_full_name, v_existing.full_name),
        phone = coalesce(v_pre.profile_phone, v_existing.phone),
        source_metadata = coalesce(v_existing.source_metadata, '{}'::jsonb) || v_source_metadata,
        current_stage_id = case
          when v_existing.archived_at is not null then v_existing.current_stage_id
          else coalesce(v_target_stage_id, v_existing.current_stage_id)
        end,
        lead_status = case
          when v_existing.archived_at is not null then 'archived'
          else v_target_status
        end,
        current_pre_enrollment_status = v_pre.status,
        approved_revenue_billing_month = v_billing_month,
        approved_revenue_soles = coalesce(v_revenue_soles, 0),
        approved_payment_count = coalesce(v_payment_count, 0),
        latest_approved_payment_at = v_latest_payment_at,
        approved_pre_enrollment_at = coalesce(v_existing.approved_pre_enrollment_at, v_approved_at),
        won_at = case
          when v_existing.archived_at is not null then v_existing.won_at
          when v_target_status = 'won' then coalesce(v_existing.won_at, v_approved_at, v_now)
          else v_existing.won_at
        end,
        lost_at = case
          when v_existing.archived_at is not null then v_existing.lost_at
          when v_target_status = 'lost' then coalesce(v_existing.lost_at, v_now)
          else v_existing.lost_at
        end,
        archived_at = v_existing.archived_at,
        archived_by_user_id = v_existing.archived_by_user_id,
        archive_reason = v_existing.archive_reason,
        last_synced_at = v_now,
        updated_at = v_now
    where id = v_existing.id
    returning id into v_lead_id;

    if v_existing.current_stage_id is distinct from v_target_stage_id
       and v_target_stage_id is not null
       and v_existing.archived_at is null then
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
          'pre_enrollment_status', v_pre.status,
          'source_origin', 'pre_enrollment'
        ),
        v_now
      );
    end if;
  else
    insert into public.crm_leads (
      source_type,
      source_label,
      source_origin,
      source_metadata,
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
      archived_at,
      archived_by_user_id,
      archive_reason,
      last_synced_at
    )
    values (
      'classroom_pre_enrollment',
      'Classroom',
      'pre_enrollment',
      v_source_metadata,
      v_pre.user_id,
      p_pre_enrollment_id,
      v_pre.profile_email,
      v_pre.profile_full_name,
      v_pre.profile_phone,
      v_stage_id,
      coalesce(public.crm_lead_status_for_stage_key(v_stage_key), 'open'),
      v_pre.status,
      v_billing_month,
      coalesce(v_revenue_soles, 0),
      coalesce(v_payment_count, 0),
      v_latest_payment_at,
      v_approved_at,
      v_now,
      v_lost_at,
      null,
      null,
      null,
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
          'pre_enrollment_status', v_pre.status,
          'source_origin', 'pre_enrollment'
        ),
        v_now
      );
    end if;
  end if;

  return v_lead_id;
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
    raise exception 'Invalid CRM call outcome: %', v_call_outcome;
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

  if v_lead.lead_status = 'archived' or v_lead.archived_at is not null then
    raise exception 'Archived CRM leads cannot receive call outcomes';
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
    coalesce(nullif(trim(p_note), ''), initcap(replace(v_call_outcome, '_', ' '))),
    nullif(trim(p_note), ''),
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
      'm4_source_metadata_backfill',
      null
    );
  end loop;
end;
$$;

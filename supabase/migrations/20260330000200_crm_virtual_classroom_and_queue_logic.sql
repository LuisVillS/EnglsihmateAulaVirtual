create or replace function public.crm_stage_key_for_pre_enrollment_status(p_status text)
returns text
language sql
stable
set search_path = public
as $$
  select case upper(coalesce(p_status, ''))
    when 'APPROVED' then 'won_enrolled'
    when 'REJECTED' then 'lost_closed'
    when 'EXPIRED' then 'lost_closed'
    when 'ABANDONED' then 'lost_closed'
    else 'qualified'
  end
$$;

create or replace function public.crm_claim_next_lead(
  p_operator_user_id uuid default null,
  p_claim_timeout_seconds int default 900,
  p_campaign_key text default null,
  p_stage_id uuid default null,
  p_stage_key text default null,
  p_stage_keys text[] default null,
  p_source_type text default null,
  p_source_types text[] default null,
  p_source_origin text default null,
  p_source_origins text[] default null,
  p_excluded_lead_ids uuid[] default null
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
    where lead.lead_status = 'open'
      and (
        p_excluded_lead_ids is null
        or not (lead.id = any(p_excluded_lead_ids))
      )
      and not exists (
        select 1
        from public.crm_stages stage
        where stage.id = lead.current_stage_id
          and (
            coalesce(stage.is_won, false) = true
            or coalesce(stage.is_lost, false) = true
          )
      )
      and (
        p_stage_id is null
        or lead.current_stage_id = p_stage_id
      )
      and (
        p_stage_key is null
        or exists (
          select 1
          from public.crm_stages stage_filter
          where stage_filter.id = lead.current_stage_id
            and stage_filter.stage_key = p_stage_key
        )
      )
      and (
        p_stage_keys is null
        or exists (
          select 1
          from public.crm_stages stage_filter
          where stage_filter.id = lead.current_stage_id
            and stage_filter.stage_key = any(p_stage_keys)
        )
      )
      and (
        p_source_type is null
        or lead.source_type = p_source_type
      )
      and (
        p_source_types is null
        or lead.source_type = any(p_source_types)
      )
      and (
        p_source_origin is null
        or lead.source_origin = p_source_origin
      )
      and (
        p_source_origins is null
        or lead.source_origin = any(p_source_origins)
      )
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
    for update of lead skip locked
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
  v_phone_e164 text := null;
begin
  select
    pe.*,
    pr.email as profile_email,
    pr.full_name as profile_full_name,
    pr.phone as profile_phone,
    pr.phone_country_code as profile_phone_country_code,
    pr.phone_national_number as profile_phone_national_number,
    pr.phone_e164 as profile_phone_e164
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

  v_phone_e164 := coalesce(v_pre.profile_phone_e164, public.crm_normalize_phone_e164(v_pre.profile_phone));

  select *
  into v_existing
  from public.crm_leads
  where pre_enrollment_id = p_pre_enrollment_id
     or (
       v_phone_e164 is not null
       and (phone_e164 = v_phone_e164 or phone = v_phone_e164)
     )
  order by
    case when pre_enrollment_id = p_pre_enrollment_id then 0 else 1 end,
    case when lead_status = 'open' then 0 else 1 end,
    updated_at desc
  limit 1
  for update;

  v_source_metadata := jsonb_strip_nulls(
    jsonb_build_object(
      'source_origin', 'pre_enrollment',
      'source_type', 'classroom_pre_enrollment',
      'source_label', 'Virtual classroom',
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
      'profile_phone', v_pre.profile_phone,
      'profile_phone_country_code', v_pre.profile_phone_country_code,
      'profile_phone_national_number', v_pre.profile_phone_national_number,
      'profile_phone_e164', v_pre.profile_phone_e164
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
        source_label = 'Virtual classroom',
        pre_enrollment_id = coalesce(v_existing.pre_enrollment_id, p_pre_enrollment_id),
        user_id = coalesce(v_existing.user_id, v_pre.user_id),
        email = coalesce(v_existing.email, v_pre.profile_email),
        full_name = coalesce(v_existing.full_name, v_pre.profile_full_name),
        phone = coalesce(v_existing.phone, v_pre.profile_phone, v_phone_e164),
        phone_country_code = coalesce(v_existing.phone_country_code, v_pre.profile_phone_country_code),
        phone_national_number = coalesce(v_existing.phone_national_number, v_pre.profile_phone_national_number),
        phone_e164 = coalesce(v_existing.phone_e164, v_pre.profile_phone_e164, v_phone_e164),
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

    perform public.crm_upsert_lead_source_tag(
      v_lead_id,
      'pre_enrollment',
      'classroom_pre_enrollment',
      'Virtual classroom',
      null,
      null,
      v_source_metadata,
      true
    );

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
      phone_country_code,
      phone_national_number,
      phone_e164,
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
      'Virtual classroom',
      'pre_enrollment',
      v_source_metadata,
      v_pre.user_id,
      p_pre_enrollment_id,
      v_pre.profile_email,
      v_pre.profile_full_name,
      coalesce(v_pre.profile_phone, v_phone_e164),
      v_pre.profile_phone_country_code,
      v_pre.profile_phone_national_number,
      coalesce(v_pre.profile_phone_e164, v_phone_e164),
      v_stage_id,
      coalesce(public.crm_lead_status_for_stage_key(v_stage_key), 'open'),
      v_pre.status,
      v_billing_month,
      coalesce(v_revenue_soles, 0),
      coalesce(v_payment_count, 0),
      v_latest_payment_at,
      v_approved_at,
      case when coalesce(public.crm_lead_status_for_stage_key(v_stage_key), 'open') = 'won' then coalesce(v_approved_at, v_now) else null end,
      case when coalesce(public.crm_lead_status_for_stage_key(v_stage_key), 'open') = 'lost' then v_lost_at else null end,
      null,
      null,
      null,
      v_now
    )
    returning id into v_lead_id;

    perform public.crm_upsert_lead_source_tag(
      v_lead_id,
      'pre_enrollment',
      'classroom_pre_enrollment',
      'Virtual classroom',
      null,
      null,
      v_source_metadata,
      true
    );

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

update public.crm_leads
set source_origin = 'pre_enrollment',
    source_type = 'classroom_pre_enrollment',
    source_label = 'Virtual classroom',
    updated_at = now()
where pre_enrollment_id is not null;

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
      'virtual_classroom_backfill',
      null
    );
  end loop;
end;
$$;

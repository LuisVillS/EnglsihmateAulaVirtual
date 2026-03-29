create table if not exists public.crm_lead_source_tags (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.crm_leads (id) on delete cascade,
  source_key text not null,
  source_origin text not null,
  source_type text,
  source_label text,
  source_provider text,
  source_event_id text,
  source_metadata jsonb not null default '{}'::jsonb,
  is_primary boolean not null default false,
  occurrence_count int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_lead_source_tags_occurrence_positive check (occurrence_count > 0)
);

create unique index if not exists crm_lead_source_tags_lead_key_idx
  on public.crm_lead_source_tags (lead_id, source_key);

create index if not exists crm_lead_source_tags_lead_idx
  on public.crm_lead_source_tags (lead_id, last_seen_at desc);

create index if not exists crm_lead_source_tags_origin_idx
  on public.crm_lead_source_tags (source_origin, source_type);

alter table public.crm_lead_source_tags enable row level security;

drop policy if exists "CRM lead source tags read" on public.crm_lead_source_tags;
create policy "CRM lead source tags read" on public.crm_lead_source_tags
  for select using (public.has_crm_access());

drop policy if exists "CRM lead source tags manage" on public.crm_lead_source_tags;
create policy "CRM lead source tags manage" on public.crm_lead_source_tags
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

create or replace function public.crm_normalize_lead_source_origin(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(nullif(btrim(coalesce(p_value, '')), '')) in ('classroom_pre_enrollment', 'registration') then 'pre_enrollment'
    when lower(nullif(btrim(coalesce(p_value, '')), '')) = 'meta_lead_ad' then 'meta'
    when lower(nullif(btrim(coalesce(p_value, '')), '')) in ('meta', 'formspree', 'pre_enrollment', 'manual', 'other') then lower(nullif(btrim(coalesce(p_value, '')), ''))
    when lower(nullif(btrim(coalesce(p_value, '')), '')) is null then null
    else 'other'
  end
$$;

create or replace function public.crm_build_lead_source_key(
  p_source_origin text,
  p_source_type text default null,
  p_source_provider text default null,
  p_source_label text default null
)
returns text
language sql
immutable
set search_path = public
as $$
  select concat_ws(
    ':',
    coalesce(public.crm_normalize_lead_source_origin(p_source_origin), 'other'),
    coalesce(nullif(lower(btrim(coalesce(p_source_type, ''))), ''), 'unknown'),
    coalesce(nullif(lower(btrim(coalesce(p_source_provider, ''))), ''), 'unknown')
  )
$$;

create or replace function public.crm_upsert_lead_source_tag(
  p_lead_id uuid,
  p_source_origin text,
  p_source_type text default null,
  p_source_label text default null,
  p_source_provider text default null,
  p_source_event_id text default null,
  p_source_metadata jsonb default '{}'::jsonb,
  p_is_primary boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_origin text := coalesce(public.crm_normalize_lead_source_origin(p_source_origin), 'other');
  v_source_type text := nullif(btrim(coalesce(p_source_type, '')), '');
  v_source_label text := nullif(btrim(coalesce(p_source_label, '')), '');
  v_source_provider text := nullif(btrim(coalesce(p_source_provider, '')), '');
  v_source_event_id text := nullif(btrim(coalesce(p_source_event_id, '')), '');
  v_source_key text := public.crm_build_lead_source_key(v_source_origin, v_source_type, v_source_provider, v_source_label);
  v_now timestamptz := now();
  v_existing public.crm_lead_source_tags%rowtype;
  v_tag_count int := 0;
  v_tag_id uuid;
begin
  if p_lead_id is null then
    raise exception 'CRM lead source tag requires a lead id';
  end if;

  select *
  into v_existing
  from public.crm_lead_source_tags
  where lead_id = p_lead_id
    and source_key = v_source_key
  for update;

  if found then
    update public.crm_lead_source_tags
    set source_origin = v_source_origin,
        source_type = coalesce(v_source_type, source_type),
        source_label = coalesce(v_source_label, source_label),
        source_provider = coalesce(v_source_provider, source_provider),
        source_event_id = coalesce(v_source_event_id, source_event_id),
        source_metadata = coalesce(v_existing.source_metadata, '{}'::jsonb) || coalesce(p_source_metadata, '{}'::jsonb),
        is_primary = case when p_is_primary then true else v_existing.is_primary end,
        occurrence_count = v_existing.occurrence_count + 1,
        last_seen_at = v_now,
        updated_at = v_now
    where id = v_existing.id
    returning id into v_tag_id;

    if p_is_primary then
      update public.crm_lead_source_tags
      set is_primary = false,
          updated_at = v_now
      where lead_id = p_lead_id
        and id <> v_tag_id;
    end if;

    return v_tag_id;
  end if;

  select count(*) into v_tag_count
  from public.crm_lead_source_tags
  where lead_id = p_lead_id;

  if v_tag_count >= 3 then
    return null;
  end if;

  if p_is_primary then
    update public.crm_lead_source_tags
    set is_primary = false,
        updated_at = v_now
    where lead_id = p_lead_id;
  end if;

  insert into public.crm_lead_source_tags (
    lead_id,
    source_key,
    source_origin,
    source_type,
    source_label,
    source_provider,
    source_event_id,
    source_metadata,
    is_primary,
    occurrence_count,
    first_seen_at,
    last_seen_at,
    created_at,
    updated_at
  )
  values (
    p_lead_id,
    v_source_key,
    v_source_origin,
    v_source_type,
    v_source_label,
    v_source_provider,
    v_source_event_id,
    coalesce(p_source_metadata, '{}'::jsonb),
    coalesce(p_is_primary, false),
    1,
    v_now,
    v_now,
    v_now,
    v_now
  )
  returning id into v_tag_id;

  return v_tag_id;
end;
$$;

create or replace function public.crm_find_lead_by_phone(p_phone text)
returns uuid
language sql
stable
set search_path = public
as $$
  select id
  from public.crm_leads
  where coalesce(phone_e164, phone) = public.crm_normalize_phone_e164(p_phone)
     or phone = public.crm_normalize_phone_e164(p_phone)
  order by case when lead_status = 'open' then 0 else 1 end, updated_at desc
  limit 1
$$;

update public.crm_leads
set source_origin = coalesce(source_origin, public.crm_normalize_lead_source_origin(source_type)),
    source_type = coalesce(source_type, case
      when source_origin = 'pre_enrollment' then 'classroom_pre_enrollment'
      when source_origin = 'meta' then 'meta_lead_ad'
      when source_origin = 'formspree' then 'formspree'
      else null
    end),
    source_label = coalesce(source_label, case
      when source_origin = 'pre_enrollment' then 'Classroom'
      when source_origin = 'meta' then 'Meta'
      when source_origin = 'formspree' then 'Formspree'
      else null
    end)
where source_origin is not null
   or source_type is not null;

insert into public.crm_lead_source_tags (
  lead_id,
  source_key,
  source_origin,
  source_type,
  source_label,
  source_provider,
  source_event_id,
  source_metadata,
  is_primary,
  occurrence_count,
  first_seen_at,
  last_seen_at,
  created_at,
  updated_at
)
select
  lead.id,
  public.crm_build_lead_source_key(
    coalesce(lead.source_origin, public.crm_normalize_lead_source_origin(lead.source_type)),
    lead.source_type,
    coalesce(
      nullif(lead.source_metadata ->> 'source_provider', ''),
      nullif(lead.source_metadata ->> 'provider', ''),
      nullif(lead.source_metadata ->> 'source', '')
    ),
    lead.source_label
  ),
  coalesce(public.crm_normalize_lead_source_origin(lead.source_origin), public.crm_normalize_lead_source_origin(lead.source_type), 'other'),
  lead.source_type,
  lead.source_label,
  coalesce(
    nullif(lead.source_metadata ->> 'source_provider', ''),
    nullif(lead.source_metadata ->> 'provider', ''),
    nullif(lead.source_metadata ->> 'source', '')
  ),
  coalesce(
    nullif(lead.source_metadata ->> 'source_event_id', ''),
    nullif(lead.source_metadata ->> 'event_id', ''),
    nullif(lead.source_metadata ->> 'leadgen_id', ''),
    nullif(lead.source_metadata ->> 'submission_id', '')
  ),
  coalesce(lead.source_metadata, '{}'::jsonb),
  true,
  1,
  coalesce(lead.created_at, now()),
  coalesce(lead.updated_at, now()),
  coalesce(lead.created_at, now()),
  coalesce(lead.updated_at, now())
from public.crm_leads lead
where lead.source_origin is not null
   or lead.source_type is not null
on conflict (lead_id, source_key) do nothing;

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
  p_source_origins text[] default null
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
    set source_origin = coalesce(v_existing.source_origin, 'pre_enrollment'),
        source_type = coalesce(v_existing.source_type, 'classroom_pre_enrollment'),
        source_label = coalesce(v_existing.source_label, 'Classroom'),
        user_id = coalesce(v_existing.user_id, v_pre.user_id),
        email = coalesce(v_existing.email, v_pre.profile_email),
        full_name = coalesce(v_existing.full_name, v_pre.profile_full_name),
        phone = coalesce(v_existing.phone, v_pre.profile_phone, v_phone_e164),
        phone_country_code = coalesce(v_existing.phone_country_code, v_pre.profile_phone_country_code),
        phone_national_number = coalesce(v_existing.phone_national_number, v_pre.profile_phone_national_number),
        phone_e164 = coalesce(v_existing.phone_e164, v_pre.profile_phone_e164, v_phone_e164),
        source_metadata = coalesce(v_existing.source_metadata, v_source_metadata),
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
      'Classroom',
      null,
      null,
      v_source_metadata,
      false
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
      'Classroom',
      'pre_enrollment',
      v_source_metadata,
      v_pre.user_id,
      p_pre_enrollment_id,
      v_pre.profile_email,
      v_pre.profile_full_name,
      v_pre.profile_phone,
      v_pre.profile_phone_country_code,
      v_pre.profile_phone_national_number,
      v_pre.profile_phone_e164,
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

    perform public.crm_upsert_lead_source_tag(
      v_lead_id,
      'pre_enrollment',
      'classroom_pre_enrollment',
      'Classroom',
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

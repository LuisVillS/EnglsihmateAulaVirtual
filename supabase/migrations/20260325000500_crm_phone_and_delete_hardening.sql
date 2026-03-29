alter table public.profiles
  add column if not exists phone_country_code text;

alter table public.profiles
  add column if not exists phone_national_number text;

alter table public.profiles
  add column if not exists phone_e164 text;

alter table public.crm_leads
  add column if not exists phone_country_code text;

alter table public.crm_leads
  add column if not exists phone_national_number text;

alter table public.crm_leads
  add column if not exists phone_e164 text;

create index if not exists profiles_phone_e164_idx
  on public.profiles (phone_e164)
  where phone_e164 is not null;

create index if not exists crm_leads_phone_e164_idx
  on public.crm_leads (phone_e164)
  where phone_e164 is not null;

create table if not exists public.crm_deleted_leads (
  id uuid primary key default uuid_generate_v4(),
  original_lead_id uuid not null,
  source_type text,
  source_origin text,
  user_id uuid,
  pre_enrollment_id uuid,
  email text,
  full_name text,
  phone text,
  phone_country_code text,
  phone_national_number text,
  phone_e164 text,
  lead_status text,
  deleted_at timestamptz not null default now(),
  deleted_by_user_id uuid references auth.users (id) on delete set null,
  delete_reason text,
  snapshot jsonb not null default '{}'::jsonb
);

alter table public.crm_deleted_leads enable row level security;

drop policy if exists "CRM deleted leads read" on public.crm_deleted_leads;
create policy "CRM deleted leads read" on public.crm_deleted_leads
  for select using (public.has_crm_manage_access());

drop policy if exists "CRM deleted leads manage" on public.crm_deleted_leads;
create policy "CRM deleted leads manage" on public.crm_deleted_leads
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

create unique index if not exists crm_deleted_leads_original_lead_idx
  on public.crm_deleted_leads (original_lead_id);

create index if not exists crm_deleted_leads_deleted_at_idx
  on public.crm_deleted_leads (deleted_at desc);

create index if not exists crm_deleted_leads_phone_e164_idx
  on public.crm_deleted_leads (phone_e164)
  where phone_e164 is not null;

create or replace function public.crm_phone_digits(p_value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_value, ''), '\D', '', 'g'), '')
$$;

create or replace function public.crm_normalize_phone_country_code(p_value text)
returns text
language sql
immutable
as $$
  select case
    when public.crm_phone_digits(p_value) is null then null
    when length(public.crm_phone_digits(p_value)) between 1 and 3 then '+' || public.crm_phone_digits(p_value)
    else null
  end
$$;

create or replace function public.crm_normalize_phone_e164(p_value text)
returns text
language sql
immutable
as $$
  with prepared as (
    select
      nullif(btrim(coalesce(p_value, '')), '') as raw_value,
      public.crm_phone_digits(
        case
          when coalesce(p_value, '') ~ '^\s*00' then substr(coalesce(p_value, ''), 3)
          else p_value
        end
      ) as digits
  )
  select case
    when raw_value is null or digits is null then null
    when not (raw_value ~ '^\s*\+' or raw_value ~ '^\s*00') then null
    when length(digits) between 8 and 15 then '+' || digits
    else null
  end
  from prepared
$$;

create or replace function public.crm_infer_phone_country_code(p_value text)
returns text
language sql
immutable
as $$
  with prepared as (
    select case
      when coalesce(p_value, '') ~ '^\s*00' then public.crm_phone_digits(substr(coalesce(p_value, ''), 3))
      when coalesce(p_value, '') ~ '^\s*\+' then public.crm_phone_digits(p_value)
      else null
    end as digits
  )
  select '+' || candidate.country_code
  from prepared
  join lateral (
    select country_code
    from unnest(array[
      '998', '995', '994', '593', '592', '591', '598', '597', '596', '595', '594',
      '58', '57', '56', '55', '54', '53', '52', '51', '49', '48', '47', '46', '45',
      '44', '43', '41', '40', '39', '34', '33', '32', '31', '30', '27', '20', '7', '1'
    ]) as country_code
    where prepared.digits like country_code || '%'
    order by length(country_code) desc, country_code asc
    limit 1
  ) candidate on true
$$;

create or replace function public.crm_phone_digits_look_fake(p_value text)
returns boolean
language sql
immutable
as $$
  with prepared as (
    select coalesce(public.crm_phone_digits(p_value), '') as digits
  )
  select
    digits = ''
    or length(digits) < 6
    or length(digits) > 15
    or digits ~ '^(\d)\1+$'
    or (length(digits) >= 6 and left('0123456789012345', length(digits)) = digits)
    or (length(digits) >= 6 and left('9876543210987654', length(digits)) = digits)
    or (length(digits) >= 6 and length(digits) % 2 = 0 and repeat(left(digits, 2), length(digits) / 2) = digits)
    or (length(digits) >= 6 and length(digits) % 3 = 0 and repeat(left(digits, 3), length(digits) / 3) = digits)
  from prepared
$$;

create or replace function public.crm_phone_parts(
  p_raw_phone text default null,
  p_country_code text default null,
  p_national_number text default null,
  p_phone_e164 text default null
)
returns table (
  phone_country_code text,
  phone_national_number text,
  phone_e164 text,
  is_valid boolean,
  validation_reason text
)
language plpgsql
immutable
as $$
declare
  v_explicit_country_code text := public.crm_normalize_phone_country_code(p_country_code);
  v_explicit_e164 text := public.crm_normalize_phone_e164(p_phone_e164);
  v_raw_phone text := nullif(btrim(coalesce(p_raw_phone, '')), '');
  v_raw_international_digits text;
  v_national_digits text := public.crm_phone_digits(p_national_number);
  v_full_digits text;
  v_country_digits text;
begin
  if v_explicit_e164 is not null then
    phone_e164 := v_explicit_e164;
    phone_country_code := coalesce(v_explicit_country_code, public.crm_infer_phone_country_code(v_explicit_e164));
    if phone_country_code is not null then
      phone_national_number := public.crm_phone_digits(v_explicit_e164);
      phone_national_number := substr(
        phone_national_number,
        length(replace(phone_country_code, '+', '')) + 1
      );
    end if;
  end if;

  if phone_country_code is null then
    phone_country_code := v_explicit_country_code;
  end if;

  if v_raw_phone ~ '^\s*\+' then
    v_raw_international_digits := public.crm_phone_digits(v_raw_phone);
  elsif v_raw_phone ~ '^\s*00' then
    v_raw_international_digits := public.crm_phone_digits(substr(v_raw_phone, 3));
  else
    v_raw_international_digits := null;
  end if;

  if phone_country_code is null and v_raw_international_digits is not null then
    phone_country_code := public.crm_infer_phone_country_code('+' || v_raw_international_digits);
  end if;

  if phone_national_number is null then
    if v_national_digits is not null then
      phone_national_number := v_national_digits;
    elsif v_raw_international_digits is not null and phone_country_code is not null then
      v_country_digits := replace(phone_country_code, '+', '');
      if v_raw_international_digits like v_country_digits || '%' then
        phone_national_number := substr(v_raw_international_digits, length(v_country_digits) + 1);
      else
        phone_national_number := v_raw_international_digits;
      end if;
    else
      phone_national_number := public.crm_phone_digits(v_raw_phone);
    end if;
  end if;

  if phone_national_number is not null then
    phone_national_number := public.crm_phone_digits(phone_national_number);
  end if;

  if phone_national_number is null then
    is_valid := false;
    validation_reason := case
      when v_raw_phone is null and v_explicit_e164 is null then null
      else 'missing_national_number'
    end;
    phone_e164 := null;
    return next;
    return;
  end if;

  if length(phone_national_number) < 6 or length(phone_national_number) > 12 then
    is_valid := false;
    validation_reason := 'invalid_national_number_length';
    phone_e164 := null;
    return next;
    return;
  end if;

  if public.crm_phone_digits_look_fake(phone_national_number) then
    is_valid := false;
    validation_reason := 'fake_national_number';
    phone_e164 := null;
    return next;
    return;
  end if;

  if phone_country_code is null then
    is_valid := false;
    validation_reason := 'missing_country_code';
    phone_e164 := null;
    return next;
    return;
  end if;

  v_full_digits := replace(phone_country_code, '+', '') || phone_national_number;
  if length(v_full_digits) < 8 or length(v_full_digits) > 15 then
    is_valid := false;
    validation_reason := 'invalid_e164_length';
    phone_e164 := null;
    return next;
    return;
  end if;

  if public.crm_phone_digits_look_fake(v_full_digits) then
    is_valid := false;
    validation_reason := 'fake_full_number';
    phone_e164 := null;
    return next;
    return;
  end if;

  phone_e164 := '+' || v_full_digits;
  is_valid := true;
  validation_reason := null;
  return next;
end;
$$;

create or replace function public.crm_apply_phone_fields()
returns trigger
language plpgsql
as $$
declare
  v_parts record;
begin
  new.phone := nullif(btrim(coalesce(new.phone, '')), '');

  select *
  into v_parts
  from public.crm_phone_parts(
    new.phone,
    new.phone_country_code,
    new.phone_national_number,
    new.phone_e164
  );

  new.phone_country_code := v_parts.phone_country_code;
  new.phone_national_number := v_parts.phone_national_number;
  new.phone_e164 := v_parts.phone_e164;

  return new;
end;
$$;

drop trigger if exists profiles_apply_phone_fields on public.profiles;
create trigger profiles_apply_phone_fields
before insert or update of phone, phone_country_code, phone_national_number, phone_e164
on public.profiles
for each row
execute function public.crm_apply_phone_fields();

drop trigger if exists crm_leads_apply_phone_fields on public.crm_leads;
create trigger crm_leads_apply_phone_fields
before insert or update of phone, phone_country_code, phone_national_number, phone_e164
on public.crm_leads
for each row
execute function public.crm_apply_phone_fields();

update public.profiles as profile
set phone_country_code = parts.phone_country_code,
    phone_national_number = parts.phone_national_number,
    phone_e164 = parts.phone_e164
from (
  select
    source_profile.id,
    parts.phone_country_code,
    parts.phone_national_number,
    parts.phone_e164
  from public.profiles as source_profile
  cross join lateral public.crm_phone_parts(
    source_profile.phone,
    source_profile.phone_country_code,
    source_profile.phone_national_number,
    source_profile.phone_e164
  ) as parts
) as parts
where profile.id = parts.id
  and (
    profile.phone is not null
    or profile.phone_country_code is not null
    or profile.phone_national_number is not null
    or profile.phone_e164 is not null
  );

update public.crm_leads as lead
set phone_country_code = parts.phone_country_code,
    phone_national_number = parts.phone_national_number,
    phone_e164 = parts.phone_e164
from (
  select
    source_lead.id,
    parts.phone_country_code,
    parts.phone_national_number,
    parts.phone_e164
  from public.crm_leads as source_lead
  cross join lateral public.crm_phone_parts(
    source_lead.phone,
    source_lead.phone_country_code,
    source_lead.phone_national_number,
    source_lead.phone_e164
  ) as parts
) as parts
where lead.id = parts.id
  and (
    lead.phone is not null
    or lead.phone_country_code is not null
    or lead.phone_national_number is not null
    or lead.phone_e164 is not null
  );

create or replace function public.crm_can_delete_lead(p_actor_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles admin_profile
    where admin_profile.id = p_actor_user_id
  )
  or exists (
    select 1
    from public.crm_user_roles role
    where role.user_id = p_actor_user_id
      and role.is_active = true
      and role.role in ('crm_admin', 'crm_operator')
  )
$$;

create or replace function public.crm_capture_deleted_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_text text := nullif(current_setting('crm.delete_actor_user_id', true), '');
  v_actor_user_id uuid := case when v_actor_text is null then auth.uid() else v_actor_text::uuid end;
  v_reason text := coalesce(nullif(current_setting('crm.delete_reason', true), ''), 'deleted');
  v_snapshot jsonb := '{}'::jsonb;
begin
  select jsonb_build_object(
    'lead', to_jsonb(old),
    'interactions', coalesce((
      select jsonb_agg(to_jsonb(interaction_row) order by interaction_row.created_at desc)
      from public.crm_interactions interaction_row
      where interaction_row.lead_id = old.id
    ), '[]'::jsonb),
    'stage_history', coalesce((
      select jsonb_agg(to_jsonb(history_row) order by history_row.created_at desc)
      from public.crm_stage_history history_row
      where history_row.lead_id = old.id
    ), '[]'::jsonb),
    'automation_jobs', coalesce((
      select jsonb_agg(to_jsonb(job_row) order by job_row.created_at desc)
      from public.crm_automation_jobs job_row
      where job_row.lead_id = old.id
    ), '[]'::jsonb)
  )
  into v_snapshot;

  insert into public.crm_deleted_leads (
    original_lead_id,
    source_type,
    source_origin,
    user_id,
    pre_enrollment_id,
    email,
    full_name,
    phone,
    phone_country_code,
    phone_national_number,
    phone_e164,
    lead_status,
    deleted_at,
    deleted_by_user_id,
    delete_reason,
    snapshot
  )
  values (
    old.id,
    old.source_type,
    old.source_origin,
    old.user_id,
    old.pre_enrollment_id,
    old.email,
    old.full_name,
    old.phone,
    old.phone_country_code,
    old.phone_national_number,
    old.phone_e164,
    old.lead_status,
    now(),
    v_actor_user_id,
    v_reason,
    v_snapshot
  )
  on conflict (original_lead_id) do update
    set deleted_at = excluded.deleted_at,
        deleted_by_user_id = coalesce(excluded.deleted_by_user_id, public.crm_deleted_leads.deleted_by_user_id),
        delete_reason = coalesce(excluded.delete_reason, public.crm_deleted_leads.delete_reason),
        snapshot = excluded.snapshot;

  return old;
end;
$$;

drop trigger if exists crm_leads_capture_deleted_lead on public.crm_leads;
create trigger crm_leads_capture_deleted_lead
before delete
on public.crm_leads
for each row
execute function public.crm_capture_deleted_lead();

create or replace function public.crm_hard_delete_lead(
  p_lead_id uuid,
  p_actor_user_id uuid default null,
  p_reason text default null
)
returns public.crm_deleted_leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_actor uuid := coalesce(p_actor_user_id, auth.uid());
  v_deleted public.crm_deleted_leads%rowtype;
  v_reason text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'deleted');
begin
  if p_lead_id is null then
    raise exception 'CRM lead delete requires a lead id';
  end if;

  if v_effective_actor is not null and not public.crm_can_delete_lead(v_effective_actor) then
    raise exception 'CRM lead delete denied';
  end if;

  perform set_config('crm.delete_actor_user_id', coalesce(v_effective_actor::text, ''), true);
  perform set_config('crm.delete_reason', v_reason, true);

  delete from public.crm_leads
  where id = p_lead_id;

  select *
  into v_deleted
  from public.crm_deleted_leads
  where original_lead_id = p_lead_id;

  if not found then
    return null;
  end if;

  return v_deleted;
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
        source_label = coalesce(v_existing.source_label, 'Classroom'),
        user_id = v_pre.user_id,
        email = coalesce(v_pre.profile_email, v_existing.email),
        full_name = coalesce(v_pre.profile_full_name, v_existing.full_name),
        phone = coalesce(v_pre.profile_phone, v_existing.phone),
        phone_country_code = coalesce(v_pre.profile_phone_country_code, v_existing.phone_country_code),
        phone_national_number = coalesce(v_pre.profile_phone_national_number, v_existing.phone_national_number),
        phone_e164 = coalesce(v_pre.profile_phone_e164, v_existing.phone_e164),
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

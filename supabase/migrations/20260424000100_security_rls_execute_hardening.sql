-- Security hardening: lock sensitive tables behind RLS, reduce public grants,
-- and restrict sensitive SECURITY DEFINER functions to service_role.

do $$
begin
  if to_regclass('public.fixed_admin_emails') is not null then
    execute 'alter table public.fixed_admin_emails enable row level security';
    execute 'alter table public.fixed_admin_emails force row level security';
    execute 'revoke all privileges on table public.fixed_admin_emails from public';
    execute 'revoke all privileges on table public.fixed_admin_emails from anon';
    execute 'revoke all privileges on table public.fixed_admin_emails from authenticated';
    execute 'grant select, insert, update, delete on table public.fixed_admin_emails to service_role';
  end if;

  if to_regclass('public.password_recovery_codes') is not null then
    execute 'alter table public.password_recovery_codes enable row level security';
    execute 'alter table public.password_recovery_codes force row level security';
    execute 'revoke all privileges on table public.password_recovery_codes from public';
    execute 'revoke all privileges on table public.password_recovery_codes from anon';
    execute 'revoke all privileges on table public.password_recovery_codes from authenticated';
    execute 'grant select, insert, update, delete on table public.password_recovery_codes to service_role';
  end if;

  if to_regclass('public.auth_rate_limits') is not null then
    execute 'alter table public.auth_rate_limits enable row level security';
    execute 'alter table public.auth_rate_limits force row level security';
    execute 'revoke all privileges on table public.auth_rate_limits from public';
    execute 'revoke all privileges on table public.auth_rate_limits from anon';
    execute 'revoke all privileges on table public.auth_rate_limits from authenticated';
    execute 'grant select, insert, update, delete on table public.auth_rate_limits to service_role';
  end if;
end
$$;

do $$
declare
  v_function_signatures text[] := array[
    'public.crm_can_delete_lead(uuid)',
    'public.crm_capture_deleted_lead()',
    'public.crm_claim_next_lead(uuid,integer)',
    'public.crm_claim_next_lead(uuid,integer,text,text[],text[],text[])',
    'public.crm_claim_next_lead(uuid,integer,text,uuid,text,text[],text,text[],text,text[])',
    'public.crm_claim_next_lead(uuid,integer,text,uuid,text,text[],text,text[],text,text[],uuid[])',
    'public.crm_hard_delete_lead(uuid,uuid,text)',
    'public.crm_submit_call_outcome(uuid,uuid,text,text,timestamptz,boolean,jsonb)',
    'public.crm_sync_approved_pre_enrollment(uuid,text,uuid)',
    'public.crm_sync_lead_from_pre_enrollment_trigger()',
    'public.crm_sync_leads_from_payment_trigger()',
    'public.crm_upsert_lead_from_pre_enrollment(uuid,text,uuid)',
    'public.crm_upsert_lead_source_tag(uuid,text,text,text,text,text,jsonb,boolean)',
    'public.finalize_ended_competition_weeks()',
    'public.gc_orphan_archived_exercises()',
    'public.handle_fixed_admin_on_auth_user()',
    'public.handle_new_user()',
    'public.prevent_fixed_admin_delete()',
    'public.refresh_weekly_league_member_counts(uuid)',
    'public.sync_fixed_admins_from_auth()'
  ];
  v_signature text;
begin
  foreach v_signature in array v_function_signatures loop
    if to_regprocedure(v_signature) is null then
      continue;
    end if;

    execute format('revoke all privileges on function %s from public', v_signature);
    execute format('revoke all privileges on function %s from anon', v_signature);
    execute format('revoke all privileges on function %s from authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  account_type text := lower(coalesce(new.raw_user_meta_data->>'account_type', ''));
begin
  if account_type = 'admin' then
    insert into public.admin_profiles (id, email, full_name, invited, password_set, created_at)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', null),
      true,
      false,
      now()
    )
    on conflict (id) do update
      set email = excluded.email,
          full_name = excluded.full_name;
    return new;
  end if;

  insert into public.profiles (id, email, full_name, role, status, password_set, invited, created_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', null),
    'non_student',
    'pre_registered',
    false,
    false,
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name;
  return new;
end;
$$;

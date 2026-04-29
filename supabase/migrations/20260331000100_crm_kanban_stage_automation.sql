alter table public.crm_stages
  add column if not exists system_key text;

alter table public.crm_stages
  add column if not exists display_name text;

alter table public.crm_stages
  add column if not exists email_template_id text;

alter table public.crm_stages
  add column if not exists ignored_roles jsonb not null default '[]'::jsonb;

alter table public.crm_stages
  add column if not exists initial_delay_hours int not null default 0;

alter table public.crm_stages
  add column if not exists stagnancy_follow_up_enabled boolean not null default false;

alter table public.crm_stages
  add column if not exists follow_up_template_id text;

alter table public.crm_leads
  add column if not exists last_stage_change_at timestamptz;

alter table public.crm_leads
  add column if not exists stage_follow_up_sent_at timestamptz;

alter table public.crm_leads
  add column if not exists stage_follow_up_stage_id uuid references public.crm_stages (id) on delete set null;

update public.crm_stages
set system_key = coalesce(nullif(trim(system_key), ''), stage_key),
    display_name = coalesce(nullif(trim(display_name), ''), name),
    email_template_id = coalesce(nullif(trim(email_template_id), ''), nullif(trim(brevo_template_id), '')),
    ignored_roles = case
      when jsonb_typeof(ignored_roles) = 'array' then ignored_roles
      else '[]'::jsonb
    end,
    initial_delay_hours = greatest(coalesce(initial_delay_hours, 0), 0)
where system_key is null
   or display_name is null
   or email_template_id is distinct from coalesce(nullif(trim(email_template_id), ''), nullif(trim(brevo_template_id), ''))
   or ignored_roles is null
   or jsonb_typeof(ignored_roles) <> 'array'
   or initial_delay_hours is null
   or initial_delay_hours < 0;

update public.crm_leads lead
set last_stage_change_at = coalesce(
      (
        select max(history.created_at)
        from public.crm_stage_history history
        where history.lead_id = lead.id
      ),
      lead.updated_at,
      lead.created_at,
      now()
    )
where lead.last_stage_change_at is null;

alter table public.crm_stages
  alter column system_key set not null;

alter table public.crm_stages
  alter column display_name set not null;

do $$
begin
  alter table public.crm_stages
    add constraint crm_stages_ignored_roles_array
      check (jsonb_typeof(ignored_roles) = 'array');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.crm_stages
    add constraint crm_stages_initial_delay_hours_nonnegative
      check (initial_delay_hours >= 0);
exception
  when duplicate_object then null;
end $$;

create unique index if not exists crm_stages_system_key_idx
  on public.crm_stages (lower(system_key));

create index if not exists crm_leads_stage_change_idx
  on public.crm_leads (current_stage_id, last_stage_change_at);

create index if not exists crm_leads_stage_follow_up_idx
  on public.crm_leads (stage_follow_up_stage_id, stage_follow_up_sent_at);

create or replace function public.crm_sync_stage_compat_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_system_key text;
  v_display_name text;
  v_email_template_id text;
begin
  v_system_key := lower(
    coalesce(
      nullif(trim(new.system_key), ''),
      nullif(trim(new.stage_key), ''),
      nullif(trim(old.system_key), ''),
      nullif(trim(old.stage_key), '')
    )
  );

  if v_system_key is null then
    raise exception 'CRM stages require a stable system_key';
  end if;

  v_display_name := coalesce(
    nullif(trim(new.display_name), ''),
    nullif(trim(new.name), ''),
    nullif(trim(old.display_name), ''),
    nullif(trim(old.name), ''),
    initcap(replace(v_system_key, '_', ' '))
  );

  v_email_template_id := coalesce(
    nullif(trim(new.email_template_id), ''),
    nullif(trim(new.brevo_template_id), ''),
    nullif(trim(old.email_template_id), ''),
    nullif(trim(old.brevo_template_id), '')
  );

  new.system_key := v_system_key;
  new.stage_key := v_system_key;
  new.display_name := v_display_name;
  new.name := v_display_name;
  new.email_template_id := v_email_template_id;
  new.brevo_template_id := v_email_template_id;
  new.ignored_roles := case
    when new.ignored_roles is null or jsonb_typeof(new.ignored_roles) <> 'array' then '[]'::jsonb
    else new.ignored_roles
  end;
  new.initial_delay_hours := greatest(coalesce(new.initial_delay_hours, 0), 0);

  return new;
end;
$$;

drop trigger if exists crm_stages_sync_compat_fields on public.crm_stages;
create trigger crm_stages_sync_compat_fields
before insert or update on public.crm_stages
for each row
execute function public.crm_sync_stage_compat_fields();

create or replace function public.crm_track_stage_change_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.current_stage_id is not null and new.last_stage_change_at is null then
      new.last_stage_change_at := coalesce(new.updated_at, new.created_at, now());
    end if;

    if new.current_stage_id is null then
      new.stage_follow_up_sent_at := null;
      new.stage_follow_up_stage_id := null;
    end if;

    return new;
  end if;

  if new.current_stage_id is distinct from old.current_stage_id then
    new.last_stage_change_at := coalesce(new.updated_at, now());
    new.stage_follow_up_sent_at := null;
    new.stage_follow_up_stage_id := null;
  elsif new.current_stage_id is null then
    new.stage_follow_up_sent_at := null;
    new.stage_follow_up_stage_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists crm_leads_track_stage_change_fields on public.crm_leads;
create trigger crm_leads_track_stage_change_fields
before insert or update on public.crm_leads
for each row
execute function public.crm_track_stage_change_fields();

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

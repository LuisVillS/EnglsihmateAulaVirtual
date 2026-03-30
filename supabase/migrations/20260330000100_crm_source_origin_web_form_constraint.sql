alter table public.crm_leads
  drop constraint if exists crm_leads_source_origin_valid;

alter table public.crm_leads
  add constraint crm_leads_source_origin_valid
  check (
    source_origin is null
    or source_origin in (
      'meta',
      'web_form',
      'formspree',
      'pre_enrollment',
      'manual',
      'other'
    )
  );

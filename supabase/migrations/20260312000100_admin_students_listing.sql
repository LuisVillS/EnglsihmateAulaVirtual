create or replace function public.admin_list_students(
  p_course_level text default null,
  p_search text default null,
  p_preferred_hour integer default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns table (
  id uuid,
  full_name text,
  email text,
  dni text,
  phone text,
  birth_date date,
  email_verified_at timestamptz,
  student_code text,
  course_level text,
  is_premium boolean,
  role text,
  created_at timestamptz,
  preferred_hour smallint,
  status text,
  commission_id uuid,
  start_month date,
  enrollment_date date,
  password_set boolean,
  commission_course_level text,
  commission_number integer,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_page integer := greatest(coalesce(p_page, 1), 1);
  safe_page_size integer := greatest(least(coalesce(p_page_size, 50), 5000), 1);
  safe_search text := nullif(btrim(coalesce(p_search, '')), '');
  escaped_search text := null;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  if safe_search is not null then
    escaped_search := replace(replace(replace(safe_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  end if;

  return query
  with filtered_profiles as (
    select
      p.id,
      p.full_name,
      p.email,
      p.dni,
      p.phone,
      p.birth_date,
      p.email_verified_at,
      p.student_code,
      p.course_level,
      p.is_premium,
      p.role,
      p.created_at,
      p.preferred_hour,
      p.status,
      p.commission_id,
      p.start_month,
      p.enrollment_date,
      p.password_set
    from public.profiles p
    where
      (nullif(btrim(coalesce(p_course_level, '')), '') is null or p.course_level = p_course_level)
      and (p_preferred_hour is null or p.preferred_hour = p_preferred_hour)
      and (
        escaped_search is null
        or coalesce(p.full_name, '') ilike ('%' || escaped_search || '%') escape '\'
        or coalesce(p.email, '') ilike ('%' || escaped_search || '%') escape '\'
        or coalesce(p.dni, '') ilike ('%' || escaped_search || '%') escape '\'
        or coalesce(p.student_code, '') ilike ('%' || escaped_search || '%') escape '\'
      )
  ),
  latest_pre_enrollments as (
    select distinct on (pe.user_id)
      pe.user_id,
      pe.status
    from public.pre_enrollments pe
    join filtered_profiles fp on fp.id = pe.user_id
    order by pe.user_id, pe.created_at desc
  ),
  enrolled_users as (
    select distinct ce.user_id
    from public.course_enrollments ce
    join filtered_profiles fp on fp.id = ce.user_id
  ),
  classified_profiles as (
    select
      fp.*,
      lpe.status as latest_pre_status,
      (eu.user_id is not null) as has_enrollment,
      case
        when fp.role = 'admin' then 'admin'
        when fp.role = 'student' then 'student'
        when fp.status = 'enrolled' then 'student'
        else 'non_student'
      end as effective_role
    from filtered_profiles fp
    left join latest_pre_enrollments lpe on lpe.user_id = fp.id
    left join enrolled_users eu on eu.user_id = fp.id
  ),
  resolved_profiles as (
    select cp.*
    from classified_profiles cp
    where cp.effective_role <> 'admin'
      and (
        cp.effective_role = 'student'
        or cp.has_enrollment
        or cp.commission_id is not null
        or nullif(btrim(coalesce(cp.course_level, '')), '') is not null
        or cp.latest_pre_status = 'APPROVED'
        or (
          cp.effective_role = 'non_student'
          and (
            cp.latest_pre_status is null
            or cp.latest_pre_status not in (
              'PENDING_EMAIL_VERIFICATION',
              'EMAIL_VERIFIED',
              'IN_PROGRESS',
              'RESERVED',
              'PAYMENT_SUBMITTED',
              'PAID_AUTO',
              'REJECTED',
              'EXPIRED',
              'ABANDONED'
            )
          )
        )
      )
  ),
  counted_profiles as (
    select
      rp.*,
      cc.course_level as commission_course_level,
      cc.commission_number,
      count(*) over() as total_count
    from resolved_profiles rp
    left join public.course_commissions cc on cc.id = rp.commission_id
  )
  select
    cp.id,
    cp.full_name,
    cp.email,
    cp.dni,
    cp.phone,
    cp.birth_date,
    cp.email_verified_at,
    cp.student_code,
    cp.course_level,
    cp.is_premium,
    cp.role,
    cp.created_at,
    cp.preferred_hour,
    cp.status,
    cp.commission_id,
    cp.start_month,
    cp.enrollment_date,
    cp.password_set,
    cp.commission_course_level,
    cp.commission_number,
    cp.total_count
  from counted_profiles cp
  order by cp.created_at desc nulls last, cp.id
  offset (safe_page - 1) * safe_page_size
  limit safe_page_size;
end;
$$;

grant execute on function public.admin_list_students(text, text, integer, integer, integer) to authenticated;

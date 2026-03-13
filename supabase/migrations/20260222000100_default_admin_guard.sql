-- Guard + self-heal for fixed default admin
-- Protected email: luisvill99sa@gmail.com

create or replace function public.ensure_fixed_default_admin_profile()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  admin_email text := 'luisvill99sa@gmail.com';
  admin_user auth.users%rowtype;
begin
  select *
  into admin_user
  from auth.users
  where lower(email) = admin_email
  order by created_at asc
  limit 1;

  if admin_user.id is null then
    return;
  end if;

  insert into public.admin_profiles (id, email, full_name, invited, password_set, created_at)
  values (
    admin_user.id,
    admin_email,
    coalesce(admin_user.raw_user_meta_data->>'full_name', admin_user.email),
    true,
    coalesce(admin_user.encrypted_password is not null, false),
    coalesce(admin_user.created_at, now())
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.admin_profiles.full_name),
        invited = true,
        password_set = coalesce(excluded.password_set, public.admin_profiles.password_set);

  delete from public.profiles
  where id = admin_user.id;
end;
$$;

create or replace function public.sync_fixed_default_admin_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if lower(coalesce(new.email, '')) = 'luisvill99sa@gmail.com' then
    perform public.ensure_fixed_default_admin_profile();
  end if;
  return new;
end;
$$;

drop trigger if exists fixed_default_admin_sync on auth.users;
create trigger fixed_default_admin_sync
after insert or update of email on auth.users
for each row
execute function public.sync_fixed_default_admin_from_auth();

create or replace function public.guard_fixed_default_admin_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(old.email, '')) = 'luisvill99sa@gmail.com' then
    if tg_op = 'DELETE' then
      raise exception 'No se puede eliminar el admin por defecto protegido.';
    end if;
    if tg_op = 'UPDATE' and lower(coalesce(new.email, '')) <> 'luisvill99sa@gmail.com' then
      raise exception 'No se puede cambiar el email del admin por defecto protegido.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists guard_fixed_default_admin_profile_trg on public.admin_profiles;
create trigger guard_fixed_default_admin_profile_trg
before update or delete on public.admin_profiles
for each row
execute function public.guard_fixed_default_admin_profile();

select public.ensure_fixed_default_admin_profile();


create extension if not exists "uuid-ossp";

create table if not exists public.admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'admin' check (role in ('admin', 'editor')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_users
  add column if not exists id uuid references auth.users (id) on delete cascade,
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists role text not null default 'admin',
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists admin_users_id_uidx
  on public.admin_users (id);

create index if not exists admin_users_email_lower_idx
  on public.admin_users (lower(email));

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_users'
      and column_name = 'user_id'
  ) then
    update public.admin_users
    set id = user_id
    where id is null
      and user_id is not null;

    execute $admin_users_backfill$
      insert into public.admin_users (user_id, id, email, full_name, role, is_active, created_at, updated_at)
      select
        id,
        id,
        lower(trim(email)),
        full_name,
        'admin',
        true,
        coalesce(created_at, now()),
        now()
      from public.admin_profiles
      where email is not null
        and trim(email) <> ''
      on conflict (id) do update
      set user_id = coalesce(public.admin_users.user_id, excluded.user_id),
          email = excluded.email,
          full_name = coalesce(excluded.full_name, public.admin_users.full_name),
          is_active = true,
          updated_at = now()
    $admin_users_backfill$;
  else
    insert into public.admin_users (id, email, full_name, role, is_active, created_at, updated_at)
    select
      id,
      lower(trim(email)),
      full_name,
      'admin',
      true,
      coalesce(created_at, now()),
      now()
    from public.admin_profiles
    where email is not null
      and trim(email) <> ''
    on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.admin_users.full_name),
        is_active = true,
        updated_at = now();
  end if;
end $$;

create table if not exists public.blog_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.blog_categories
  add column if not exists id uuid default uuid_generate_v4(),
  add column if not exists name text,
  add column if not exists slug text,
  add column if not exists description text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.blog_posts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  slug text not null unique,
  category_id uuid references public.blog_categories (id) on delete set null,
  excerpt text,
  cover_image_url text,
  content_markdown text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  seo_title text,
  seo_description text,
  created_by_admin_id uuid references public.admin_users (id) on delete set null,
  updated_by_admin_id uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blog_posts_published_at_valid check (status <> 'published' or published_at is not null)
);

alter table public.blog_posts
  add column if not exists id uuid default uuid_generate_v4(),
  add column if not exists title text,
  add column if not exists slug text,
  add column if not exists category_id uuid references public.blog_categories (id) on delete set null,
  add column if not exists excerpt text,
  add column if not exists cover_image_url text,
  add column if not exists content_markdown text,
  add column if not exists status text not null default 'draft',
  add column if not exists published_at timestamptz,
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists created_by_admin_id uuid references public.admin_users (id) on delete set null,
  add column if not exists updated_by_admin_id uuid references public.admin_users (id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.blog_subscribers (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  source text not null default 'blog',
  lead_source text not null default 'blog',
  lead_type text not null default 'blog',
  status text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  landing_url text,
  page_path text,
  referrer_url text,
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.blog_subscribers
  add column if not exists id uuid default uuid_generate_v4(),
  add column if not exists email text,
  add column if not exists source text not null default 'blog',
  add column if not exists lead_source text not null default 'blog',
  add column if not exists lead_type text not null default 'blog',
  add column if not exists status text not null default 'subscribed',
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_term text,
  add column if not exists utm_content text,
  add column if not exists landing_url text,
  add column if not exists page_path text,
  add column if not exists referrer_url text,
  add column if not exists subscribed_at timestamptz not null default now(),
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists blog_categories_public_idx
  on public.blog_categories (is_active, sort_order, name);

create index if not exists blog_posts_public_idx
  on public.blog_posts (status, published_at desc)
  where status = 'published';

create index if not exists blog_posts_category_idx
  on public.blog_posts (category_id, updated_at desc);

create index if not exists blog_subscribers_created_idx
  on public.blog_subscribers (created_at desc);

create unique index if not exists blog_subscribers_email_lower_uidx
  on public.blog_subscribers (lower(email));

create or replace function public.set_blog_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists admin_users_set_updated_at on public.admin_users;
create trigger admin_users_set_updated_at
before update on public.admin_users
for each row execute function public.set_blog_updated_at();

drop trigger if exists blog_categories_set_updated_at on public.blog_categories;
create trigger blog_categories_set_updated_at
before update on public.blog_categories
for each row execute function public.set_blog_updated_at();

drop trigger if exists blog_posts_set_updated_at on public.blog_posts;
create trigger blog_posts_set_updated_at
before update on public.blog_posts
for each row execute function public.set_blog_updated_at();

drop trigger if exists blog_subscribers_set_updated_at on public.blog_subscribers;
create trigger blog_subscribers_set_updated_at
before update on public.blog_subscribers
for each row execute function public.set_blog_updated_at();

alter table public.admin_users enable row level security;
alter table public.blog_categories enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_subscribers enable row level security;

drop policy if exists "Admin users self read" on public.admin_users;
create policy "Admin users self read" on public.admin_users
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "Admins manage admin users" on public.admin_users;
create policy "Admins manage admin users" on public.admin_users
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public reads active blog categories" on public.blog_categories;
create policy "Public reads active blog categories" on public.blog_categories
  for select using (is_active = true or public.is_admin());

drop policy if exists "Admins manage blog categories" on public.blog_categories;
create policy "Admins manage blog categories" on public.blog_categories
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public reads published blog posts" on public.blog_posts;
create policy "Public reads published blog posts" on public.blog_posts
  for select using (status = 'published' or public.is_admin());

drop policy if exists "Admins manage blog posts" on public.blog_posts;
create policy "Admins manage blog posts" on public.blog_posts
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins read blog subscribers" on public.blog_subscribers;
create policy "Admins read blog subscribers" on public.blog_subscribers
  for select using (public.is_admin());

drop policy if exists "Public subscribes to blog" on public.blog_subscribers;
create policy "Public subscribes to blog" on public.blog_subscribers
  for insert with check (
    source = 'blog'
    and lead_source = 'blog'
    and lead_type = 'blog'
  );

drop policy if exists "Admins manage blog subscribers" on public.blog_subscribers;
create policy "Admins manage blog subscribers" on public.blog_subscribers
  for all using (public.is_admin()) with check (public.is_admin());

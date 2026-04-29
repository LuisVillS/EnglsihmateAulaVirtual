alter table public.blog_posts
  add column if not exists unpublished_reason text,
  add column if not exists image_check_status text,
  add column if not exists image_check_error text,
  add column if not exists image_checked_at timestamptz;

alter table public.blog_posts
  drop constraint if exists blog_posts_status_check;

alter table public.blog_posts
  drop constraint if exists blog_posts_published_at_valid;

alter table public.blog_posts
  add constraint blog_posts_status_check
  check (status in ('draft', 'published', 'unpublished'));

alter table public.blog_posts
  add constraint blog_posts_published_at_valid
  check (status <> 'published' or published_at is not null);

create index if not exists blog_posts_status_updated_idx
  on public.blog_posts (status, updated_at desc);

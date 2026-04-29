alter table public.blog_posts
  alter column title drop not null,
  alter column slug drop not null,
  alter column content_markdown drop not null;

alter table public.blog_posts
  drop constraint if exists blog_posts_publish_required_content;

alter table public.blog_posts
  add constraint blog_posts_publish_required_content
  check (
    status <> 'published'
    or (
      nullif(trim(coalesce(title, '')), '') is not null
      and nullif(trim(coalesce(slug, '')), '') is not null
      and nullif(trim(coalesce(content_markdown, '')), '') is not null
    )
  );

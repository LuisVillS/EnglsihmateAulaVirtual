create table if not exists public.flashcards (
  id uuid primary key default uuid_generate_v4(),
  word text not null,
  meaning text not null,
  image_url text not null,
  accepted_answers jsonb not null default '[]'::jsonb,
  audio_url text,
  audio_r2_key text,
  audio_provider text not null default 'elevenlabs',
  voice_id text,
  elevenlabs_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.flashcards
  add column if not exists accepted_answers jsonb not null default '[]'::jsonb;

alter table public.flashcards
  add column if not exists audio_url text;

alter table public.flashcards
  add column if not exists audio_r2_key text;

alter table public.flashcards
  add column if not exists audio_provider text not null default 'elevenlabs';

alter table public.flashcards
  add column if not exists voice_id text;

alter table public.flashcards
  add column if not exists elevenlabs_config jsonb;

alter table public.flashcards
  add column if not exists updated_at timestamptz not null default now();

update public.flashcards
set accepted_answers = '[]'::jsonb
where accepted_answers is null
   or jsonb_typeof(accepted_answers) <> 'array';

alter table public.flashcards
  drop constraint if exists flashcards_accepted_answers_array_check;

alter table public.flashcards
  add constraint flashcards_accepted_answers_array_check
    check (jsonb_typeof(accepted_answers) = 'array');

create index if not exists flashcards_word_idx
  on public.flashcards (word);

create index if not exists flashcards_meaning_idx
  on public.flashcards (meaning);

do $$
begin
  if to_regclass('public.template_session_flashcards') is not null then
    alter table public.template_session_flashcards
      add column if not exists flashcard_id uuid references public.flashcards (id) on delete restrict;

    alter table public.template_session_flashcards
      alter column word drop not null;

    alter table public.template_session_flashcards
      alter column meaning drop not null;

    alter table public.template_session_flashcards
      alter column image_url drop not null;

    create index if not exists template_session_flashcards_flashcard_idx
      on public.template_session_flashcards (flashcard_id, template_session_id);
  end if;
end $$;

do $$
begin
  if to_regclass('public.session_flashcards') is not null then
    alter table public.session_flashcards
      add column if not exists flashcard_id uuid references public.flashcards (id) on delete restrict;

    alter table public.session_flashcards
      alter column word drop not null;

    alter table public.session_flashcards
      alter column meaning drop not null;

    alter table public.session_flashcards
      alter column image_url drop not null;

    create index if not exists session_flashcards_flashcard_idx
      on public.session_flashcards (flashcard_id, session_id);
  end if;
end $$;

do $$
begin
  if to_regclass('public.template_session_flashcards') is not null then
    insert into public.flashcards (
      word,
      meaning,
      image_url,
      accepted_answers,
      created_at,
      updated_at
    )
    select
      row.word,
      row.meaning,
      row.image_url,
      coalesce(row.accepted_answers, '[]'::jsonb),
      coalesce(row.created_at, now()),
      now()
    from (
      select distinct on (word, meaning, image_url)
        word,
        meaning,
        image_url,
        accepted_answers,
        created_at
      from public.template_session_flashcards
      where flashcard_id is null
        and coalesce(word, '') <> ''
        and coalesce(meaning, '') <> ''
        and coalesce(image_url, '') <> ''
      order by word, meaning, image_url, created_at
    ) row
    where not exists (
      select 1
      from public.flashcards existing
      where existing.word = row.word
        and existing.meaning = row.meaning
        and existing.image_url = row.image_url
    );
  end if;
end $$;

do $$
begin
  if to_regclass('public.session_flashcards') is not null then
    insert into public.flashcards (
      word,
      meaning,
      image_url,
      accepted_answers,
      created_at,
      updated_at
    )
    select
      row.word,
      row.meaning,
      row.image_url,
      coalesce(row.accepted_answers, '[]'::jsonb),
      coalesce(row.created_at, now()),
      now()
    from (
      select distinct on (word, meaning, image_url)
        word,
        meaning,
        image_url,
        accepted_answers,
        created_at
      from public.session_flashcards
      where flashcard_id is null
        and coalesce(word, '') <> ''
        and coalesce(meaning, '') <> ''
        and coalesce(image_url, '') <> ''
      order by word, meaning, image_url, created_at
    ) row
    where not exists (
      select 1
      from public.flashcards existing
      where existing.word = row.word
        and existing.meaning = row.meaning
        and existing.image_url = row.image_url
    );
  end if;
end $$;

do $$
begin
  if to_regclass('public.template_session_flashcards') is not null then
    update public.template_session_flashcards row
    set
      flashcard_id = library.id,
      word = null,
      meaning = null,
      image_url = null,
      accepted_answers = '[]'::jsonb,
      updated_at = now()
    from public.flashcards library
    where row.flashcard_id is null
      and coalesce(row.word, '') <> ''
      and coalesce(row.meaning, '') <> ''
      and coalesce(row.image_url, '') <> ''
      and library.word = row.word
      and library.meaning = row.meaning
      and library.image_url = row.image_url;
  end if;
end $$;

do $$
begin
  if to_regclass('public.session_flashcards') is not null then
    update public.session_flashcards row
    set
      flashcard_id = library.id,
      word = null,
      meaning = null,
      image_url = null,
      accepted_answers = '[]'::jsonb,
      updated_at = now()
    from public.flashcards library
    where row.flashcard_id is null
      and coalesce(row.word, '') <> ''
      and coalesce(row.meaning, '') <> ''
      and coalesce(row.image_url, '') <> ''
      and library.word = row.word
      and library.meaning = row.meaning
      and library.image_url = row.image_url;
  end if;
end $$;

alter table public.flashcards enable row level security;

drop policy if exists "Authenticated users read flashcards library" on public.flashcards;
create policy "Authenticated users read flashcards library" on public.flashcards
  for select to authenticated
  using (true);

drop policy if exists "Admins manage flashcards library" on public.flashcards;
create policy "Admins manage flashcards library" on public.flashcards
  for all to authenticated
  using (
    exists (
      select 1
      from public.admin_profiles admin
      where admin.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.admin_profiles admin
      where admin.id = auth.uid()
    )
  );

-- MEST text editor: shared edits and page reviews.
-- Run once in the Supabase SQL editor. Safe to run again.

create table if not exists public.text_edits (
  key        text primary key,          -- "<pageId>/<blockId>"
  data       jsonb not null,            -- the edit entry (fo, en, approved, doneFo, doneEn, ...)
  updated_at timestamptz not null,
  updated_by text not null default 'unknown'
);

create table if not exists public.page_reviews (
  page_id    text primary key,
  reviewed   boolean not null,
  updated_at timestamptz not null,
  updated_by text not null default 'unknown'
);

alter table public.text_edits   enable row level security;
alter table public.page_reviews enable row level security;

-- Only signed-in users. Nothing is ever deleted: "reverted" and "not reviewed" are newer rows.
drop policy if exists "team read"   on public.text_edits;
drop policy if exists "team insert" on public.text_edits;
drop policy if exists "team update" on public.text_edits;
create policy "team read"   on public.text_edits for select to authenticated using (true);
create policy "team insert" on public.text_edits for insert to authenticated with check (true);
create policy "team update" on public.text_edits for update to authenticated using (true) with check (true);

drop policy if exists "team read"   on public.page_reviews;
drop policy if exists "team insert" on public.page_reviews;
drop policy if exists "team update" on public.page_reviews;
create policy "team read"   on public.page_reviews for select to authenticated using (true);
create policy "team insert" on public.page_reviews for insert to authenticated with check (true);
create policy "team update" on public.page_reviews for update to authenticated using (true) with check (true);

-- Writes go through these functions so an older copy never overwrites a newer one.
create or replace function public.upsert_text_edits(rows jsonb)
returns void language sql security invoker as $$
  insert into public.text_edits (key, data, updated_at, updated_by)
  select r->>'key', r->'data', (r->>'updated_at')::timestamptz, coalesce(r->>'updated_by', 'unknown')
  from jsonb_array_elements(rows) r
  on conflict (key) do update
    set data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    where excluded.updated_at > public.text_edits.updated_at;
$$;

create or replace function public.upsert_page_reviews(rows jsonb)
returns void language sql security invoker as $$
  insert into public.page_reviews (page_id, reviewed, updated_at, updated_by)
  select r->>'page_id', (r->>'reviewed')::boolean, (r->>'updated_at')::timestamptz, coalesce(r->>'updated_by', 'unknown')
  from jsonb_array_elements(rows) r
  on conflict (page_id) do update
    set reviewed = excluded.reviewed, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    where excluded.updated_at > public.page_reviews.updated_at;
$$;

revoke all on function public.upsert_text_edits(jsonb)   from public, anon;
revoke all on function public.upsert_page_reviews(jsonb) from public, anon;
grant execute on function public.upsert_text_edits(jsonb)   to authenticated;
grant execute on function public.upsert_page_reviews(jsonb) to authenticated;

-- Change log: who changed what and when. Append-only, nobody can edit or delete rows.
create table if not exists public.change_log (
  id         text primary key,
  at         timestamptz not null,
  by         text not null,
  by_email   text not null default '',
  page_id    text not null,
  page_title text not null default '',
  block_id   text not null default '',
  kind       text not null check (kind in ('text', 'revert', 'approved', 'inWordPress', 'reviewed')),
  lang       text check (lang in ('fo', 'en')),
  from_text  text not null default '',
  to_text    text not null default ''
);
create index if not exists change_log_at_idx on public.change_log (at desc);

alter table public.change_log enable row level security;
drop policy if exists "team read"   on public.change_log;
drop policy if exists "team insert" on public.change_log;
create policy "team read"   on public.change_log for select to authenticated using (true);
create policy "team insert" on public.change_log for insert to authenticated with check (true);

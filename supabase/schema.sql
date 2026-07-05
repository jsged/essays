-- ============================================================================
-- Essay app schema
-- Run in the Supabase SQL editor: https://app.supabase.com/project/_/sql
-- Idempotent: safe to re-run. Each statement uses IF NOT EXISTS / OR REPLACE /
-- DROP IF EXISTS, so the script can be replayed to converge to the same state.
-- ============================================================================


-- 1. Extensions ---------------------------------------------------------------

-- pgcrypto provides gen_random_uuid(), which the `id` column defaults to.
-- Supabase has this enabled by default, but we make it explicit so the script
-- is portable to a vanilla Postgres install too.
create extension if not exists "pgcrypto";


-- 2. Helper functions --------------------------------------------------------

-- Strip HTML tags from a string. Used by the word_count helper. Returns an
-- empty string for NULL input.
--
-- We replace each tag with a single space (not '') so adjacent tags don't
-- merge the words on either side. E.g. '<p>line one</p><p>line two</p>'
-- becomes ' line one line two ', which trims + counts as 4 words.
--
-- Limitation: HTML entities (e.g. `&amp;`, `&nbsp;`) are NOT decoded — they
-- survive into the word count and the view. CKEditor emits real Unicode, so
-- this rarely matters in practice, but a reader who needs entity-aware
-- counting should reach for a real HTML-to-text converter.
create or replace function public.strip_html(t text)
  returns text
  language sql
  immutable
  parallel safe
as $$
  select regexp_replace(coalesce(t, ''), '<[^>]*>', ' ', 'g')
$$;

-- Count words in a string (HTML stripped, whitespace-collapsed).
--
-- Implementation note: the plan's draft used
--   array_length(regexp_split_to_array(strip_html(...), '\s+'), 1)
-- which is subtly wrong for the empty / whitespace-only case — Postgres'
-- regexp_split_to_array returns a single-element array containing the empty
-- string when nothing matches, so an empty essay would report 1 word.
-- We use regexp_matches + cardinality instead, which only emits a row per
-- non-whitespace run, so empty input correctly yields 0.
create or replace function public.word_count(t text)
  returns integer
  language sql
  immutable
  parallel safe
as $$
  select cardinality(
    array(
      select m[1]
      from regexp_matches(
        trim(coalesce(public.strip_html(t), '')),
        '\S+',
        'g'
      ) as m
    )
  )
$$;

-- Count pages in a paginated essay. A "page" is one segment of HTML between
-- page-break markers (or before the first / after the last). The CKEditor 5
-- `page-break` plugin emits `<div style="page-break-after: always;">…</div>`
-- (and the upcast config also accepts the `page-break-before` variant), so we
-- count those tags and add 1.
--
-- Edge cases:
--   * NULL or empty input → 0.  We deliberately do NOT return 1 here: the
--     dashboard's "X pages" pill would look wrong on a brand-new empty
--     draft (cf. Word, which shows "Page 1 of 1" on a blank document, but
--     our app distinguishes "nothing written yet" from "wrote one page").
--   * HTML of any non-empty length with zero page breaks → 1.
--   * HTML with N page breaks → N + 1.
--
-- Pattern notes:
--   * We use `page-break-(after|before)` rather than the broader CSS3
--     `break-after: page` because the latter overlaps with too much
--     natural prose (it could appear inside an escaped HTML attribute in
--     body text) — CKEditor's emit is the canonical case we need to match.
--   * Case-sensitive on purpose: keeping it tight avoids over-matching
--     `pagebreak` mentions in user body text.
--   * We tolerate any amount of whitespace between `page-break-` and
--     `after|before`, mirroring tolerant browser CSS parsing.
create or replace function public.count_pages(t text)
  returns integer
  language sql
  immutable
  parallel safe
as $$
  select case
    when coalesce(t, '') = '' then 0
    else (
      select count(*)::int + 1
      from regexp_matches(
        t,
        '<[^>]*page-break-\s+(after|before)[^>]*>',
        'g'
      )
    )
  end
$$;


-- 3. The table ----------------------------------------------------------------

create table if not exists public.essays (
  id          uuid primary key default gen_random_uuid(),
  -- `default auth.uid()` is a convenience: the client can insert a row
  -- without ever sending `user_id` and the database stamps it from the
  -- caller's session JWT. The RLS WITH CHECK below is the actual security
  -- boundary — it would still catch a hostile client that explicitly sent
  -- `user_id = 'someone-else'`, because a column DEFAULT only fires when
  -- the column is omitted from the INSERT; an explicit value flows through
  -- and trips the policy. (The default is NOT a security feature — do not
  -- drop it during a refactor: the legitimate-client ergonomic breaks, and
  -- the failure mode for an explicit-value spoof attempt becomes a
  -- confusing RLS error instead of being caught cleanly by the policy.)
  user_id     uuid references auth.users(id) on delete cascade not null
                default auth.uid(),
  question    text not null,
  answer_html text,
  answer_json jsonb,
  status      text not null default 'draft'
                check (status in ('draft', 'finished')),
  word_count  integer generated always as
                (public.word_count(answer_html)) stored,
  -- Stored pages = (# of <div style="page-break-after: always"> markers
  -- in `answer_html`) + 1, or 0 if the essay is null/empty. Computed by
  -- `public.count_pages()` above. The dashboard's "X pages" pill reads
  -- this column directly — see `essay-list.component.ts`.
  page_count  integer generated always as
                (public.count_pages(answer_html)) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Hot-path index: the dashboard's `list()` does
--   .select('*').order('updated_at', { ascending: false })
-- scoped implicitly to the current user by RLS, so (user_id, updated_at desc)
-- is the right composite index.
create index if not exists essays_user_updated_idx
  on public.essays (user_id, updated_at desc);


-- 4. updated_at trigger ------------------------------------------------------

-- A small, generic trigger function so we can reuse it for any future
-- `updated_at`-bearing tables.
create or replace function public.touch_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists essays_touch_updated_at on public.essays;
create trigger essays_touch_updated_at
  before update on public.essays
  for each row execute function public.touch_updated_at();


-- 5. Row Level Security ------------------------------------------------------

alter table public.essays enable row level security;

-- Each user can only see, insert, update, or delete their own rows. The
-- security boundary is the `WITH CHECK` clause on the INSERT and UPDATE
-- policies (and `USING` on SELECT/DELETE/UPDATE) — a hostile client cannot
-- bypass it by sending a forged `user_id` value. The `default auth.uid()`
-- on the column above is purely a convenience for the legitimate case
-- where the client omits `user_id` from the insert.
drop policy if exists "own rows select" on public.essays;
create policy "own rows select" on public.essays
  for select using (auth.uid() = user_id);

drop policy if exists "own rows insert" on public.essays;
create policy "own rows insert" on public.essays
  for insert with check (auth.uid() = user_id);

drop policy if exists "own rows update" on public.essays;
create policy "own rows update" on public.essays
  for update using (auth.uid() = user_id)
               with check (auth.uid() = user_id);

drop policy if exists "own rows delete" on public.essays;
create policy "own rows delete" on public.essays
  for delete using (auth.uid() = user_id);


-- 6. Grants -----------------------------------------------------------------

-- Supabase usually auto-grants these when the table is created via the Table
-- Editor, but running raw SQL via the SQL Editor sometimes leaves them out —
-- which manifests as "permission denied for table essays" with no obvious
-- cause. Make them explicit so the script works either way.
-- `authenticated` only — `anon` is denied by RLS (auth.uid() is null), so no
-- table grant is needed (and Supabase already auto-grants `public` schema
-- usage to `anon` by default).
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.essays to authenticated;


-- 7. Open decisions (per dev/PLAN.md §10) ------------------------------------
--
-- The plan notes `word_count` as an open question: keep the generated column
-- (this schema) or compute it client-side at save time and drop the column.
-- Trade-off:
--   * Generated column — always in sync, but adds a tiny per-write cost and
--     requires the strip_html / word_count helpers to be installed.
--   * Client-side — simpler schema, but the count can drift if a row is
--     inserted from outside the Angular app (Supabase dashboard, SQL editor,
--     another service), and you'd need a separate index for the
--     "by word count" dashboard sort the plan mentions.
-- To switch to client-side, just drop the column:
--   alter table public.essays drop column word_count;
-- and compute the count in essay-edit before persisting.


-- 8. One-shot migrations for an already-deployed table -----------------------
--
-- SKIP THESE ON A FRESH INSTALL — sections 1–7 already include everything
-- below. Only relevant if you previously ran an earlier version of this
-- schema and need to catch up.
--
-- (a) Earlier schema omitted `default auth.uid()` and you now see
--     "new row violates row-level security policy for table 'essays'" on
--     insert. Additive, no row rewrite, no policy recreation needed:
--
--       alter table public.essays alter column user_id set default auth.uid();
--
-- (b) Earlier schema had no `page_count` column. Self-contained recipe:
--     defines `public.count_pages()` (a copy of the body in section 2) and
--     then adds the generated column. `if not exists` keeps it idempotent
--     across re-runs of this migration. Postgres computes the value for
--     every existing row when the column is added; no row rewrite.
--
--       create or replace function public.count_pages(t text)
--         returns integer
--         language sql
--         immutable
--         parallel safe
--       as $$
--         select case
--           when coalesce(t, '') = '' then 0
--           else (
--             select count(*)::int + 1
--             from regexp_matches(
--               t,
--               '<[^>]*page-break-\s+(after|before)[^>]*>',
--               'g'
--             )
--           )
--         end
--       $$;
--
--       alter table public.essays
--         add column if not exists page_count integer generated always as
--           (public.count_pages(answer_html)) stored;

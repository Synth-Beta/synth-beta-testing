-- REVIEW ONLY - do not run until approved.
--
-- Builds the missing venue half of the user-created-entity feature.
-- `public.user_created_artists` and `reviews.user_created_artist_id` exist and
-- work; their venue twins were never created. Both clients nonetheless use
-- them today, so reviewing a show at a venue that is not in `public.venues`
-- fails outright:
--
--   mobile/src/review/submitEventReviewFromForm.ts:187   creates the custom venue,
--   mobile/src/services/eventReviewSubmitService.ts:226  -> insert into user_created_venues  => 404 PGRST205
--   src/services/reviewService.ts:384                    same insert on web
--   src/services/reviewService.ts:639,860,917,971        write reviews.user_created_venue_id => 42703
--
-- and submitEventReviewFromForm.ts:203 hard-errors when neither a catalog venue
-- nor a custom one resolves, so the whole submission is lost.
--
-- Every definition below mirrors what 01 reported for the artist twin on
-- 2026-09-04: FK to auth.users(id), open SELECT + owner-only writes with the
-- (select auth.uid()) init-plan form, blanket grants to anon+authenticated
-- (RLS is what actually gates writes), name + user_id indexes, and the shared
-- update_updated_at_column() trigger.
--
-- Run statement by statement in the Supabase editor. The editor wraps a
-- multi-statement paste in one transaction, and a "Failed to fetch" mid-paste
-- leaves the session holding locks.

-- 1. The table. FK targets auth.users(id), same as user_created_artists —
--    NOT public.users(user_id).
create table if not exists public.user_created_venues (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  name       text        not null,
  image_url  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_created_venues is
  'Venues typed by a user during review submission that are not in public.venues. Mirrors user_created_artists.';

comment on column public.user_created_venues.user_id is
  'User who created this venue record (owner).';

create index if not exists idx_user_created_venues_user_id
  on public.user_created_venues (user_id);

create index if not exists idx_user_created_venues_name
  on public.user_created_venues (name);

-- 2. updated_at trigger — same shared function the artist table uses.
create or replace trigger trigger_user_created_venues_updated_at
  before update on public.user_created_venues
  for each row execute function update_updated_at_column();

-- 3. RLS. Policy names, roles (PUBLIC — no TO clause) and the
--    `(select auth.uid())` wrapping all mirror user_created_artists; the
--    subselect form is what keeps the check an init-plan instead of a per-row
--    call.
alter table public.user_created_venues enable row level security;

create policy user_created_venues_select
  on public.user_created_venues for select
  using (true);

create policy user_created_venues_insert_own
  on public.user_created_venues for insert
  with check ((select auth.uid()) = user_id);

create policy user_created_venues_update_own
  on public.user_created_venues for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_created_venues_delete_own
  on public.user_created_venues for delete
  using ((select auth.uid()) = user_id);

-- Blanket grants match the artist twin exactly (Supabase's default posture on
-- public tables). Writes are gated by the policies above — anon has no
-- auth.uid(), so its INSERT/UPDATE/DELETE never pass WITH CHECK. If the
-- anon TRUNCATE/REFERENCES grants are unwanted, tighten BOTH tables together
-- rather than letting the twins drift.
grant select, insert, update, delete, truncate, references, trigger
  on public.user_created_venues to anon, authenticated;

-- 4. The review column. ON DELETE SET NULL matches reviews_user_created_artist_id_fkey,
--    so removing a custom venue never deletes the review that referenced it.
alter table public.reviews
  add column if not exists user_created_venue_id uuid
  references public.user_created_venues (id) on delete set null;

comment on column public.reviews.user_created_venue_id is
  'Optional: when venue is not in venues table, reference a user-created venue. Exactly one of venue_id or user_created_venue_id when event_id is null.';

create index if not exists idx_reviews_user_created_venue_id
  on public.reviews (user_created_venue_id)
  where user_created_venue_id is not null;


-- ---------------------------------------------------------------------------
-- DEFERRED FROM THIS FILE — both now live in 04_finish_symmetry.REVIEW.sql,
-- which 03's two counts cleared as safe. Kept here only as the rationale.
-- ---------------------------------------------------------------------------
--
-- (a) A venue twin of `reviews_artist_or_user_created_check`. The artist CHECK
--     forces exactly one of artist_id / user_created_artist_id when event_id is
--     null. The matching venue rule is what the clients already enforce in JS
--     (eventReviewSubmitService.ts:323), but adding it as a CHECK would be
--     validated against every existing row, and legacy reviews with no venue at
--     all would abort the ALTER. Count them first:
--
--       select count(*) from public.reviews
--        where event_id is null and venue_id is null;
--
--     If that is 0, this is safe to add:
--
--       alter table public.reviews add constraint reviews_venue_or_user_created_check
--         check (event_id is not null
--                or (venue_id is not null and user_created_venue_id is null)
--                or (venue_id is null and user_created_venue_id is not null));
--
-- (b) Extending `reviews_user_id_artist_or_custom_venue_id_unique`. Despite its
--     name it keys on `venue_id` alone, so once custom venues exist a user can
--     hold two published reviews for the same artist at the same custom venue —
--     the DB-level dedup simply will not see them. Rebuilding it to COALESCE the
--     two venue columns is provably contentless today (no row has
--     user_created_venue_id yet, so COALESCE(venue_id, user_created_venue_id)
--     equals venue_id for every existing row), but it is a drop-and-recreate on a
--     live unique index and is not needed for the feature to work:
--
--       drop index if exists public.reviews_user_id_artist_or_custom_venue_id_unique;
--       create unique index reviews_user_id_artist_or_custom_venue_id_unique
--         on public.reviews (user_id,
--                            coalesce(artist_id, user_created_artist_id),
--                            coalesce(venue_id, user_created_venue_id))
--        where event_id is null and is_draft = false
--          and coalesce(artist_id, user_created_artist_id) is not null
--          and coalesce(venue_id, user_created_venue_id) is not null;

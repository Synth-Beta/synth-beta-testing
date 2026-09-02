-- =============================================================================
-- 11 — Everything still outstanding. Written against verified column names.
-- =============================================================================
--
-- CORRECTION to file 09 section A: I described scene_participants as a user
-- membership table and said "any user can add themselves to any scene or remove
-- anyone from any scene". That was wrong. Its real columns are:
--     id, scene_id, participant_type, artist_id, venue_id, text_value, created_at
-- There is no user_id. It maps scenes to ARTISTS and VENUES — curation data, not
-- user data. So the risk is data integrity (someone corrupting scene composition),
-- not privacy, and it is the same class as the artists/venues policies below, not
-- an authorization hole. The ownership-scoped fix I proposed is impossible here
-- because there is no owner column; admin-gating is the correct shape.
--
-- Safe to lock down: no application code writes this table. The only writers are
-- migration scripts (supabase/venue-dedup-2026-07-12/02 and 04), which run as
-- service role and ignore RLS entirely.

-- -----------------------------------------------------------------------------
-- 1. scene_participants — admin-only writes, public reads unchanged.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can modify scene participants" ON public.scene_participants;

CREATE POLICY "Admins can modify scene participants"
  ON public.scene_participants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u
                 WHERE u.user_id = (SELECT auth.uid())
                   AND u.account_type = 'admin'::account_type))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u
                      WHERE u.user_id = (SELECT auth.uid())
                        AND u.account_type = 'admin'::account_type));

-- -----------------------------------------------------------------------------
-- 2. artists / venues — stop any logged-in user editing or deleting catalogue rows.
--
--   These cascade into events, events_genres and feed personalization, and the
--   venue dedup work from 2026-07-12 assumes these rows are stable.
--
--   INSERT is deliberately left alone — user-contributed artists appear to be
--   intended, and there is a separate user_created_artists table for attribution.
--   Only UPDATE and DELETE are restricted.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Artists can be updated by authenticated users" ON public.artists;
DROP POLICY IF EXISTS "Artists can be deleted by authenticated users" ON public.artists;

CREATE POLICY "Admins can update artists"
  ON public.artists FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u
                 WHERE u.user_id = (SELECT auth.uid())
                   AND u.account_type = 'admin'::account_type));

CREATE POLICY "Admins can delete artists"
  ON public.artists FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u
                 WHERE u.user_id = (SELECT auth.uid())
                   AND u.account_type = 'admin'::account_type));

DROP POLICY IF EXISTS "Venues can be updated by authenticated users" ON public.venues;

CREATE POLICY "Admins can update venues"
  ON public.venues FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u
                 WHERE u.user_id = (SELECT auth.uid())
                   AND u.account_type = 'admin'::account_type));

-- VERIFY 1 + 2 — expect only admin-gated rows for these three tables:
SELECT tablename, policyname, cmd,
       COALESCE(qual, with_check) AS condition
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('scene_participants', 'artists', 'venues')
ORDER BY tablename, cmd;

-- Smoke test after: browse artists/venues logged out and logged in, open a scene
-- page, run a feed refresh. All are reads and should be unaffected.

-- -----------------------------------------------------------------------------
-- 3. Drop the leftover work tables.
--
--   All are RLS-on/fail-closed today, so none is exposed. The reason to drop:
--   users_backup_20260715 is a full copy of your users table including every
--   column file 08 just made private, and it carries an anon SELECT grant. It is
--   safe only while RLS stays enabled — one accidental DISABLE ROW LEVEL SECURITY
--   makes it the file 08 exposure again with none of the column protections.
--
--   Run individually. Confirm sizes first if you want:
--     SELECT relname, pg_size_pretty(pg_total_relation_size(oid))
--     FROM pg_class WHERE relname IN (...);
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.users_backup_20260715;              -- PII copy — do this one first
DROP TABLE IF EXISTS public._venue_canon;
DROP TABLE IF EXISTS public._venue_canon_unique;
DROP TABLE IF EXISTS public.venue_dedup_map;
DROP TABLE IF EXISTS public.event_dedup_map;
DROP TABLE IF EXISTS public._genre_cooc_stg;
DROP TABLE IF EXISTS public._device_token_dedup_2026_08_02_backup;
DROP TABLE IF EXISTS public.genre_merge_map_20260820;
DROP TABLE IF EXISTS public.genre_placeholder_backup_20260820;
-- KEEP public.events_dedup_backup — deliberate audit trail for the 2026-07-17 dedup.

-- VERIFY 3 — should return zero rows:
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('users_backup_20260715', '_venue_canon', '_venue_canon_unique',
                    'venue_dedup_map', 'event_dedup_map', '_genre_cooc_stg',
                    '_device_token_dedup_2026_08_02_backup', 'genre_merge_map_20260820',
                    'genre_placeholder_backup_20260820');

-- ============================================================================
-- FIX (part 2): the artist trigger's 5.8s -- genre_cluster_keys is recomputed
-- once per inserted signal row.
-- 2026-08-21 -- FOR REVIEW. Run statement-by-statement. Nothing here is applied.
-- ============================================================================
--
-- WHERE WE ARE
--   Baseline ....................................... 8489 ms  (57014 timeout)
--   After 02_ STEP 1 (genres expression index) ..... 5849 ms on the STORED
--     payload, but 8356 ms on a REAL sync payload -> STILL 57014. See STEP 4.
--     genre trigger  2934.772 ms -> 50.071 ms   <-- fixed
--     artist trigger 5554.128 ms -> 5798.899 ms <-- this file
--
-- PROOF (EXPLAIN ANALYZE of the exact query auto_generate_genre_signals runs
-- per row, measured 2026-08-21):
--   Limit ................................................ 414.289 ms total
--     Subquery Scan on best_path .... rows=814   actual 41.538..406.593 ms
--       Nested Loop ................. rows=7915  actual  1.853..401.055 ms
--         Index Scan on genre_paths p ........... loops=843
--     Hash Right Join -> keeps rows=3
--     (artists_genres -> genres half: 6.445 ms)
--
--   ~400 of those 414 ms rebuild the WHOLE 814-row view only to discard it down
--   to the 3 rows for one artist. auto_generate_genre_signals is
--   BEFORE INSERT ... FOR EACH ROW on user_preference_signals, and
--   process_spotify_artists_to_signals inserts ~123 rows per sync, so the view
--   is rebuilt ~123 times inside a single statement.
--
--   Its DISTINCT ON (p.genre_id) ... ORDER BY p.genre_id, p.depth means
--   `ck.genre_id = g.id` CANNOT be pushed down -- Postgres must produce every
--   row before it can pick one. No index fixes that. The only fix is to stop
--   executing it per row.
--
-- ============================================================================
-- APPROACH CHANGED after the STEP 0a precheck -- READ THIS
-- ============================================================================
-- The first draft of this file dropped genre_cluster_keys and recreated it as a
-- materialized view. The precheck showed that would have FAILED, because five
-- objects depend on it:
--     analytics_artists_by_cluster, analytics_events_by_cluster,
--     analytics_events_by_umbrella, artist_clusters, event_clusters   (all views)
-- and DROP ... CASCADE would have silently deleted all five. Not acceptable.
--
-- So genre_cluster_keys is NOT touched. Those five consumers keep reading the
-- live view and keep their current freshness. Instead, ONLY the hot path gets a
-- materialized snapshot.
--
-- The snapshot is defined as `SELECT * FROM public.genre_cluster_keys`, NOT as a
-- copy of the view's SQL. That matters: the view stays the single source of
-- truth, so the two can never drift apart if the taxonomy logic is edited later.
-- Refreshing simply re-runs the view.
--
-- Submit each numbered statement SEPARATELY (one editor run each).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1. Materialized snapshot of the view, for the trigger only. 814 rows.
-- Populated immediately (CREATE ... AS defaults to WITH DATA).
-- ----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW public.genre_cluster_keys_mv AS
SELECT * FROM public.genre_cluster_keys;


-- ----------------------------------------------------------------------------
-- STEP 2. The whole point: turn the per-row join into a single index seek.
--
-- UNIQUE is safe and self-documenting -- genre_cluster_keys is built with
-- DISTINCT ON (p.genre_id), so genre_id is unique by construction. It is also
-- REQUIRED for REFRESH ... CONCURRENTLY in STEP 4.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX genre_cluster_keys_mv_genre_id_uidx
  ON public.genre_cluster_keys_mv (genre_id);


-- ----------------------------------------------------------------------------
-- STEP 3. Point the trigger function at the snapshot.
--
-- This is the CURRENT definition of auto_generate_genre_signals, verbatim, with
-- exactly TWO characters' worth of change: both
--     LEFT JOIN public.genre_cluster_keys ck
-- become
--     LEFT JOIN public.genre_cluster_keys_mv ck
-- (once in the 'artist' branch -- the hot one -- and once in the 'event' branch,
-- which has the identical problem on any event-entity signal insert).
--
-- Nothing else is altered: same SECURITY DEFINER, same search_path, same
-- EXCEPTION WHEN OTHERS THEN NULL swallowing, same ORDER BY, same LIMIT 1.
-- Run as ONE statement.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_generate_genre_signals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_genre_name text;
  v_cluster_slug text;
  v_genre_id uuid;
BEGIN
  -- Ensure context is never NULL for assignments below
  NEW.context := COALESCE(NEW.context, '{}'::jsonb);

  IF NEW.genre IS NOT NULL THEN
    BEGIN
      v_genre_name := public.resolve_genre_to_canonical(NEW.genre);
      IF v_genre_name IS NOT NULL THEN
        NEW.genre := v_genre_name;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN NEW;
  END IF;

  IF NEW.entity_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.entity_type = 'artist' THEN
    BEGIN
      SELECT g.name, ck.cluster_path_slug, g.id
      INTO v_genre_name, v_cluster_slug, v_genre_id
      FROM public.artists_genres ag
      JOIN public.genres g ON g.id = ag.genre_id
      LEFT JOIN public.genre_cluster_keys_mv ck ON ck.genre_id = g.id
      WHERE ag.artist_id = NEW.entity_id
      ORDER BY ck.cluster_path_slug NULLS LAST
      LIMIT 1;
      IF v_genre_name IS NOT NULL THEN
        NEW.genre := v_genre_name;
        IF v_cluster_slug IS NOT NULL THEN
          NEW.context := NEW.context || jsonb_build_object('cluster_path_slug', v_cluster_slug);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  ELSIF NEW.entity_type = 'event' THEN
    BEGIN
      SELECT g.name, ck.cluster_path_slug, g.id
      INTO v_genre_name, v_cluster_slug, v_genre_id
      FROM public.events_genres eg
      JOIN public.genres g ON g.id = eg.genre_id
      LEFT JOIN public.genre_cluster_keys_mv ck ON ck.genre_id = g.id
      WHERE eg.event_id = NEW.entity_id
      ORDER BY ck.cluster_path_slug NULLS LAST
      LIMIT 1;
      IF v_genre_name IS NOT NULL THEN
        NEW.genre := v_genre_name;
        IF v_cluster_slug IS NOT NULL THEN
          NEW.context := NEW.context || jsonb_build_object('cluster_path_slug', v_cluster_slug);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$function$;


-- ----------------------------------------------------------------------------
-- STEP 4. VERIFY. Rolls back, commits nothing.
-- Target: artist trigger 5798 ms -> low hundreds of ms or better.
-- If it is still seconds, STOP and send me the output -- something other than
-- the view is the cost and I will re-measure rather than guess again.
--
-- !! THIS MEASUREMENT UNDERSTATES THE REAL COST -- READ BEFORE TRUSTING IT !!
-- `profile_data = profile_data` re-fires the triggers against the STORED
-- 2026-07-02 payload: 130 artists of which only 65 carry genres. A REAL sync
-- writes 123 artists of which 105 carry genres (backfillArtistGenresFromDb in
-- api/spotify/sync-profile.ts now fills them from our artists table), which
-- means more genre signal rows and more per-row trigger work.
--
-- Measured 2026-08-21, both AFTER 02_ STEP 1 was applied:
--     stored July payload  (65 tagged) via this EXPLAIN .... 5849 ms  PASSES
--     real fresh payload  (105 tagged) via actual upsert .... 8356 ms  57014 FAILS
--
-- So this file is NOT optional headroom -- the sync is still broken without it.
-- Treat STEP 4 as a directional check only. The authoritative test is replaying
-- a real sync (fetch from Spotify -> backfill genres -> upsert) and confirming
-- the upsert returns no error.
-- ----------------------------------------------------------------------------
BEGIN;
  SET LOCAL statement_timeout = '120s';

  EXPLAIN (ANALYZE, BUFFERS, TIMING)
  UPDATE public.streaming_profiles
  SET profile_data = profile_data
  WHERE user_id = '690d27ae-d803-4ff5-a381-162f8863dd9b'
    AND service_type = 'spotify';
ROLLBACK;


-- ============================================================================
-- STEP 5. REFRESH WIRING -- REQUIRED. Do not consider this done without it.
-- ============================================================================
-- A matview does not update itself. If the genre taxonomy changes and this is
-- never refreshed, new genres silently get NO cluster_path_slug in their signal
-- context -- a quiet personalisation regression, not a visible error.
--
-- It must be refreshed after anything that changes genre_paths,
-- genre_taxonomy_exclude, genres, or genre_marginals.
--
-- ==> SUPERSEDED BY 04_genre_cache_refresh.sql. Do the wiring there, not here.
--
-- Two things this section originally claimed turned out to be wrong; recorded so
-- they do not get repeated:
--
--  1. It pointed at public.genre_cooc_ingest_batch as the place to hook the
--     refresh, on the basis that it was the only function mentioning
--     genre_marginals. Reading it showed it only READS genre_marginals
--     (INNER JOIN ... m.artist_count >= v_min) -- it never refreshes it. In fact
--     NOTHING refreshes genre_marginals: no function, no pg_cron job (all 7 were
--     listed and checked), and no REFRESH anywhere in the repo. So 04_ creates
--     the refresh path rather than hooking an existing one.
--
--  2. It said REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run inside a
--     transaction block. That restriction applies to CREATE INDEX CONCURRENTLY
--     (which is what actually failed in 02_), not to REFRESH -- REFRESH builds a
--     new version and diffs it, which is fine inside one transaction.
--
-- If you just want the snapshot up to date right now, this single statement is
-- still valid on its own:
-- ----------------------------------------------------------------------------
REFRESH MATERIALIZED VIEW CONCURRENTLY public.genre_cluster_keys_mv;


-- ----------------------------------------------------------------------------
-- NOTED, NOT FIXED HERE:
--
--  * artist_clusters and event_clusters are views over the LIVE
--    genre_cluster_keys, so they inherit the same full-rebuild cost. That is
--    fine for the analytics_* views (occasional queries), but if either is used
--    on a user-facing path they will be slow for the same reason. Worth checking
--    separately -- out of scope for the sync timeout.
--
--  * idx_artists_lower_name (02_ STEP 3) produced no measurable gain
--    (5554 -> 5799 ms = noise) because the view rebuild dominated. Once STEP 4
--    shows the artist trigger in the low hundreds of ms, re-judge it: if the
--    remaining time is not in the ~123 lower(name) LATERAL lookups, drop it --
--    it costs write time on every artists insert during sync.
--        DROP INDEX IF EXISTS public.idx_artists_lower_name;
-- ----------------------------------------------------------------------------

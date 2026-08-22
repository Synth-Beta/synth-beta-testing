-- ============================================================================
-- 04 -- Refresh wiring for genre_cluster_keys_mv (created in 03_).
-- 2026-08-21 -- FOR REVIEW. Run statement-by-statement. Nothing here is applied.
-- ============================================================================
--
-- WHY THIS FILE EXISTS
--   03_ added public.genre_cluster_keys_mv, a materialized snapshot of the
--   genre_cluster_keys view, because the view was being rebuilt once per
--   inserted signal row (~123x per sync). That took the Spotify sync from
--   8356 ms / FAILED to 3107 ms / SUCCEEDED.
--
--   A matview does not update itself. If the genre taxonomy changes and this is
--   never refreshed, artists in the new/changed genres silently get NO
--   cluster_path_slug on their preference signals. There is no error: the join
--   just returns NULL, and auto_generate_genre_signals wraps everything in
--   `EXCEPTION WHEN OTHERS THEN NULL` anyway. It degrades personalisation
--   quietly, which is the worst failure mode to leave unwired.
--
-- WHAT I EXPECTED TO FIND, AND DIDN'T
--   The plan was to append the refresh to whatever already refreshes
--   genre_marginals (the matview genre_cluster_keys reads). There is no such
--   thing:
--     * pg_proc search for '%genre_marginals%' returns exactly ONE function,
--       genre_cooc_ingest_batch -- and it only READS it
--       (INNER JOIN public.genre_marginals m ...), it does not refresh it.
--     * Repo-wide search for 'REFRESH MATERIALIZED VIEW' finds no genre refresh
--       at all (only an unrelated comment about analytics_daily_mv).
--
--   So genre_marginals is refreshed manually/ad-hoc, consistent with the rest of
--   this taxonomy having been built directly in the SQL editor. That is fine --
--   it just means the refresh has to be made explicit rather than hooked onto
--   something existing.
--
-- REFRESH WHENEVER ANY OF THESE CHANGE:
--   genre_paths (22,436) | genre_marginals (2,807, matview)
--   genre_taxonomy_exclude (95) | genres (2,868)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 0a (read-only). Is there a pg_cron job doing this already? My earlier
-- check only looked at pg_proc, and pg_cron stores RAW SQL in cron.job.command,
-- so a scheduled `REFRESH MATERIALIZED VIEW genre_marginals;` would not have
-- shown up. Check before adding a second, competing schedule.
-- ----------------------------------------------------------------------------
SELECT jobid, schedule, jobname, command
FROM cron.job
ORDER BY jobid;


-- ----------------------------------------------------------------------------
-- STEP 0b (read-only). Can genre_marginals be refreshed CONCURRENTLY?
-- That requires a UNIQUE index on it. The query plan showed an
-- "Index Scan using idx_genre_marginals_pk", but that name is a convention, not
-- proof of uniqueness -- so check rather than assume. STEP 1 is written to be
-- correct either way.
-- ----------------------------------------------------------------------------
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'genre_marginals';


-- ----------------------------------------------------------------------------
-- STEP 1. One entry point that refreshes both, in the correct order.
--
-- Ordering is not cosmetic: genre_cluster_keys reads genre_marginals, so
-- refreshing the snapshot BEFORE genre_marginals would capture stale data and
-- look like it worked. Wrapping both in one function makes that impossible to
-- get wrong at the call site.
--
-- Both use CONCURRENTLY, and both are entitled to:
--   * genre_marginals ....... STEP 0b confirmed idx_genre_marginals_pk is a
--                             UNIQUE btree on (genre_id).
--   * genre_cluster_keys_mv . 03_ STEP 2 created
--                             genre_cluster_keys_mv_genre_id_uidx for exactly this.
-- CONCURRENTLY avoids the ACCESS EXCLUSIVE lock, so readers are never blocked.
-- (Both are small enough that a plain REFRESH would also be sub-second -- this
-- is about not stalling the sync hot path if a refresh lands mid-sync.)
--
-- ON THE TRANSACTION-BLOCK QUESTION: the restriction I flagged in 03_ applies to
-- CREATE INDEX CONCURRENTLY, which genuinely cannot run inside a transaction.
-- REFRESH MATERIALIZED VIEW CONCURRENTLY is not in that category -- it builds a
-- new version and diffs it, all doable in one transaction -- so it is expected
-- to be fine inside a plpgsql function. If your Postgres disagrees and STEP 3
-- errors with a transaction-block complaint, just drop both CONCURRENTLY
-- keywords and re-run this statement; at 2,807 and 814 rows the exclusive lock
-- is sub-second and nothing else about the fix changes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_genre_taxonomy_caches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. marginals first -- genre_cluster_keys joins it with artist_count >= 5
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.genre_marginals;

  -- 2. then the snapshot the hot trigger path reads
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.genre_cluster_keys_mv;
END;
$function$;

COMMENT ON FUNCTION public.refresh_genre_taxonomy_caches() IS
  'Refreshes genre_marginals then genre_cluster_keys_mv, in that order (the '
  'latter reads the former). Call after ANY change to genre_paths, genres, '
  'genre_taxonomy_exclude or artists_genres. genre_cluster_keys_mv feeds '
  'auto_generate_genre_signals on the Spotify sync hot path -- if it goes '
  'stale, new genres silently lose cluster_path_slug with no error raised.';


-- ----------------------------------------------------------------------------
-- STEP 2. Lock it down. This is SECURITY DEFINER, so do not leave it callable
-- by anon/authenticated -- matching what
-- security-review-2026-07-10/04_revoke_anon_execute_privileged_functions.sql
-- already did for this class of function (genre_cooc_ingest_batch included).
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.refresh_genre_taxonomy_caches() FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- STEP 3. Run it once now, to prove it works end to end.
-- ----------------------------------------------------------------------------
SELECT public.refresh_genre_taxonomy_caches();


-- ----------------------------------------------------------------------------
-- STEP 4 (OPTIONAL but recommended). Schedule it.
--
-- The taxonomy is rebuilt by hand today, so the realistic failure mode is
-- "someone edits genres and forgets to refresh". A weekly job is cheap
-- insurance -- the whole refresh is well under a second at these row counts.
--
-- STEP 0a confirmed there is NO existing job doing this -- the 7 scheduled jobs
-- are daily-event-summary-notifications, event-reminders, feed-cache-drain,
-- feed-cache-prewarm, ops-health-alerts, event-popularity-refresh and
-- notification-queue-release. None touches the genre taxonomy. Safe to add.
--
-- Sunday 08:00 UTC, deliberately clear of the 09:30 sync-events cron and of the
-- every-minute feed-cache-drain / every-3-minute feed-cache-prewarm jobs.
-- ----------------------------------------------------------------------------
SELECT cron.schedule(
  'refresh-genre-taxonomy-caches',
  '0 8 * * 0',
  $$SELECT public.refresh_genre_taxonomy_caches();$$
);


-- ----------------------------------------------------------------------------
-- AND: add this to the manual runbook.
-- Any time you rebuild the genre taxonomy by hand, finish with:
--     SELECT public.refresh_genre_taxonomy_caches();
-- ----------------------------------------------------------------------------

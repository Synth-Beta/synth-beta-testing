-- ============================================================================
-- FIX: streaming_profiles upsert exceeds the 8s statement_timeout (57014)
-- 2026-08-21  -- FOR REVIEW. Run statement-by-statement. Nothing here is applied.
-- ============================================================================
--
-- MEASURED BEFORE (EXPLAIN ANALYZE of a no-op profile_data update, rolled back):
--   Update on streaming_profiles ......................  0.160 ms
--   Trigger trigger_process_spotify_artists_to_signals: 5554.128 ms  calls=1
--   Trigger trigger_process_spotify_genres_to_signals:  2934.772 ms  calls=1
--   Execution Time ....................................  8489.204 ms
--   statement_timeout .................................  8000 ms   -> 57014
--
-- The row write is 0.16ms. 100% of the cost is per-row work inside the triggers
-- that cannot use an index. Nothing here changes app behaviour or reduces how
-- much Spotify data is stored -- these are pure lookup-path fixes.
--
-- Tables involved are all small: genres 2,868 | genre_cluster_keys 814 |
-- artists 53,191 | artists_genres 81,375 | user_preference_signals 3,350.
-- 8.5s over data this size is pathological, which is why "fetch less from
-- Spotify" is the wrong lever -- it would only move the threshold, and the
-- cascade is already over budget on the stored 2026-07-02 payload.
--
-- RUN ORDER: 1, 2, 3, then VERIFY. Steps 1-3 are independent and each is safe
-- to run alone. Do NOT paste the whole file at once -- the Supabase web editor
-- wraps multi-statement pastes in a transaction, and a "Failed to fetch" then
-- leaves an orphaned session holding locks on these tables.
--
-- !! WHY THESE ARE *NOT* "CONCURRENTLY" !!
-- The Supabase web editor wraps every submission in a transaction, and
-- CREATE INDEX CONCURRENTLY is illegal inside one:
--     ERROR: 25001: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
-- (Hit and confirmed on 2026-08-21.) So steps 1-3 below are plain CREATE INDEX,
-- which is the right call at these row counts anyway: genres 2,868 /
-- genre_cluster_keys 814 / artists 53,191. A plain build takes an ACCESS
-- EXCLUSIVE lock for well under a second on tables this small.
-- Do NOT copy this pattern onto events (277,781 rows) -- that one needs
-- CONCURRENTLY, run from psql outside a transaction.
--
-- Submit each numbered statement SEPARATELY (one editor run each).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 0 (read-only precheck). resolve_genre_to_canonical is declared STABLE
-- and calls normalize_genre_key. For STEP 1's index to be usable, and for that
-- STABLE declaration to be honest, normalize_genre_key must be IMMUTABLE (or at
-- least STABLE). Expect 'i' or 's'. If it comes back 'v' (VOLATILE), stop and
-- tell me -- the index will be ignored and that is a separate bug.
-- ----------------------------------------------------------------------------
SELECT proname, provolatile   -- i = immutable, s = stable, v = volatile
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'normalize_genre_key';


-- ----------------------------------------------------------------------------
-- STEP 1. Make the OR branch in resolve_genre_to_canonical indexable.
--
-- The function reads:
--     WHERE g.normalized_key = normalize_genre_key(raw)
--        OR replace(g.normalized_key,' ','') = replace(normalize_genre_key(raw),' ','')
--
-- replace() wraps the COLUMN on the second branch, so genres_normalized_key_key
-- cannot be used and the planner falls back to a full seq scan of genres --
-- re-evaluating replace() on all 2,868 rows -- on EVERY call. It is called once
-- per genre string per artist per time range by process_spotify_genres_to_signals,
-- and again by auto_generate_genre_signals for each signal row it inserts:
-- roughly 180+ full scans per sync.
--
-- This expression index matches the second branch exactly, so the planner can
-- satisfy the OR with a BitmapOr of two index scans instead. No function change,
-- no behaviour change.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_genres_normalized_key_nospace
  ON public.genres (replace(normalized_key, ' ', ''));


-- ----------------------------------------------------------------------------
-- STEP 2. *** WITHDRAWN -- DO NOT RUN. genre_cluster_keys is a VIEW. ***
--
--     ERROR: 42809: cannot create index on relation "genre_cluster_keys"
--     DETAIL: This operation is not supported for views.
--
-- I originally read "pg_indexes returns no rows for genre_cluster_keys" as
-- "a table with no indexes". It actually means it is not a table at all, so
-- there is nothing here to index and this step is void.
--
-- The underlying concern is NOT void, and may be bigger than a missing index:
-- auto_generate_genre_signals is BEFORE INSERT ... FOR EACH ROW on
-- user_preference_signals, and process_spotify_artists_to_signals inserts ~123
-- rows per sync, so
--     LEFT JOIN genre_cluster_keys ck ON ck.genre_id = g.id
-- re-executes that view's whole query ~123 times inside one statement. If the
-- view computes cluster paths via a recursive CTE or a rollup, that alone could
-- be most of the artist trigger's 5554ms.
--
-- Superseded by 03_*.sql once the view definition is known: the fix is either
-- indexing the BASE tables the view reads, or removing the per-row join.
-- ----------------------------------------------------------------------------
-- (intentionally no statement here)


-- ----------------------------------------------------------------------------
-- STEP 3. The artist trigger's name resolution (its 5.5s half).
--
-- process_spotify_artists_to_signals resolves each artist with:
--     LEFT JOIN LATERAL (
--       SELECT a.id FROM public.artists a
--       WHERE lower(a.name) = lower(art.value->>'name')
--       ORDER BY a.created_at NULLS LAST LIMIT 1
--     ) matched ON true
--
-- ~123 times per sync. Note carefully: the raw seq scan of artists is cheap
-- (the table is small and cached) -- what is expensive is evaluating lower()
-- across all 53,191 rows on each of the 123 lookups. A plain index on name
-- cannot serve lower(name); it needs this functional index to match the
-- predicate exactly.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_artists_lower_name
  ON public.artists (lower(name));


-- ----------------------------------------------------------------------------
-- VERIFY. Re-run the same measurement. Rolls back, commits nothing.
-- Expect both Trigger lines to drop by orders of magnitude and Execution Time
-- to land far under 8000 ms. If it is merely close to 8000, tell me rather than
-- shipping it -- a marginal pass will regress as artists/genres grow, and the
-- next step is making the triggers set-based instead of per-row.
-- ----------------------------------------------------------------------------
BEGIN;
  SET LOCAL statement_timeout = '120s';

  EXPLAIN (ANALYZE, BUFFERS, TIMING)
  UPDATE public.streaming_profiles
  SET profile_data = profile_data
  WHERE user_id = '690d27ae-d803-4ff5-a381-162f8863dd9b'
    AND service_type = 'spotify';
ROLLBACK;


-- ----------------------------------------------------------------------------
-- NOT DONE HERE, deliberately -- flagged for a later pass:
--
--  * genre_cluster_keys having no primary key is a data-integrity smell, not a
--    performance one. Adding one is a separate decision (it could fail on
--    existing duplicate rows), so it is not bundled into a timeout fix.
--
--  * process_spotify_genres_to_signals is a nested PL/pgSQL loop
--    (time_range -> artist -> genre) doing one function call per genre. Even
--    fully indexed that is inherently per-row; the durable fix is a single
--    set-based INSERT ... SELECT over jsonb_array_elements. Worth doing if the
--    VERIFY number above is not comfortably under budget, but it is a real
--    rewrite with real regression risk and should not ride along with indexes.
--
--  * Raising statement_timeout for service_role would make the symptom vanish
--    without fixing anything, and would let a 9s trigger cascade become a 30s
--    one. Explicitly rejected.
-- ----------------------------------------------------------------------------

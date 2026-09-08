-- =============================================================================
-- READ-ONLY. Nothing here changes anything. Run it before dropping anything.
-- =============================================================================
-- Repo grep cannot answer this: genre_cluster_keys, get_genres_under_umbrella
-- and the taxonomy build itself have no definition checked into the repo (they
-- predate it / were built by hand), so the only source of truth is the catalog.
--
-- ALREADY ESTABLISHED, do not re-litigate:
--   * genre_paths + genre_marginals + genre_cluster_keys_mv are LOAD-BEARING.
--     genre_cluster_keys_mv feeds auto_generate_genre_signals on the Spotify
--     sync hot path; it exists because rebuilding the view per-row caused a
--     57014 timeout (streaming-sync-timeout-2026-08-21). Five analytics views
--     read genre_cluster_keys. KEEP the 'refresh-genre-taxonomy-caches' cron.
--   * getUpcomingEventsForGenreUmbrella (TS) has zero callers in web, mobile,
--     backend or api — safe to delete in code regardless of what runs here.
--
-- OPEN QUESTIONS this answers:
--   * Does anything still read genre_similarity_edges (22,190 rows)?
--   * Is genre_cooccurrence_pairs (0 rows) safe to drop?
--   * Does get_genres_under_umbrella still exist, and does anything call it?
-- =============================================================================

-- ── 1. THE DECISIVE ONE: has anything actually READ these since stats reset? ──
-- seq_scan + idx_scan at or near 0 on a table with rows = nothing reads it.
-- Check stats_reset is old enough to mean something before trusting a 0.
SELECT
  relname,
  n_live_tup            AS rows,
  seq_scan,
  idx_scan,
  seq_scan + COALESCE(idx_scan, 0) AS total_reads,
  last_seq_scan,
  last_idx_scan
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname IN (
    'genres','genre_paths','genre_parent','genre_similarity_edges',
    'genre_cooccurrence_pairs','genre_marginals','genre_cluster_keys_mv',
    'genre_idf','genre_taxonomy_exclude','artists_genres'
  )
ORDER BY total_reads;

SELECT stats_reset AS stats_collected_since FROM pg_stat_database WHERE datname = current_database();


-- ── 2. Every FUNCTION whose body mentions a taxonomy object ──────────────────
SELECT
  p.oid::regprocedure AS function_signature,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE '' END AS security,
  (SELECT string_agg(t, ', ') FROM unnest(ARRAY[
     'genre_paths','genre_parent','genre_similarity_edges',
     'genre_cooccurrence_pairs','genre_marginals','genre_cluster_keys'
   ]) t WHERE p.prosrc ~* t) AS mentions
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosrc ~* '(genre_paths|genre_parent|genre_similarity_edges|genre_cooccurrence_pairs|genre_marginals|genre_cluster_keys)'
ORDER BY 1;


-- ── 3. Every VIEW / MATVIEW whose definition mentions one ───────────────────
SELECT
  c.relkind::text AS kind,      -- v = view, m = materialized view
  n.nspname || '.' || c.relname AS object,
  (SELECT string_agg(t, ', ') FROM unnest(ARRAY[
     'genre_paths','genre_parent','genre_similarity_edges',
     'genre_cooccurrence_pairs','genre_marginals','genre_cluster_keys'
   ]) t WHERE pg_get_viewdef(c.oid) ~* t) AS mentions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('v','m')
  AND pg_get_viewdef(c.oid) ~* '(genre_paths|genre_parent|genre_similarity_edges|genre_cooccurrence_pairs|genre_marginals|genre_cluster_keys)'
ORDER BY 2;


-- ── 4. What a DROP would take with it (run per candidate table) ─────────────
-- Anything listed here dies under DROP ... CASCADE. This is the check that
-- saved genre_cluster_keys in 2026-08-21 — five analytics views depended on it
-- and CASCADE would have silently deleted all of them.
SELECT DISTINCT
  dependent.relkind::text AS kind,
  dependent.relname       AS would_also_be_dropped
FROM pg_depend d
JOIN pg_rewrite r    ON r.oid = d.objid
JOIN pg_class dependent ON dependent.oid = r.ev_class
JOIN pg_class source    ON source.oid = d.refobjid
JOIN pg_namespace n     ON n.oid = source.relnamespace
WHERE n.nspname = 'public'
  AND source.relname IN ('genre_similarity_edges','genre_cooccurrence_pairs')
  AND dependent.relname <> source.relname;


-- ── 5. Does the umbrella RPC still exist, and is it reachable? ──────────────
-- If it exists and anon/authenticated can EXECUTE it, it is reachable from a
-- client even though no app code calls it.
SELECT
  p.oid::regprocedure AS function_signature,
  has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_genres_under_umbrella';


-- ── 6. Confirm the load-bearing cron job is still scheduled ────────────────
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;

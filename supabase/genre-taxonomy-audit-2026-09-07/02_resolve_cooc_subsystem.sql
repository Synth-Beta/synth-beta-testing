-- =============================================================================
-- READ-ONLY except for the final REVOKE (clearly marked). Round 2 of the audit.
-- =============================================================================
-- SETTLED BY 01:
--   KEEP  genre_paths      — get_calendar_events + get_personalized_feed_v3 read
--                            it directly, on top of the genre_cluster_keys chain.
--   KEEP  genre_marginals  — genre_cluster_keys (view) reads it.
--   KEEP  the 'refresh-genre-taxonomy-caches' cron. Load-bearing.
--   DEAD  genre_similarity_edges (22,190 rows) — in NO function body, NO view
--         depends on it (01 query 4 returned nothing), no repo caller.
--
-- STILL OPEN: the cooccurrence subsystem. genre_cooc_ingest_batch() mentions
-- genre_marginals, which IS load-bearing. If it WRITES marginals the subsystem
-- stays; if it only READS it, the whole thing can go. Q2 below settles that.
-- =============================================================================

-- ── 1. The decisive read counts. 01's version didn't come back. ─────────────
-- stats_reset is NULL, which means these counters are ALL-TIME for this
-- database — never reset. A 0 here is therefore very strong evidence, not an
-- artifact of a recent reset.
SELECT
  relname,
  n_live_tup                       AS rows,
  seq_scan,
  COALESCE(idx_scan, 0)            AS idx_scan,
  seq_scan + COALESCE(idx_scan, 0) AS total_reads,
  n_tup_ins, n_tup_upd, n_tup_del
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname IN (
    'genres','genre_paths','genre_parent','genre_similarity_edges',
    'genre_cooccurrence_pairs','genre_marginals','genre_idf'
  )
ORDER BY total_reads;


-- ── 2. Does genre_cooc_ingest_batch WRITE genre_marginals, or only read it? ─
-- Look for INSERT/UPDATE/REFRESH against genre_marginals in these bodies.
SELECT p.oid::regprocedure AS fn, p.prosrc
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('genre_cooc_ingest_batch','genre_cooc_finalize');


-- ── 3. What is genre_marginals actually built from? ─────────────────────────
-- If its definition reads genre_cooccurrence_pairs, the subsystem is wired into
-- the live chain and none of it can be dropped.
SELECT pg_get_viewdef('public.genre_marginals'::regclass, true) AS genre_marginals_definition;


-- ── 4. Is anything scheduled to run the cooc pipeline? ─────────────────────
SELECT jobname, schedule, active, command
FROM cron.job
WHERE command ILIKE '%cooc%' OR command ILIKE '%similarity%'
ORDER BY jobname;


-- =============================================================================
-- ── 5. THE ONE WRITE IN THIS FILE. Safe to run now, independent of the above.
-- =============================================================================
-- get_genres_under_umbrella is EXECUTE-able by anon and authenticated (01 q5)
-- while having zero callers — its only one, getUpcomingEventsForGenreUmbrella,
-- was deleted from packages/synth-shared on 2026-09-07. It is not SECURITY
-- DEFINER, so RLS still applies and this is hardening rather than a live hole,
-- but it matches what security-review-2026-07-10/04 did for this whole class of
-- function and was simply missed at the time.
--
-- Reversible: GRANT EXECUTE ... TO authenticated; restores it.
REVOKE EXECUTE ON FUNCTION public.get_genres_under_umbrella(text, integer) FROM anon, authenticated;

-- Verify: both columns should now read false.
SELECT
  p.oid::regprocedure                                   AS function_signature,
  has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_genres_under_umbrella';

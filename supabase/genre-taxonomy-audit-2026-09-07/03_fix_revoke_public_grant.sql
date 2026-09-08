-- =============================================================================
-- REVOKE FROM anon does nothing when the grant came from PUBLIC
-- =============================================================================
-- FOUND LIVE 2026-09-07: after running
--     REVOKE EXECUTE ON FUNCTION public.get_genres_under_umbrella(text,integer)
--       FROM anon, authenticated;
-- has_function_privilege() still reported TRUE for both roles.
--
-- WHY: Postgres grants EXECUTE on every new function to PUBLIC by default.
-- anon and authenticated inherit it from there, so revoking from those two
-- roles by name removes a privilege they were never separately granted. The
-- revoke succeeds, reports no error, and changes nothing.
--
-- A function still carrying its default ACL has proacl IS NULL. That is the
-- tell — query 1 below surfaces it.
--
-- ⚠️  THIS LIKELY AFFECTS supabase/security-review-2026-07-10/04, which used
--     `REVOKE EXECUTE ... FROM anon;` on ~15 privileged SECURITY DEFINER
--     functions and is recorded as applied+verified. If those functions had
--     default ACLs, that hardening never took effect. Query 2 re-checks the
--     whole list. DO NOT blanket-revoke from PUBLIC based on it — some entries
--     (e.g. refresh_user_preference_signals) may be legitimately called by
--     signed-in users. Read the results first.
-- =============================================================================

-- ── 1. Where does the privilege actually come from? ─────────────────────────
-- proacl IS NULL            → default ACL, PUBLIC has EXECUTE
-- proacl contains '=X/'     → an explicit grant to PUBLIC (the empty grantee)
-- proacl contains 'anon=X/' → an explicit grant to anon
SELECT
  p.oid::regprocedure AS function_signature,
  p.prosecdef         AS security_definer,
  p.proacl            AS acl,
  p.proacl IS NULL    AS has_default_acl_so_public_can_execute,
  has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_genres_under_umbrella';


-- ── 2. Re-check the 2026-07-10 list. Did that hardening actually land? ─────
-- Any row with anon_can_execute = true is still exposed despite that migration.
--
-- NOTE: an earlier version of this query joined pg_namespace and still returned
-- every pg_catalog builtin (boolin, int4eq, ...). Pinning the namespace with
-- pronamespace = 'public'::regnamespace is exact and cannot leak like that.
SELECT
  p.oid::regprocedure AS function_signature,
  p.prosecdef         AS security_definer,
  p.proacl            AS acl,
  has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_can_execute
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'genre_cooc_begin_build','genre_cooc_finalize','genre_cooc_ingest_batch',
    'recalculate_all_passport_data','refresh_analytics_daily',
    'refresh_user_cluster_affinity','refresh_user_preference_signals',
    'refresh_user_recommendations','send_daily_event_summary_notifications',
    'send_event_reminders','trigger_aggregate_analytics','verify_genre_coverage'
  )
ORDER BY anon_can_execute DESC, 1;


-- =============================================================================
-- ── 3. THE FIX, for this one function only. ────────────────────────────────
-- =============================================================================
-- Scoped deliberately to get_genres_under_umbrella: it has ZERO callers (its
-- only one, getUpcomingEventsForGenreUmbrella, was deleted from
-- packages/synth-shared on 2026-09-07), so removing PUBLIC's grant cannot break
-- anything. Everything in query 2 needs a per-function decision first.
--
-- Revoking from PUBLIC is what actually removes it. anon/authenticated are
-- named as well to clear any explicit grant that also exists.
-- Reversible: GRANT EXECUTE ON FUNCTION ... TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_genres_under_umbrella(text, integer)
  FROM PUBLIC, anon, authenticated;

-- Verify — both columns must now read false. If they still read true, the
-- function is owned by a role your session inherits; check `acl` in query 1.
SELECT
  p.oid::regprocedure AS function_signature,
  p.proacl            AS acl_after,
  has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_genres_under_umbrella';

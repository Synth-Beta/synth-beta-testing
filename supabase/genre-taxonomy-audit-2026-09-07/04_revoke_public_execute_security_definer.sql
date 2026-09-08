-- =============================================================================
-- SECURITY: 12 SECURITY DEFINER functions are callable by anon. Fix the 2026-07-10
-- revoke that never took effect.
-- =============================================================================
-- REVIEW THIS, THEN RUN IT YOURSELF. Nothing here is auto-applied.
--
-- FINDING (2026-09-07). Every function below reports:
--     prosecdef = true
--     proacl    = {=X/postgres, postgres=X/postgres, authenticated=X/postgres,
--                  service_role=X/postgres}
--     has_function_privilege('anon', ..., 'EXECUTE') = true
--
-- The leading `=X/postgres` is a grant to PUBLIC (empty grantee). anon inherits
-- EXECUTE through it. supabase/security-review-2026-07-10/04 issued
-- `REVOKE EXECUTE ... FROM anon` against exactly this list, which removed a
-- privilege anon never separately held -- it succeeded, raised nothing, and
-- changed nothing. The migration is recorded as applied and verified.
--
-- IMPACT: these are SECURITY DEFINER, so they run as the owner with RLS
-- bypassed, and the anon key is public by design (it ships in the client
-- bundle). Anyone can currently POST to /rest/v1/rpc/<name> and:
--   * send_daily_event_summary_notifications / send_event_reminders
--       -> fire a notification blast at the entire user base
--   * recalculate_all_passport_data / refresh_analytics_daily /
--     trigger_aggregate_analytics / refresh_user_cluster_affinity /
--     refresh_user_recommendations / genre_cooc_*
--       -> trigger unbounded full-table recomputes on demand (DoS + cost)
--
-- WHO KEEPS ACCESS AFTER THIS:
--   * pg_cron  -- runs as postgres (the owner). Revokes do not affect it, so
--                 'event-reminders', 'daily-event-summary-notifications' etc.
--                 keep working. Verified: these are cron-driven, not app-driven.
--   * service_role -- holds its own explicit grant. The Express backend is fine.
--   * authenticated -- retained for refresh_user_preference_signals ONLY (STEP 2).
--
-- CALLER AUDIT (repo-wide grep of src/, mobile/, packages/, backend/, api/,
-- scripts/, excluding tests and comments):
--   refresh_user_preference_signals -> src/services/preferenceSignalsService.ts
--       called from src/hooks/useAuth.ts at session start, as a signed-in user.
--       KEEPS `authenticated`.
--   send_event_reminders -> only a comment and a DISABLED script block.
--   all other 10 -> zero callers.
--
-- REVERSIBLE: GRANT EXECUTE ON FUNCTION public.<name>(<args>) TO authenticated;
-- =============================================================================

-- ===== STEP 1 — the 11 with no application caller ===========================
-- PUBLIC is the one that actually matters; authenticated is named because these
-- also carry an explicit grant to it, and nothing in the app calls them.
REVOKE EXECUTE ON FUNCTION public.refresh_user_recommendations()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_genre_coverage()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_all_passport_data()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_analytics_daily()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_event_reminders()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_aggregate_analytics()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_user_cluster_affinity()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_daily_event_summary_notifications()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.genre_cooc_begin_build()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.genre_cooc_ingest_batch(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.genre_cooc_finalize()                     FROM PUBLIC, anon, authenticated;

-- ===== STEP 2 — the one with a real signed-in caller ========================
-- Drop PUBLIC (which is how anon gets in) but KEEP authenticated: useAuth.ts
-- calls this at the start of every session. Revoking it there would silently
-- stop preference signals refreshing, which degrades the feed with no error.
REVOKE EXECUTE ON FUNCTION public.refresh_user_preference_signals() FROM PUBLIC, anon;

-- ===== STEP 3 — verify ======================================================
-- Expect: anon_can_execute = false on ALL 12.
-- Expect: authed_can_execute = false on all EXCEPT refresh_user_preference_signals.
SELECT
  p.oid::regprocedure AS function_signature,
  p.proacl            AS acl_after,
  has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_can_execute,
  has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role_can_execute
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


-- ===== STEP 4 — THE BIGGER QUESTION (read-only, run it) =====================
-- The 2026-07-10 list was itself a hand-picked subset. If the PUBLIC-grant
-- blind spot applied to those 12, it very likely applies to other SECURITY
-- DEFINER functions nobody enumerated. This lists EVERY one in `public` that
-- anon can currently execute.
--
-- Do NOT bulk-revoke from this output. Many SECURITY DEFINER functions are
-- meant to be called by the client (that is often the entire reason they are
-- DEFINER). Each needs a caller check first, the way STEP 1/2 were split.
SELECT
  p.oid::regprocedure AS function_signature,
  p.proacl            AS acl,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_can_execute
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY 1;

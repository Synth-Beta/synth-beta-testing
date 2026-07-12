-- =============================================================================
-- 04 — Revoke anon EXECUTE on privileged functions
-- Advisor: anon_security_definer_function_executable (many)
-- =============================================================================
--
-- APPROACH: conservative + curated. We revoke EXECUTE from the `anon` role only
--   for functions that have NO logged-out (anonymous) use case: admin/moderation,
--   data ingestion, and maintenance/cron jobs. We do NOT touch `authenticated`
--   grants here, and we do NOT touch per-user functions (they already self-guard
--   with auth.uid()). This can only remove capability from logged-out callers, so
--   it cannot break any signed-in feature.
--
-- EXPLICITLY PRESERVED for anon (used BEFORE a session exists — do NOT revoke):
--   check_username_available   -> signup username check
--   get_email_by_username      -> username-based login
--   handle_new_user / ensure_public_user / *_for_new_user -> signup triggers
--   (trigger functions aren't API-callable anyway)
--
-- NOTE ON TRIGGER FUNCTIONS: many flagged functions are trigger handlers (no args,
--   invoked internally). They can't be called over the API, so revoking is
--   harmless but also optional. This file targets the API-reachable privileged set.
--
-- -----------------------------------------------------------------------------
-- DRY RUN — current anon EXECUTE grants for the targeted functions
-- -----------------------------------------------------------------------------
WITH targets(name) AS (
  VALUES
    -- admin / moderation
    ('admin_review_upgrade_request'), ('admin_set_account_type'), ('admin_verify_user'),
    ('moderate_content'), ('review_event_claim'), ('review_event_promotion'),
    ('promote_event'), ('get_users_for_admin'), ('get_pending_admin_tasks'),
    ('get_pending_flags_simple'), ('get_all_profiles_for_analytics'),
    -- data ingestion (service-role only)
    ('safe_upsert_jambase_event'), ('upsert_jambase_event'), ('populate_events_from_concerts'),
    -- maintenance / cron / backfill (no interactive use)
    ('auto_claim_creator_events'), ('backfill_all_achievements'),
    ('backfill_event_creation_analytics'), ('backfill_genre_signals'),
    ('backfill_passport_from_reviews'), ('backfill_passport_timeline'),
    ('backfill_user_scene_progress'), ('cleanup_push_notification_queue'),
    ('expire_promotions'), ('genre_cooc_begin_build'), ('genre_cooc_finalize'),
    ('genre_cooc_ingest_batch'), ('recalculate_all_passport_data'),
    ('refresh_analytics_daily'), ('refresh_user_cluster_affinity'),
    ('refresh_user_preference_signals'), ('refresh_user_recommendations'),
    ('send_daily_event_summary_notifications'), ('send_event_reminders'),
    ('trigger_aggregate_analytics'), ('verify_genre_coverage')
)
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_can_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN targets t ON t.name = p.proname
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- -----------------------------------------------------------------------------
-- APPLY — revoke EXECUTE from anon for every overload of each targeted function.
--   Idempotent and overload-safe (loops over pg_proc). Preserved functions are
--   simply not in the list.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  targets text[] := ARRAY[
    'admin_review_upgrade_request','admin_set_account_type','admin_verify_user',
    'moderate_content','review_event_claim','review_event_promotion','promote_event',
    'get_users_for_admin','get_pending_admin_tasks','get_pending_flags_simple',
    'get_all_profiles_for_analytics',
    'safe_upsert_jambase_event','upsert_jambase_event','populate_events_from_concerts',
    'auto_claim_creator_events','backfill_all_achievements',
    'backfill_event_creation_analytics','backfill_genre_signals',
    'backfill_passport_from_reviews','backfill_passport_timeline',
    'backfill_user_scene_progress','cleanup_push_notification_queue','expire_promotions',
    'genre_cooc_begin_build','genre_cooc_finalize','genre_cooc_ingest_batch',
    'recalculate_all_passport_data','refresh_analytics_daily','refresh_user_cluster_affinity',
    'refresh_user_preference_signals','refresh_user_recommendations',
    'send_daily_event_summary_notifications','send_event_reminders',
    'trigger_aggregate_analytics','verify_genre_coverage'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(targets)
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon;',
                     r.proname, r.args);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipped %(%): %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- OPTIONAL, STRICTER (review before use): also revoke the ingestion functions
--   from `authenticated` — end users should never upsert events directly. Only
--   safe if nothing in the app calls these with a user token (the JamBase sync
--   uses the service role, which is unaffected by GRANTs).
-- -----------------------------------------------------------------------------
-- DO $$
-- DECLARE r record;
--   ing text[] := ARRAY['safe_upsert_jambase_event','upsert_jambase_event','populate_events_from_concerts'];
-- BEGIN
--   FOR r IN SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public' AND p.proname = ANY(ing)
--   LOOP
--     EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated;', r.proname, r.args);
--   END LOOP;
-- END $$;

-- -----------------------------------------------------------------------------
-- VERIFY — re-run the DRY RUN query above; anon_can_exec should now be false
--   for every listed function, and pre-login functions are untouched:
-- -----------------------------------------------------------------------------
SELECT 'check_username_available' AS fn,
       has_function_privilege('anon',
         'public.check_username_available(text)', 'EXECUTE') AS anon_still_can_exec
UNION ALL
SELECT 'get_email_by_username',
       has_function_privilege('anon',
         'public.get_email_by_username(text)', 'EXECUTE');
-- Both should remain TRUE. Then test: signup (username availability) and
-- username login still work.

-- -----------------------------------------------------------------------------
-- ROLLBACK — re-grant EXECUTE to anon for the targeted functions
-- -----------------------------------------------------------------------------
-- DO $$
-- DECLARE r record;
--   targets text[] := ARRAY[ /* same list as APPLY */ ];
-- BEGIN
--   FOR r IN SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public' AND p.proname = ANY(targets)
--   LOOP
--     EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon;', r.proname, r.args);
--   END LOOP;
-- END $$;

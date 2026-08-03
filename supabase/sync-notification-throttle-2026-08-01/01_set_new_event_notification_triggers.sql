-- =============================================================================
-- 01 — Toggle the 3 real-time "new event" notification triggers
-- =============================================================================
-- WHY: trigger_notify_artist_followers_new_event, trigger_notify_venue_followers_new_event,
-- and trigger_notify_bucket_list_new_event each fire once per row on `events` AFTER INSERT.
-- The JamBase sync (scripts/sync-jambase-incremental-3nf.mjs) inserts events across many
-- pages in one run, so any user following an active artist/venue gets hit with one push
-- per new show, back to back. Confirmed live 2026-08-03: mid-sync, one user received 10
-- "new event" notifications in ~2.5 hours (Union Stage / Pearl Street Warehouse / Melkweg
-- all synced through in the same run) — this is the exact spam this function stops.
--
-- The existing daily digest (public.send_daily_event_summary_notifications, pg_cron job
-- 'daily-event-summary-notifications', 0 9 * * * UTC) already covers this need once
-- per day — this function lets the sync script silence the real-time triggers only for
-- the duration of its own run, so organic one-off inserts (outside the sync) still
-- notify instantly.
--
-- SAFETY: toggles exactly the 3 named triggers, never DISABLE TRIGGER USER (which would
-- also catch unrelated triggers on `events`). SECURITY DEFINER + revoked from
-- anon/authenticated so only the service role (used by the sync script) can call it.
-- Idempotent (ENABLE/DISABLE on an already-enabled/disabled trigger is a no-op).
-- Review, then apply yourself.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_new_event_notification_triggers(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_enabled THEN
    ALTER TABLE public.events ENABLE TRIGGER trigger_notify_artist_followers_new_event;
    ALTER TABLE public.events ENABLE TRIGGER trigger_notify_venue_followers_new_event;
    ALTER TABLE public.events ENABLE TRIGGER trigger_notify_bucket_list_new_event;
  ELSE
    ALTER TABLE public.events DISABLE TRIGGER trigger_notify_artist_followers_new_event;
    ALTER TABLE public.events DISABLE TRIGGER trigger_notify_venue_followers_new_event;
    ALTER TABLE public.events DISABLE TRIGGER trigger_notify_bucket_list_new_event;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_new_event_notification_triggers(boolean) FROM anon, authenticated;

-- ---- VERIFY -----------------------------------------------------------------
-- Function exists, and anon/authenticated cannot call it:
SELECT
  (SELECT count(*) FROM pg_proc WHERE proname = 'set_new_event_notification_triggers') AS fn_exists_expect_1,
  has_function_privilege('anon', 'public.set_new_event_notification_triggers(boolean)', 'EXECUTE') AS anon_can_exec_expect_false,
  has_function_privilege('authenticated', 'public.set_new_event_notification_triggers(boolean)', 'EXECUTE') AS auth_can_exec_expect_false;

-- Toggle both ways and confirm via pg_trigger:
SELECT public.set_new_event_notification_triggers(false);
SELECT tgname, tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname = 'events' AND tgname LIKE 'trigger_notify_%';
-- Expect all 3 rows: tgenabled = 'D' (disabled)

SELECT public.set_new_event_notification_triggers(true);
SELECT tgname, tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname = 'events' AND tgname LIKE 'trigger_notify_%';
-- Expect all 3 rows: tgenabled = 'O' (enabled/origin) — back to normal before finishing this step.

-- ---- ROLLBACK -----------------------------------------------------------------
--   DROP FUNCTION IF EXISTS public.set_new_event_notification_triggers(boolean);
--   (if triggers were left disabled by a bug, manually re-enable:)
--   ALTER TABLE public.events ENABLE TRIGGER trigger_notify_artist_followers_new_event;
--   ALTER TABLE public.events ENABLE TRIGGER trigger_notify_venue_followers_new_event;
--   ALTER TABLE public.events ENABLE TRIGGER trigger_notify_bucket_list_new_event;

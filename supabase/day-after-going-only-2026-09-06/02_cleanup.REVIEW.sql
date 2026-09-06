-- =============================================================================
-- 02 — Delete day-after notifications already sent to non-going users
-- =============================================================================
-- PREREQUISITE: 01_function.REVIEW.sql applied, confirmed by query A in
--   03_verify.READONLY.sql (going_gate_pos > 0, old_copy_pos = 0).
--   Running this before 01 just lets the cron job re-send them tomorrow.
--
-- DO NOT run this file whole. Run the three statements below ONE AT A TIME,
-- highlighting each and pressing run. Statement 1 is a read; 2 and 3 delete.
--
-- These are the notifications the old function sent to users who only clicked
-- "interested". They are noise, and they are not restorable — take the count
-- from statement 1 first and make sure it looks like a plausible number.
-- =============================================================================
SET statement_timeout = '120s';


-- ---- STATEMENT 1 — DRY RUN. Read-only. Run this first. ----------------------
-- This is exactly how many notification rows statements 2+3 will remove.
SELECT count(*) AS rows_that_will_be_deleted
FROM public.notifications n
WHERE n.type = 'event_reminder_day_after'
  AND n.data->>'event_id' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_event_relationships uer
    WHERE uer.user_id = n.user_id
      AND uer.event_id = (n.data->>'event_id')::uuid
      AND uer.relationship_type = 'going');


-- ---- STATEMENT 2 — sent-log first (it carries notification_id) --------------
WITH stale AS (
  SELECT n.user_id, (n.data->>'event_id')::uuid AS event_id
  FROM public.notifications n
  WHERE n.type = 'event_reminder_day_after'
    AND n.data->>'event_id' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_event_relationships uer
      WHERE uer.user_id = n.user_id
        AND uer.event_id = (n.data->>'event_id')::uuid
        AND uer.relationship_type = 'going')
)
DELETE FROM public.event_reminders_sent ers
USING stale s
WHERE ers.reminder_type = 'event_reminder_day_after'
  AND ers.user_id = s.user_id
  AND ers.event_id = s.event_id;


-- ---- STATEMENT 3 — then the notifications themselves ------------------------
DELETE FROM public.notifications n
WHERE n.type = 'event_reminder_day_after'
  AND n.data->>'event_id' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_event_relationships uer
    WHERE uer.user_id = n.user_id
      AND uer.event_id = (n.data->>'event_id')::uuid
      AND uer.relationship_type = 'going');


-- AFTER: run query B in 03_verify.READONLY.sql. Expect 0.

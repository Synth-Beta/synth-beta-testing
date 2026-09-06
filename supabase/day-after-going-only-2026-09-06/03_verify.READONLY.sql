-- =============================================================================
-- 03 — VERIFY (read-only, safe to run any time, run each query on its own)
-- =============================================================================
-- Run A after 01_function.REVIEW.sql. Run B after 02_cleanup.REVIEW.sql.
-- Nothing here writes.
-- =============================================================================

-- ---- A. Did the function actually get replaced? -----------------------------
-- Highlight ONLY this query and run it.
--
-- Reading the row:
--   going_gate_pos > 0 AND old_copy_pos = 0  -> new version live. 01 applied. Good.
--   going_gate_pos = 0 AND old_copy_pos > 0  -> OLD version still live. 01 did not
--                                               run. Re-run 01_function.REVIEW.sql
--                                               and read the editor's error.
--   0 rows returned                          -> function does not exist at all.
--
-- NOTE: old_gate_pos is > 0 in BOTH versions — the upcoming-reminders loop still
-- uses IN ('interested','going','maybe') on purpose. Discriminate on old_copy_pos,
-- which only appears in the OLD day-after block.
SELECT
  p.oid::regprocedure                                               AS fn,
  position('relationship_type = ''going''' IN p.prosrc)             AS going_gate_pos,
  position('IN (''interested'', ''going'', ''maybe'')' IN p.prosrc) AS old_gate_pos,
  position('How was the show?' IN p.prosrc)                         AS new_copy_pos,
  position('You were interested in' IN p.prosrc)                    AS old_copy_pos,
  length(p.prosrc)                                                  AS body_len
FROM pg_proc p
JOIN pg_namespace ns ON ns.oid = p.pronamespace
WHERE ns.nspname = 'public' AND p.proname = 'send_event_reminders';


-- ---- B. Are there day-after notifications left for non-going users? ---------
-- Highlight ONLY this query and run it.
-- Before 02: this is the number of rows 02 will delete.
-- After  02: expect 0.
SELECT count(*) AS non_going_day_after
FROM public.notifications n
WHERE n.type = 'event_reminder_day_after'
  AND n.data->>'event_id' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_event_relationships uer
    WHERE uer.user_id = n.user_id
      AND uer.event_id = (n.data->>'event_id')::uuid
      AND uer.relationship_type = 'going');


-- ---- C. Cron job still scheduled (unchanged by this work) -------------------
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'event-reminders';


-- ---- D. Optional dry-run of the job ------------------------------------------
-- Safe: dedups via event_reminders_sent, so it never double-sends. It DOES
-- insert real notifications for anyone genuinely due one, so run it only when
-- you're happy with A and B.
--   SELECT * FROM public.send_event_reminders();

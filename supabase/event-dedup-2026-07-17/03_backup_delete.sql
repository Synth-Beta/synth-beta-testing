-- =============================================================================
-- 03 — Back up, then delete the duplicate event rows   (idempotent / re-runnable)
-- =============================================================================
-- Runs after 02 has repointed every reference. Safe to run the whole file at once,
-- and safe to re-run: the backup uses CREATE TABLE IF NOT EXISTS (so a re-run never
-- overwrites a good backup or errors on "type already exists"), and the delete only
-- removes dups that still exist.
--
-- events_genres / event_reminders_sent CASCADE-clean on delete (canonical carries
-- its own genres). messages.shared_event_id is NO ACTION — delete would ERROR
-- rather than silently break a share if 02 hadn't repointed (it did).
-- =============================================================================
SET statement_timeout = '900s';

-- STEP 1 — full-row backup (created once; a re-run keeps the ORIGINAL backup intact)
CREATE TABLE IF NOT EXISTS public.events_dedup_backup AS
SELECT e.*, m.canonical_id AS _merged_into
FROM public.events e
JOIN public.event_dedup_map m ON e.id = m.duplicate_id;

SELECT count(*) AS backed_up FROM public.events_dedup_backup;   -- expect ~6,766

-- STEP 2 — delete the duplicate events (no-op on re-run once they're gone)
DELETE FROM public.events e
USING public.event_dedup_map m
WHERE e.id = m.duplicate_id;

-- STEP 3 — verify
SELECT
  (SELECT count(*) FROM public.events) AS events_now,                    -- ~244,647
  (SELECT count(*) FROM public.event_dedup_map m
     WHERE EXISTS (SELECT 1 FROM public.events e WHERE e.id = m.duplicate_id)) AS dups_left_expect_0,
  (SELECT count(*) FROM public.event_dedup_map m
     WHERE NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = m.canonical_id)) AS canonicals_missing_expect_0;

-- Done. Keep events_dedup_backup + event_dedup_map as an audit trail; drop when confident:
--   DROP TABLE IF EXISTS public.event_dedup_map, public.events_dedup_backup;

-- ---------------------------------------------------------------------------
-- RESTORE (if ever needed): re-insert the backed-up rows (drop _merged_into first)
--   ALTER TABLE public.events_dedup_backup DROP COLUMN _merged_into;
--   INSERT INTO public.events SELECT * FROM public.events_dedup_backup;
-- ---------------------------------------------------------------------------

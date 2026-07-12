-- =============================================================================
-- 03 — Delete the orphaned duplicate venues   (EDITOR-SAFE, batched)
-- =============================================================================
-- Run each STEP separately (highlight the step, run it). NO transaction wrapper,
-- so a network blip can't leave a stuck/locked session. The big delete is BATCHED
-- so each run finishes fast and never hits the gateway timeout.
--
-- Only deletes duplicate venue rows in venue_dedup_map. Canonicals, user-created
-- venues, and the ~30K unmappable venues are never touched. Run 02 first (done).
-- =============================================================================
SET statement_timeout = '900s';

-- ===== STEP 0 (only if a previous run got "Failed to fetch") ==================
-- Clear any stuck migration session left behind by a dropped browser request:
SELECT pid, pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE usename='postgres' AND state='active'
  AND query LIKE '-- ====%' AND pid <> pg_backend_pid();

-- ===== STEP 1 — pre-check: nothing may still reference a duplicate (all 0) =====
SELECT
  (SELECT count(*) FROM public.events e            JOIN public.venue_dedup_map m ON e.venue_id  = m.duplicate_id) AS events_left,
  (SELECT count(*) FROM public.reviews r           JOIN public.venue_dedup_map m ON r.venue_id  = m.duplicate_id) AS reviews_left,
  (SELECT count(*) FROM public.event_media em      JOIN public.venue_dedup_map m ON em.venue_id = m.duplicate_id) AS media_left,
  (SELECT count(*) FROM public.scene_participants sp JOIN public.venue_dedup_map m ON sp.venue_id = m.duplicate_id) AS scenes_left,
  (SELECT count(*) FROM public.user_venue_relationships uvr JOIN public.venue_dedup_map m ON uvr.venue_id = m.duplicate_id) AS follows_left;
-- ↑ Must be all zeros. If not, go back and run the STEP 2 repoint from before.

-- ===== STEP 2 — remove any external_entity_ids rows of the duplicates =========
-- (Usually ~0 — duplicates aren't canonical. Quick, one statement.)
DELETE FROM public.external_entity_ids e
USING public.venue_dedup_map m
WHERE e.entity_uuid = m.duplicate_id AND e.entity_type='venue';

-- ===== STEP 3 — BATCHED delete of the duplicate venues =======================
-- Run this SAME statement over and over. Each run deletes up to 50,000 duplicates
-- that still exist. Keep running it until it reports "DELETE 0" (0 rows). ~10 runs
-- for ~481K rows. Fast and safe each time; nothing else is affected.
DELETE FROM public.venues
WHERE id IN (
  SELECT m.duplicate_id
  FROM public.venue_dedup_map m
  JOIN public.venues v ON v.id = m.duplicate_id   -- only ones still present
  LIMIT 50000
);
-- ⟳ repeat STEP 3 until it says DELETE 0.

-- ===== STEP 4 — verify =======================================================
SELECT
  (SELECT count(*) FROM public.venues) AS venues_now,                 -- expect ~51K
  (SELECT count(*) FROM public.venue_dedup_map m
     JOIN public.venues v ON v.id = m.duplicate_id) AS dups_left,     -- expect 0
  (SELECT count(*) FROM public.venue_dedup_map m
     WHERE NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.id = m.canonical_id)) AS canonicals_missing; -- expect 0

-- Done. Optional cleanup once you're happy:
--   DROP TABLE IF EXISTS public.venue_dedup_map, public._venue_canon, public._venue_canon_unique;

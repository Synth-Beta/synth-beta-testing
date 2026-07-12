-- =============================================================================
-- 04 — Prevent recurrence: normalized key + UNIQUE index   (EDITOR-SAFE)
-- =============================================================================
-- Run each STEP separately. NO transaction wrapper. Run only AFTER 03 finished
-- (venues down to ~51K). Small operations here — no batching needed.
--
-- PART 1 collapses any REMAINING venues that share a normalized location key (the
-- ~25 ambiguous chain keys + unmappable rows that duplicate each other) so the
-- unique index can be built. PART 2 adds the key column + partial UNIQUE index —
-- after which the DB itself rejects duplicate synced venues.
-- =============================================================================
SET statement_timeout = '900s';

-- ===== STEP 0 (only if a previous run got "Failed to fetch") ==================
SELECT pid, pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE usename='postgres' AND state='active'
  AND query LIKE '-- ====%' AND pid <> pg_backend_pid();

-- ===== STEP 1 — build residual collision map (keeps canonical/oldest) ========
DROP TABLE IF EXISTS public._venue_residual_map;
CREATE TABLE public._venue_residual_map AS
WITH grp AS (
  SELECT v.id,
         lower(v.identifier) || '|' || lower(coalesce(v.city,'')) || '|' || lower(coalesce(v.state,'')) AS k,
         EXISTS (SELECT 1 FROM public.external_entity_ids e
                 WHERE e.entity_uuid=v.id AND e.source='jambase' AND e.entity_type='venue') AS is_canon,
         v.created_at
  FROM public.venues v
  WHERE v.owner_user_id IS NULL AND v.identifier IS NOT NULL
),
ranked AS (
  SELECT id, k,
         row_number() OVER (PARTITION BY k ORDER BY is_canon DESC, created_at ASC NULLS LAST, id) AS rn,
         first_value(id) OVER (PARTITION BY k ORDER BY is_canon DESC, created_at ASC NULLS LAST, id) AS keeper_id
  FROM grp
)
SELECT id AS duplicate_id, keeper_id AS canonical_id
FROM ranked
WHERE rn > 1;

-- How many residuals to collapse (may be 0):
SELECT count(*) AS residuals FROM public._venue_residual_map;

-- ===== STEP 2 — repoint FKs for the residuals (run all 6; most affect 0 rows) =
UPDATE public.events e            SET venue_id = m.canonical_id FROM public._venue_residual_map m WHERE e.venue_id  = m.duplicate_id;
UPDATE public.reviews r           SET venue_id = m.canonical_id FROM public._venue_residual_map m WHERE r.venue_id  = m.duplicate_id;
UPDATE public.event_media em      SET venue_id = m.canonical_id FROM public._venue_residual_map m WHERE em.venue_id = m.duplicate_id;
UPDATE public.scene_participants sp SET venue_id = m.canonical_id FROM public._venue_residual_map m WHERE sp.venue_id = m.duplicate_id;
DELETE FROM public.user_venue_relationships uvr USING public._venue_residual_map m
  WHERE uvr.venue_id = m.duplicate_id
    AND EXISTS (SELECT 1 FROM public.user_venue_relationships keep
                WHERE keep.user_id = uvr.user_id AND keep.venue_id = m.canonical_id);
UPDATE public.user_venue_relationships uvr SET venue_id = m.canonical_id FROM public._venue_residual_map m WHERE uvr.venue_id = m.duplicate_id;

-- ===== STEP 3 — delete the residual venues ===================================
DELETE FROM public.external_entity_ids e USING public._venue_residual_map m
  WHERE e.entity_uuid = m.duplicate_id AND e.entity_type='venue';
DELETE FROM public.venues v USING public._venue_residual_map m WHERE v.id = m.duplicate_id;

-- ===== STEP 4 — add the normalized location-key column =======================
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS venue_location_key text
  GENERATED ALWAYS AS (
    CASE WHEN identifier IS NULL THEN NULL
         ELSE lower(identifier) || '|' || lower(coalesce(city,'')) || '|' || lower(coalesce(state,''))
    END
  ) STORED;

-- ===== STEP 5 — confirm no collisions remain (must return NO rows) ===========
SELECT venue_location_key, count(*)
FROM public.venues
WHERE owner_user_id IS NULL AND venue_location_key IS NOT NULL
GROUP BY venue_location_key HAVING count(*) > 1
LIMIT 20;
-- ↑ If this returns rows, STOP and tell me. If empty, continue to STEP 6.

-- ===== STEP 6 — create the UNIQUE index (the hard guarantee) =================
CREATE UNIQUE INDEX IF NOT EXISTS venues_location_key_uidx
  ON public.venues (venue_location_key)
  WHERE owner_user_id IS NULL AND venue_location_key IS NOT NULL;

-- ===== STEP 7 — verify + cleanup =============================================
SELECT
  (SELECT count(*) FROM public.venues) AS venues_final,
  (SELECT count(*) FROM pg_indexes WHERE indexname='venues_location_key_uidx') AS index_created_expect_1;

-- Cleanup work tables once happy:
DROP TABLE IF EXISTS public._venue_residual_map;
-- DROP TABLE IF EXISTS public.venue_dedup_map, public._venue_canon, public._venue_canon_unique;

-- ROLLBACK of PART 2 (if ever needed):
--   DROP INDEX IF EXISTS public.venues_location_key_uidx;
--   ALTER TABLE public.venues DROP COLUMN IF EXISTS venue_location_key;

-- =============================================================================
-- 04 — Prevent recurrence   (Event dedup) — idempotent / re-runnable
-- =============================================================================
-- Run AFTER 01-03. Safe to run the whole file at once and to re-run.
--   PART 0: collapse the last few NULL-id events that still share a slot (these
--           live in the "ambiguous" multi-jambase groups that 01 skipped) so the
--           unique index can be built.
--   PART 1: partial UNIQUE index — two NULL-id events can never share a slot again.
--   PART 2: merge_null_id_event_duplicates() — the sync calls this after each
--           upsert to fold any legacy NULL-id twin into the JamBase canonical.
-- =============================================================================
SET statement_timeout = '900s';

-- ===== PART 0 — collapse residual NULL-id self-duplicates =====================
DROP TABLE IF EXISTS public._evt_null_residual;
CREATE TABLE public._evt_null_residual AS
WITH ranked AS (
  SELECT id, artist_id, venue_id, event_date,
         row_number() OVER (PARTITION BY artist_id, venue_id, event_date
                            ORDER BY created_at ASC NULLS LAST, id) AS rn,
         first_value(id) OVER (PARTITION BY artist_id, venue_id, event_date
                               ORDER BY created_at ASC NULLS LAST, id) AS keeper_id
  FROM public.events
  WHERE jambase_id IS NULL AND artist_id IS NOT NULL AND venue_id IS NOT NULL
)
SELECT id AS duplicate_id, keeper_id AS canonical_id
FROM ranked WHERE rn > 1;

-- repoint the residuals' references onto the keeper, then delete them
DELETE FROM public.user_event_relationships u USING public._evt_null_residual d
  WHERE u.event_id=d.duplicate_id
    AND EXISTS (SELECT 1 FROM public.user_event_relationships k WHERE k.user_id=u.user_id AND k.event_id=d.canonical_id);
UPDATE public.user_event_relationships u SET event_id=d.canonical_id FROM public._evt_null_residual d WHERE u.event_id=d.duplicate_id;
DELETE FROM public.reviews r USING public._evt_null_residual d
  WHERE r.event_id=d.duplicate_id
    AND EXISTS (SELECT 1 FROM public.reviews k WHERE k.user_id=r.user_id AND k.event_id=d.canonical_id);
UPDATE public.reviews r SET event_id=d.canonical_id FROM public._evt_null_residual d WHERE r.event_id=d.duplicate_id;
UPDATE public.event_media m SET event_id=d.canonical_id FROM public._evt_null_residual d WHERE m.event_id=d.duplicate_id;
UPDATE public.event_reminders_sent s SET event_id=d.canonical_id FROM public._evt_null_residual d WHERE s.event_id=d.duplicate_id;
UPDATE public.messages ms SET shared_event_id=d.canonical_id FROM public._evt_null_residual d WHERE ms.shared_event_id=d.duplicate_id;
DELETE FROM public.events e USING public._evt_null_residual d WHERE e.id=d.duplicate_id;
DROP TABLE IF EXISTS public._evt_null_residual;

-- ===== PART 1 — partial unique index =========================================
-- Pre-check: must now return NO rows.
SELECT artist_id, venue_id, event_date, count(*)
FROM public.events
WHERE jambase_id IS NULL AND artist_id IS NOT NULL AND venue_id IS NOT NULL
GROUP BY artist_id, venue_id, event_date HAVING count(*) > 1 LIMIT 20;

CREATE UNIQUE INDEX IF NOT EXISTS events_null_slot_uidx
  ON public.events (artist_id, venue_id, event_date)
  WHERE jambase_id IS NULL AND artist_id IS NOT NULL AND venue_id IS NOT NULL;

-- ===== PART 2 — merge function (called by the sync) ==========================
CREATE OR REPLACE FUNCTION public.merge_null_id_event_duplicates(p_canonical_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  CREATE TEMP TABLE _evt_dups ON COMMIT DROP AS
  SELECT dup.id AS dup_id, canon.id AS canonical_id
  FROM public.events canon
  JOIN public.events dup
    ON dup.artist_id = canon.artist_id
   AND dup.venue_id  = canon.venue_id
   AND dup.event_date = canon.event_date
   AND dup.id <> canon.id
   AND dup.jambase_id IS NULL
  WHERE canon.id = ANY(p_canonical_ids)
    AND canon.jambase_id IS NOT NULL
    AND canon.artist_id IS NOT NULL AND canon.venue_id IS NOT NULL;

  IF NOT EXISTS (SELECT 1 FROM _evt_dups) THEN
    RETURN 0;
  END IF;

  DELETE FROM public.user_event_relationships u USING _evt_dups d
   WHERE u.event_id = d.dup_id
     AND EXISTS (SELECT 1 FROM public.user_event_relationships k
                 WHERE k.user_id = u.user_id AND k.event_id = d.canonical_id);
  UPDATE public.user_event_relationships u SET event_id = d.canonical_id
    FROM _evt_dups d WHERE u.event_id = d.dup_id;

  DELETE FROM public.reviews r USING _evt_dups d
   WHERE r.event_id = d.dup_id
     AND EXISTS (SELECT 1 FROM public.reviews k
                 WHERE k.user_id = r.user_id AND k.event_id = d.canonical_id);
  UPDATE public.reviews r SET event_id = d.canonical_id
    FROM _evt_dups d WHERE r.event_id = d.dup_id;

  UPDATE public.event_media m         SET event_id = d.canonical_id        FROM _evt_dups d WHERE m.event_id = d.dup_id;
  UPDATE public.event_reminders_sent s SET event_id = d.canonical_id       FROM _evt_dups d WHERE s.event_id = d.dup_id;
  UPDATE public.messages ms           SET shared_event_id = d.canonical_id FROM _evt_dups d WHERE ms.shared_event_id = d.dup_id;

  DELETE FROM public.events e USING _evt_dups d WHERE e.id = d.dup_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_null_id_event_duplicates(uuid[]) FROM public;
REVOKE EXECUTE ON FUNCTION public.merge_null_id_event_duplicates(uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_null_id_event_duplicates(uuid[]) TO service_role;

-- ===== VERIFY ================================================================
SELECT
  (SELECT count(*) FROM pg_indexes WHERE indexname='events_null_slot_uidx') AS index_created_expect_1,
  (SELECT count(*) FROM pg_proc WHERE proname='merge_null_id_event_duplicates') AS function_created_expect_1;

-- ROLLBACK:
--   DROP INDEX IF EXISTS public.events_null_slot_uidx;
--   DROP FUNCTION IF EXISTS public.merge_null_id_event_duplicates(uuid[]);

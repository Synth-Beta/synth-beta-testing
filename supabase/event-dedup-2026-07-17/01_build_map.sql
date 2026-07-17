-- =============================================================================
-- 01 — Build the duplicate -> canonical EVENT mapping   (Event dedup)
-- =============================================================================
-- NON-DESTRUCTIVE: only READS events and CREATES a helper table. No event, review,
-- or interest is changed or deleted here.
--
-- A "duplicate" = two+ event rows for the exact same show: identical
-- (artist_id, venue_id, event_date TIMESTAMP). event_date is the full timestamp,
-- so different showtimes of a residency (ABBA Voyage etc.) are DIFFERENT slots and
-- are never merged.
--
-- Canonical per group = the row WITH a jambase_id (the live-synced one); if none,
-- the oldest. Groups that contain 2+ DISTINCT jambase_ids are AMBIGUOUS (could be
-- separate JamBase listings) and are SKIPPED entirely — left untouched.
-- Expected: ~6,866 redundant rows across ~6,823 groups.
-- =============================================================================
SET statement_timeout = '900s';

DROP TABLE IF EXISTS public.event_dedup_map;
CREATE TABLE public.event_dedup_map (
  duplicate_id uuid PRIMARY KEY,
  canonical_id uuid NOT NULL
);

INSERT INTO public.event_dedup_map (duplicate_id, canonical_id)
WITH grp AS (
  SELECT artist_id, venue_id, event_date
  FROM public.events
  WHERE artist_id IS NOT NULL AND venue_id IS NOT NULL
  GROUP BY artist_id, venue_id, event_date
  HAVING count(*) > 1 AND count(DISTINCT jambase_id) <= 1   -- skip ambiguous multi-jambase slots
),
ranked AS (
  SELECT e.id, g.artist_id, g.venue_id, g.event_date,
         row_number() OVER (
           PARTITION BY g.artist_id, g.venue_id, g.event_date
           ORDER BY (e.jambase_id IS NOT NULL) DESC, e.created_at ASC NULLS LAST, e.id
         ) AS rn,
         first_value(e.id) OVER (
           PARTITION BY g.artist_id, g.venue_id, g.event_date
           ORDER BY (e.jambase_id IS NOT NULL) DESC, e.created_at ASC NULLS LAST, e.id
         ) AS keeper_id
  FROM public.events e
  JOIN grp g ON g.artist_id=e.artist_id AND g.venue_id=e.venue_id AND g.event_date=e.event_date
)
SELECT id AS duplicate_id, keeper_id AS canonical_id
FROM ranked
WHERE rn > 1;

CREATE INDEX idx_event_dedup_map_canonical ON public.event_dedup_map (canonical_id);

-- ---------------------------------------------------------------------------
-- VERIFY (before running 02)
-- ---------------------------------------------------------------------------
-- 1) How many mappings (expect ~6,866)
SELECT count(*) AS mappings FROM public.event_dedup_map;

-- 2) Sanity: no row maps to itself; canonicals are NOT themselves duplicates
SELECT
  (SELECT count(*) FROM public.event_dedup_map WHERE duplicate_id = canonical_id) AS self_maps_expect_0,
  (SELECT count(*) FROM public.event_dedup_map m
     WHERE EXISTS (SELECT 1 FROM public.event_dedup_map m2 WHERE m2.duplicate_id = m.canonical_id)) AS canonical_also_dup_expect_0;

-- 3) Sanity: canonicals still exist and (mostly) carry a jambase_id
SELECT
  count(*) AS canon_rows,
  count(*) FILTER (WHERE e.jambase_id IS NOT NULL) AS canon_with_jambase_id
FROM (SELECT DISTINCT canonical_id FROM public.event_dedup_map) c
JOIN public.events e ON e.id = c.canonical_id;

-- ROLLBACK: DROP TABLE public.event_dedup_map;  (nothing else touched)

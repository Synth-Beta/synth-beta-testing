-- =============================================================================
-- 01 — Build the duplicate -> canonical venue mapping   (Finding 1)
-- =============================================================================
-- NON-DESTRUCTIVE: only READS venues and CREATES helper tables. No venue/event/
-- review data is changed or deleted.
--
-- Canonical venue = the one row per JamBase venue that external_entity_ids points
-- to (verified 1:1: 21,478 ids -> 21,478 uuids). Duplicates map to their canonical
-- by (identifier, city, state); ambiguous chain keys (~25) are skipped/left alone.
-- Coverage measured: 480,305 of 510,678 duplicates map cleanly.
--
-- PERFORMANCE: this version materializes the small canonical set into an INDEXED
-- helper first, so the big join is index-assisted (the earlier single-statement
-- version timed out on the API gateway). If the final INSERT still times out in
-- the web editor, run this file over a DIRECT psql connection instead
-- (Dashboard -> Project Settings -> Database -> Connection string) — no gateway
-- timeout there. Raising the statement timeout also helps:
SET statement_timeout = '900s';

-- ---------------------------------------------------------------------------
-- Step A — canonical rows (small: ~21,478), with normalized location key
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public._venue_canon;
CREATE TABLE public._venue_canon AS
SELECT v.id AS canon_id,
       v.identifier,
       lower(trim(v.city))               AS city_k,
       lower(trim(coalesce(v.state,'')))  AS state_k
FROM public.venues v
JOIN public.external_entity_ids e
  ON e.entity_uuid = v.id AND e.source='jambase' AND e.entity_type='venue';

-- Keep only location-keys owned by exactly ONE canonical, and index them for the join
DROP TABLE IF EXISTS public._venue_canon_unique;
CREATE TABLE public._venue_canon_unique AS
SELECT identifier, city_k, state_k, (array_agg(canon_id))[1] AS canon_id
FROM public._venue_canon
GROUP BY identifier, city_k, state_k
HAVING count(*) = 1;

CREATE UNIQUE INDEX idx_vcu_key ON public._venue_canon_unique (identifier, city_k, state_k);

-- ---------------------------------------------------------------------------
-- Step B — the mapping table (indexed join; no NOT EXISTS needed)
-- ---------------------------------------------------------------------------
-- Why no NOT EXISTS: a canonical row joins only to its OWN key (unique), so
-- canon_id = v.id and the `v.id <> cu.canon_id` filter drops it. Canonicals with
-- an ambiguous key aren't in _venue_canon_unique, so they don't join at all.
-- Net: only genuine duplicates get a row here.
DROP TABLE IF EXISTS public.venue_dedup_map;
CREATE TABLE public.venue_dedup_map (
  duplicate_id uuid PRIMARY KEY,
  canonical_id uuid NOT NULL
);

INSERT INTO public.venue_dedup_map (duplicate_id, canonical_id)
SELECT v.id, cu.canon_id
FROM public.venues v
JOIN public._venue_canon_unique cu
  ON cu.identifier = v.identifier
 AND cu.city_k     = lower(trim(v.city))
 AND cu.state_k    = lower(trim(coalesce(v.state,'')))
WHERE v.id <> cu.canon_id;

CREATE INDEX idx_venue_dedup_map_canonical ON public.venue_dedup_map (canonical_id);

-- ---------------------------------------------------------------------------
-- VERIFY (all must look right before running 02)
-- ---------------------------------------------------------------------------
-- 1) How many mappings (expect ~480,305)
SELECT count(*) AS mappings FROM public.venue_dedup_map;

-- 2) No self-maps; every canonical_id really is a canonical
SELECT
  (SELECT count(*) FROM public.venue_dedup_map WHERE duplicate_id = canonical_id) AS self_maps_expect_0,
  (SELECT count(*) FROM public.venue_dedup_map m
     WHERE NOT EXISTS (SELECT 1 FROM public.external_entity_ids e
                       WHERE e.entity_uuid = m.canonical_id
                         AND e.source='jambase' AND e.entity_type='venue')) AS canonical_not_canonical_expect_0;

-- 3) No duplicate_id is itself a canonical (we never delete a canonical)
SELECT count(*) AS duplicate_is_canonical_expect_0
FROM public.venue_dedup_map m
WHERE EXISTS (SELECT 1 FROM public.external_entity_ids e
              WHERE e.entity_uuid = m.duplicate_id
                AND e.source='jambase' AND e.entity_type='venue');

-- ---------------------------------------------------------------------------
-- CLEANUP of helpers can wait until after 03 (they're tiny). To remove now:
--   DROP TABLE IF EXISTS public._venue_canon, public._venue_canon_unique;
-- ROLLBACK: DROP TABLE public.venue_dedup_map;   (nothing else was touched)
-- ---------------------------------------------------------------------------

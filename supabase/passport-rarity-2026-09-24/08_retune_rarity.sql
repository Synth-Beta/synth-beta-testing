-- Rarity still all 'common' — retune the population. 2026-09-25.
-- The join is fixed (07 left zero unmatched rows). The scoring is the problem.
--
-- 04 ranked percentiles over ALL 57,143 artists. But 5,542 have zero events and
-- 16,073 zero upcoming, and they occupy the rare tail — while being artists no
-- one can hold a stamp for, since stamps come from reviews tied to real events.
-- So every reviewable artist fell into 'common' and legendary was unreachable.
--
-- Fix: rank only entities that could actually be seen (>=1 event or >=1 upcoming
-- date), and widen the buckets so the tier is visible at 19 stamps.

-- ── PART 1: prove it. Where do YOUR stamps sit on the current scale? ─────
SELECT pe.type, pe.entity_name,
       round(er.commonness, 2) AS commonness,
       round(er.percentile, 4) AS percentile,
       er.rarity
FROM public.passport_entries pe
JOIN public.entity_rarity er
  ON er.entity_uuid = pe.entity_uuid AND er.entity_type = pe.type
ORDER BY er.percentile
LIMIT 25;

-- If every percentile above is high (say > 0.5), the diagnosis is confirmed:
-- real stamps sit at the common end because the rare end is empty catalog rows.


-- ── PART 2: retuned scoring. Replaces the function from 04. ─────────────
CREATE OR REPLACE FUNCTION public.refresh_entity_rarity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- Artists that could actually be seen. Excluding the dead catalog rows is
  -- the whole point: they were swallowing the rare end of the distribution.
  WITH supply AS (
    SELECT a.id,
           coalesce(a.num_upcoming_events, 0) AS reach,
           count(e.id)                        AS catalog_events
    FROM public.artists a
    LEFT JOIN public.events e ON e.artist_id = a.id
    GROUP BY a.id, a.num_upcoming_events
  ), eligible AS (
    SELECT * FROM supply WHERE reach > 0 OR catalog_events > 0
  ), ranked AS (
    SELECT id,
           ln(1 + reach) + ln(1 + catalog_events) AS commonness,
           percent_rank() OVER (
             ORDER BY ln(1 + reach) + ln(1 + catalog_events)
           ) AS pr
    FROM eligible
  )
  INSERT INTO public.entity_rarity
        (entity_type, entity_uuid, commonness, percentile, rarity, computed_at)
  SELECT 'artist', id, commonness, pr,
         -- Widened from 2/15. At 19 stamps the old split yielded 0.4 legendary
         -- and 2.5 uncommon, i.e. an invisible feature. Tighten as stamps grow.
         CASE WHEN pr <= 0.05 THEN 'legendary'
              WHEN pr <= 0.30 THEN 'uncommon'
              ELSE 'common' END,
         now()
  FROM ranked
  ON CONFLICT (entity_type, entity_uuid) DO UPDATE
    SET commonness  = EXCLUDED.commonness,
        percentile  = EXCLUDED.percentile,
        rarity      = EXCLUDED.rarity,
        computed_at = EXCLUDED.computed_at;

  WITH supply AS (
    SELECT v.id, count(e.id) AS catalog_events
    FROM public.venues v
    LEFT JOIN public.events e ON e.venue_id = v.id
    GROUP BY v.id
  ), eligible AS (
    SELECT * FROM supply WHERE catalog_events > 0
  ), ranked AS (
    SELECT id,
           ln(1 + catalog_events) AS commonness,
           percent_rank() OVER (ORDER BY ln(1 + catalog_events)) AS pr
    FROM eligible
  )
  INSERT INTO public.entity_rarity
        (entity_type, entity_uuid, commonness, percentile, rarity, computed_at)
  SELECT 'venue', id, commonness, pr,
         CASE WHEN pr <= 0.05 THEN 'legendary'
              WHEN pr <= 0.30 THEN 'uncommon'
              ELSE 'common' END,
         now()
  FROM ranked
  ON CONFLICT (entity_type, entity_uuid) DO UPDATE
    SET commonness  = EXCLUDED.commonness,
        percentile  = EXCLUDED.percentile,
        rarity      = EXCLUDED.rarity,
        computed_at = EXCLUDED.computed_at;
END;
$function$;

-- Rows written by the old model for now-ineligible entities would keep a stale
-- rarity, so clear first, then recompute.
DELETE FROM public.entity_rarity;
SELECT public.refresh_entity_rarity();


-- ── PART 3: verify ──────────────────────────────────────────────────────
-- A. Catalog split. Expect roughly 5% legendary / 25% uncommon / 70% common.
SELECT entity_type, rarity, count(*),
       round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY entity_type), 1) AS pct
FROM public.entity_rarity
GROUP BY entity_type, rarity ORDER BY entity_type, rarity;

-- B. THE test: your 19 stamps should no longer be uniformly common.
SELECT type, rarity, count(*) AS stamps
FROM public.passport_entries_with_rarity
GROUP BY type, rarity ORDER BY type, rarity;

-- C. Sanity-check the names. Do the rare ones feel harder to have caught?
SELECT pe.type, pe.entity_name, er.rarity, round(er.percentile, 3) AS pct
FROM public.passport_entries pe
JOIN public.entity_rarity er
  ON er.entity_uuid = pe.entity_uuid AND er.entity_type = pe.type
ORDER BY er.percentile;

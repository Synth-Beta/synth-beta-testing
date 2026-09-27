-- Rarity, corrected: prestige, not obscurity. 2026-09-25.
-- Replaces the scoring in 04 and 08.
--
-- WHY THIS CHANGED. 08's model ranked low supply as rare, which on real data
-- produced: Melkweg 0.999 "most common", El Monstero (a local Pink Floyd
-- tribute act) 0.506 "rarest". Backwards for a passport — the iconic venue is
-- the prize. So rarity now rises WITH stature.
--
-- Two further corrections from the same output:
--  * Venue buckets came out 37% legendary because thousands of venues with one
--    event share an identical percent_rank. Every ORDER BY below carries `id`
--    as a tiebreak so ties spread instead of collapsing into one rank.
--  * Event volume is not prestige: Pearl Street Warehouse (small club, books
--    nightly) scored 0.991. Venues are now ranked by the CALIBER OF ARTISTS
--    they host — max touring reach of acts that played there — not by volume.

CREATE OR REPLACE FUNCTION public.refresh_entity_rarity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- ARTISTS: touring reach dominates. num_upcoming_events is what separates a
  -- national act from a local/tribute one, so it carries double the weight of
  -- raw catalog presence.
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
           2 * ln(1 + reach) + ln(1 + catalog_events) AS stature,
           percent_rank() OVER (
             ORDER BY 2 * ln(1 + reach) + ln(1 + catalog_events), id
           ) AS pr
    FROM eligible
  )
  INSERT INTO public.entity_rarity
        (entity_type, entity_uuid, commonness, percentile, rarity, computed_at)
  SELECT 'artist', id, stature, pr,
         -- Rarity rises with stature now: the TOP of the scale is legendary.
         CASE WHEN pr >= 0.97 THEN 'legendary'
              WHEN pr >= 0.85 THEN 'uncommon'
              ELSE 'common' END,
         now()
  FROM ranked
  ON CONFLICT (entity_type, entity_uuid) DO UPDATE
    SET commonness  = EXCLUDED.commonness,
        percentile  = EXCLUDED.percentile,
        rarity      = EXCLUDED.rarity,
        computed_at = EXCLUDED.computed_at;

  -- VENUES: judged by who plays there, not how often the doors open.
  WITH hosted AS (
    SELECT v.id,
           count(e.id)                                      AS events_hosted,
           coalesce(max(a.num_upcoming_events), 0)          AS top_act_reach
    FROM public.venues v
    LEFT JOIN public.events e  ON e.venue_id  = v.id
    LEFT JOIN public.artists a ON a.id        = e.artist_id
    GROUP BY v.id
  ), eligible AS (
    SELECT * FROM hosted WHERE events_hosted > 0
  ), ranked AS (
    SELECT id,
           2 * ln(1 + top_act_reach) + ln(1 + events_hosted) AS stature,
           percent_rank() OVER (
             ORDER BY 2 * ln(1 + top_act_reach) + ln(1 + events_hosted), id
           ) AS pr
    FROM eligible
  )
  INSERT INTO public.entity_rarity
        (entity_type, entity_uuid, commonness, percentile, rarity, computed_at)
  SELECT 'venue', id, stature, pr,
         CASE WHEN pr >= 0.97 THEN 'legendary'
              WHEN pr >= 0.85 THEN 'uncommon'
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

DELETE FROM public.entity_rarity;
SELECT public.refresh_entity_rarity();


-- ── VERIFY ───────────────────────────────────────────────────────────────
-- A. Catalog split should now be near 3% legendary / 12% uncommon, for BOTH
--    types. If venues are still way off, the tiebreak did not take.
SELECT entity_type, rarity, count(*),
       round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY entity_type), 1) AS pct
FROM public.entity_rarity
GROUP BY entity_type, rarity ORDER BY entity_type, rarity;

-- B. Your stamps, rarest first. THE test — read the names, not the numbers.
--    Expect Melkweg / The Anthem / Merriweather / big touring acts at the top,
--    El Monstero and small rooms at the bottom. If that reads backwards again,
--    flip the two CASE expressions above (>= 0.97 becomes <= 0.03, etc).
SELECT pe.type, pe.entity_name, er.rarity, round(er.percentile, 3) AS pct
FROM public.passport_entries pe
JOIN public.entity_rarity er
  ON er.entity_uuid = pe.entity_uuid AND er.entity_type = pe.type
ORDER BY er.percentile DESC;

-- C. Spread across the 19 stamps.
SELECT type, rarity, count(*) AS stamps
FROM public.passport_entries_with_rarity
GROUP BY type, rarity ORDER BY type, rarity;

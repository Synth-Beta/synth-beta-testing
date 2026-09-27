-- Rarity refinement: geographic spread, not gig count. 2026-09-25.
-- OPTIONAL. 09 is already shippable; this fixes its residual misrankings.
--
-- 09 produced a correct 3/12/85 split but these wrong calls:
--   Tedeschi Trucks Band  common     (major touring act)
--   Goose                 common     (big jam band)
--   The Chainsmokers      uncommon,  below Shakedown Citi legendary
--   Johan Cruijff Arena   uncommon,  below The Pageant legendary
--
-- Cause: num_upcoming_events counts BOOKED DATES, not audience size. A bar band
-- with 60 local gigs outranks an arena act with 8 stadium dates, and an act
-- between tours scores near zero.
--
-- Fix: how WIDELY an artist plays separates national from local far better than
-- how OFTEN. A touring act plays many cities; a bar band plays one city many
-- times. Geographic spread is the dominant term now, with booked dates demoted
-- to a supporting signal. Venues inherit it: a room that hosts nationally
-- touring acts outranks one that books only local ones.

CREATE OR REPLACE FUNCTION public.refresh_entity_rarity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  WITH supply AS (
    SELECT a.id,
           coalesce(a.num_upcoming_events, 0)                    AS reach,
           count(e.id)                                           AS catalog_events,
           count(DISTINCT e.venue_city) FILTER (
             WHERE e.venue_city IS NOT NULL AND e.venue_city <> ''
           )                                                     AS cities
    FROM public.artists a
    LEFT JOIN public.events e ON e.artist_id = a.id
    GROUP BY a.id, a.num_upcoming_events
  ), eligible AS (
    SELECT * FROM supply WHERE reach > 0 OR catalog_events > 0
  ), ranked AS (
    SELECT id,
           -- Cities carries 3x: it is the term that actually distinguishes a
           -- national act from a local one.
           3 * ln(1 + cities) + ln(1 + reach) + 0.5 * ln(1 + catalog_events) AS stature,
           percent_rank() OVER (
             ORDER BY 3 * ln(1 + cities) + ln(1 + reach)
                      + 0.5 * ln(1 + catalog_events), id
           ) AS pr
    FROM eligible
  )
  INSERT INTO public.entity_rarity
        (entity_type, entity_uuid, commonness, percentile, rarity, computed_at)
  SELECT 'artist', id, stature, pr,
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

  -- VENUES: the touring breadth of the acts they host. Uses the 90th percentile
  -- of hosted-artist spread rather than max(), so one freak booking at a small
  -- room does not make it legendary.
  WITH artist_spread AS (
    SELECT e.artist_id,
           count(DISTINCT e.venue_city) FILTER (
             WHERE e.venue_city IS NOT NULL AND e.venue_city <> ''
           ) AS cities
    FROM public.events e
    WHERE e.artist_id IS NOT NULL
    GROUP BY e.artist_id
  ), hosted AS (
    SELECT v.id,
           count(e.id) AS events_hosted,
           coalesce(percentile_cont(0.9) WITHIN GROUP (
             ORDER BY coalesce(s.cities, 0)
           ), 0) AS headline_spread
    FROM public.venues v
    LEFT JOIN public.events e        ON e.venue_id  = v.id
    LEFT JOIN artist_spread s        ON s.artist_id = e.artist_id
    GROUP BY v.id
  ), eligible AS (
    SELECT * FROM hosted WHERE events_hosted > 0
  ), ranked AS (
    SELECT id,
           3 * ln(1 + headline_spread) + 0.5 * ln(1 + events_hosted) AS stature,
           percent_rank() OVER (
             ORDER BY 3 * ln(1 + headline_spread)
                      + 0.5 * ln(1 + events_hosted), id
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

-- ── VERIFY: compare against 09, same four names ─────────────────────────
-- Want: Tedeschi Trucks and Goose to RISE, Shakedown Citi to FALL, and
-- Johan Cruijff Arena to sit above The Pageant.
SELECT pe.type, pe.entity_name, er.rarity, round(er.percentile, 3) AS pct
FROM public.passport_entries pe
JOIN public.entity_rarity er
  ON er.entity_uuid = pe.entity_uuid AND er.entity_type = pe.type
ORDER BY er.percentile DESC;

SELECT entity_type, rarity, count(*),
       round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY entity_type), 1) AS pct
FROM public.entity_rarity
GROUP BY entity_type, rarity ORDER BY entity_type, rarity;

-- Keep it fresh (07:40 is taken by artist-genre-propagation).
-- SELECT cron.schedule('refresh-entity-rarity', '10 8 * * *',
--                      $$SELECT public.refresh_entity_rarity();$$);

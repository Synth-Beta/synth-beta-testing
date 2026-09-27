-- Rarity, final: 10's artist model + 09's venue model. 2026-09-25.
--
-- Measured on the 19 real stamps, neither file won outright:
--   10 fixed artists  - Tedeschi Trucks and Goose rose from common to uncommon.
--   10 broke venues   - Encore Theater at Wynn hit 1.000 (a ~1,500-seat room,
--                       top of the whole catalog) while Melkweg and The Anthem
--                       fell from legendary to uncommon. City spread is biased
--                       by catalog coverage: European rooms host acts with few
--                       DISTINCT cities in this US-centric JamBase data.
--   09 had venues right (Melkweg, The Anthem, The Pageant legendary) but
--                       artists wrong (Tedeschi Trucks, Goose common).
--
-- So: artists ranked by geographic spread, venues by the touring reach of the
-- acts they host. Known residual, accepted: Shakedown Citi still ranks
-- legendary - it really does tour regionally, so no signal here separates a
-- touring tribute act from a headliner.
--
-- CEILING: every term is a proxy for audience size, which this database does
-- not store. The real fix is artists.popularity / followers backfilled from
-- Spotify's artist endpoint. Until then this is as good as the data gets;
-- further tuning is noise, not signal.

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

-- Expect: Melkweg / The Anthem / The Pageant legendary again, Tedeschi Trucks
-- and Goose holding uncommon or better, Encore Theater no longer 1.000.
SELECT pe.type, pe.entity_name, er.rarity, round(er.percentile, 3) AS pct
FROM public.passport_entries pe
JOIN public.entity_rarity er
  ON er.entity_uuid = pe.entity_uuid AND er.entity_type = pe.type
ORDER BY er.percentile DESC;

SELECT entity_type, rarity, count(*),
       round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY entity_type), 1) AS pct
FROM public.entity_rarity
GROUP BY entity_type, rarity ORDER BY entity_type, rarity;

-- Last step: keep it fresh, or rarity freezes at today and every new artist
-- reads 'common' forever.
-- SELECT cron.schedule('refresh-entity-rarity', '10 8 * * *',
--                      $$SELECT public.refresh_entity_rarity();$$);

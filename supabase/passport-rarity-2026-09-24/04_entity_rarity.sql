-- Passport rarity: compute it instead of defaulting it. 2026-09-24.
-- REVIEW ONLY, NOT APPLIED.
--
-- Today passport_entries.rarity defaults to 'common' and nothing ever sets it,
-- so all 19 stamps are common and two of the three UI filters return zero.
--
-- Model: rarity = scarcity of opportunity, bucketed by PERCENTILE rather than
-- by absolute threshold. Percentiles make the distribution structural — the
-- system can never collapse back to all-common whatever the data does.
--
--   commonness = ln(1 + upcoming events) + ln(1 + events in catalog)
--
-- An artist with 389 upcoming dates is easy to catch (common). One with a
-- single show ever is not (legendary). Measured inputs, 2026-09-24:
-- num_upcoming_events has 0 nulls, p50=1, p95=11, max=389; event supply splits
-- 5.5k artists with none, 32k with 1-2, 12k with 3-10, 7.2k with 10+.
--
-- Peer scarcity ("only 3 Synth users saw this") is deliberately NOT used yet:
-- only 43 artists have any reviewer at all, 38 of them exactly one. Revisit at
-- roughly 10x the users.

CREATE TABLE IF NOT EXISTS public.entity_rarity (
  entity_type text        NOT NULL CHECK (entity_type IN ('artist', 'venue')),
  entity_uuid uuid        NOT NULL,
  commonness  numeric     NOT NULL,
  percentile  numeric     NOT NULL,
  rarity      text        NOT NULL CHECK (rarity IN ('common', 'uncommon', 'legendary')),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_uuid)
);

ALTER TABLE public.entity_rarity ENABLE ROW LEVEL SECURITY;

-- Rarity is catalog-wide, not per-user: readable by any signed-in user,
-- writable only by the refresh function (SECURITY DEFINER).
DROP POLICY IF EXISTS entity_rarity_read ON public.entity_rarity;
CREATE POLICY entity_rarity_read ON public.entity_rarity
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.refresh_entity_rarity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- Artists: touring reach + historical supply.
  WITH supply AS (
    SELECT a.id,
           coalesce(a.num_upcoming_events, 0) AS reach,
           count(e.id)                        AS catalog_events
    FROM public.artists a
    LEFT JOIN public.events e ON e.artist_id = a.id
    GROUP BY a.id, a.num_upcoming_events
  ), ranked AS (
    SELECT id,
           ln(1 + reach) + ln(1 + catalog_events) AS commonness,
           percent_rank() OVER (
             ORDER BY ln(1 + reach) + ln(1 + catalog_events)
           ) AS pr
    FROM supply
  )
  INSERT INTO public.entity_rarity AS er
        (entity_type, entity_uuid, commonness, percentile, rarity, computed_at)
  SELECT 'artist', id, commonness, pr,
         CASE WHEN pr <= 0.02 THEN 'legendary'
              WHEN pr <= 0.15 THEN 'uncommon'
              ELSE 'common' END,
         now()
  FROM ranked
  ON CONFLICT (entity_type, entity_uuid) DO UPDATE
    SET commonness  = EXCLUDED.commonness,
        percentile  = EXCLUDED.percentile,
        rarity      = EXCLUDED.rarity,
        computed_at = EXCLUDED.computed_at;

  -- Venues: no touring column, so supply alone. A room that hosts two shows a
  -- year is a rarer stamp than one running nightly.
  WITH supply AS (
    SELECT v.id, count(e.id) AS catalog_events
    FROM public.venues v
    LEFT JOIN public.events e ON e.venue_id = v.id
    GROUP BY v.id
  ), ranked AS (
    SELECT id,
           ln(1 + catalog_events) AS commonness,
           percent_rank() OVER (ORDER BY ln(1 + catalog_events)) AS pr
    FROM supply
  )
  INSERT INTO public.entity_rarity AS er
        (entity_type, entity_uuid, commonness, percentile, rarity, computed_at)
  SELECT 'venue', id, commonness, pr,
         CASE WHEN pr <= 0.02 THEN 'legendary'
              WHEN pr <= 0.15 THEN 'uncommon'
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

REVOKE ALL ON FUNCTION public.refresh_entity_rarity() FROM PUBLIC;

-- Stamps join to rarity instead of storing a frozen copy of it. Freezing a
-- computed value onto the row is exactly how every stamp ended up 'common'.
-- security_invoker keeps passport_entries' RLS in force through the view.
CREATE OR REPLACE VIEW public.passport_entries_with_rarity
WITH (security_invoker = true) AS
SELECT pe.id,
       pe.user_id,
       pe.type,
       pe.entity_id,
       pe.entity_uuid,
       pe.entity_name,
       pe.unlocked_at,
       pe.metadata,
       pe.cultural_context,
       coalesce(er.rarity, 'common')  AS rarity,
       er.percentile                  AS rarity_percentile
FROM public.passport_entries pe
LEFT JOIN public.entity_rarity er
       ON er.entity_uuid = pe.entity_uuid
      AND er.entity_type = pe.type;

GRANT SELECT ON public.passport_entries_with_rarity TO authenticated;

-- First run (57k artists + 25k venues; seconds, not minutes).
SELECT public.refresh_entity_rarity();

-- Nightly. 07:40 is taken by artist-genre-propagation, so 08:10.
-- SELECT cron.schedule('refresh-entity-rarity', '10 8 * * *',
--                      $$SELECT public.refresh_entity_rarity();$$);

-- Verify the distribution is actually spread:
-- SELECT entity_type, rarity, count(*) FROM public.entity_rarity
-- GROUP BY entity_type, rarity ORDER BY entity_type, rarity;

-- Artist page: upcoming shows nearest to the viewer first, then by date.
--
-- Order: distance from (p_lat, p_lng) rounded to the nearest mile (so several dates at the
-- same venue / same spot are listed soonest first), then event_date. Events with no
-- coordinates (neither the event nor its venue) come last, by date. Without a location
-- (p_lat / p_lng null) this is plain date order.
--
-- Returns SETOF public.events so clients get the same row shape as select('*').
-- SECURITY INVOKER: RLS on events/venues still applies.

CREATE OR REPLACE FUNCTION public.get_artist_upcoming_events_nearby(
  p_artist_ids uuid[],
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.events
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public, pg_temp
SET statement_timeout TO '8s'
AS $$
  SELECT e.*
  FROM public.events e
  LEFT JOIN public.venues v ON v.id = e.venue_id
  CROSS JOIN LATERAL (
    SELECT
      CASE WHEN e.latitude IS NOT NULL AND e.longitude IS NOT NULL
           THEN e.latitude::double precision ELSE v.latitude::double precision END AS lat,
      CASE WHEN e.latitude IS NOT NULL AND e.longitude IS NOT NULL
           THEN e.longitude::double precision ELSE v.longitude::double precision END AS lng
  ) c
  WHERE e.artist_id = ANY (p_artist_ids)
    AND e.event_date >= COALESCE(p_from, date_trunc('day', now()))
  ORDER BY
    CASE
      WHEN p_lat IS NULL OR p_lng IS NULL OR c.lat IS NULL OR c.lng IS NULL THEN NULL
      ELSE round((
        -- haversine, miles
        7917.6 * asin(sqrt(
          power(sin(radians(c.lat - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(c.lat)) * power(sin(radians(c.lng - p_lng) / 2), 2)
        ))
      )::numeric)
    END ASC NULLS LAST,
    e.event_date ASC,
    e.id
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 1000))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

GRANT EXECUTE ON FUNCTION public.get_artist_upcoming_events_nearby(uuid[], double precision, double precision, timestamptz, integer, integer)
  TO anon, authenticated;

COMMENT ON FUNCTION public.get_artist_upcoming_events_nearby(uuid[], double precision, double precision, timestamptz, integer, integer) IS
  'Artist page upcoming shows: nearest to (p_lat,p_lng) first (mile precision), then by date.';

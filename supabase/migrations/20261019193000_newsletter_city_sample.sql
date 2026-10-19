-- City samples were scanning every upcoming event. Match the city first.

CREATE INDEX IF NOT EXISTS events_newsletter_city_date_idx
  ON public.events (lower(btrim(venue_city)), event_date)
  WHERE latitude IS NOT NULL;

CREATE OR REPLACE FUNCTION public.newsletter_city_sample(
  target_city text,
  from_at timestamptz,
  until_at timestamptz
)
RETURNS TABLE(latitude double precision, longitude double precision, venue_state text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT e.latitude, e.longitude, e.venue_state
  FROM public.events AS e
  WHERE lower(btrim(e.venue_city)) = lower(btrim(target_city))
    AND e.event_date >= from_at
    AND e.event_date <= until_at
    AND e.latitude IS NOT NULL
  ORDER BY e.event_date
  LIMIT 12;
$$;

REVOKE ALL ON FUNCTION public.newsletter_city_sample(text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.newsletter_city_sample(text, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.newsletter_city_sample(text, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.newsletter_city_sample(text, timestamptz, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';

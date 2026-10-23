-- JamBase concerts are titled "Artist at Venue". Festival bills use the
-- festival name (Coachella, EDC Orlando, a cruise) and have no " at ".
-- Those rows are left out of event hygiene. Their genres become the union
-- of the artists already stored on that bill: the headliner, other dates of
-- the same festival, and other festival listings at the same venue that weekend.
SELECT set_config('statement_timeout', '8min', true);

CREATE OR REPLACE FUNCTION public.event_is_festival(p_title text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(p_title, '') !~* '(^|[[:space:]])at[[:space:]]';
$$;

DO $fest$
DECLARE
  rec record;
BEGIN
  ALTER TABLE public.events DISABLE TRIGGER update_events_updated_at;
  ALTER TABLE public.events DISABLE TRIGGER trigger_update_artist_upcoming_events;
  ALTER TABLE public.events DISABLE TRIGGER trigger_update_venue_upcoming_events;

  CREATE TEMP TABLE festival_genre_writes ON COMMIT DROP AS
  WITH festivals AS (
    SELECT e.id, e.title, e.venue_id, e.event_date, e.artist_id, e.genres
    FROM public.events e
    WHERE e.source = 'jambase'
      AND public.event_is_festival(e.title)
  ),
  bill AS (
    SELECT f.id AS event_id, f.artist_id
    FROM festivals f
    WHERE f.artist_id IS NOT NULL
    UNION
    SELECT f.id, sib.artist_id
    FROM festivals f
    JOIN public.events sib
      ON sib.source = 'jambase'
     AND sib.artist_id IS NOT NULL
     AND sib.id <> f.id
     AND sib.venue_id = f.venue_id
     AND f.venue_id IS NOT NULL
     AND public.event_is_festival(sib.title)
     AND sib.event_date >= f.event_date - interval '1 day'
     AND sib.event_date < f.event_date + interval '4 days'
    UNION
    SELECT f.id, sib.artist_id
    FROM festivals f
    JOIN public.events sib
      ON sib.source = 'jambase'
     AND sib.artist_id IS NOT NULL
     AND sib.id <> f.id
     AND lower(btrim(sib.title)) = lower(btrim(f.title))
     AND sib.event_date >= f.event_date - interval '4 days'
     AND sib.event_date < f.event_date + interval '6 days'
  ),
  unioned AS (
    SELECT tags.event_id, array_agg(DISTINCT tags.genre ORDER BY tags.genre) AS genres
    FROM (
      SELECT f.id AS event_id, btrim(g) AS genre
      FROM festivals f
      CROSS JOIN LATERAL unnest(COALESCE(f.genres, ARRAY[]::text[])) AS g
      WHERE btrim(g) <> ''
        AND lower(btrim(g)) <> 'small artist'
      UNION
      SELECT b.event_id, btrim(g)
      FROM bill b
      JOIN public.artists a ON a.id = b.artist_id
      CROSS JOIN LATERAL unnest(COALESCE(a.genres, ARRAY[]::text[])) AS g
      WHERE btrim(g) <> ''
        AND lower(btrim(g)) <> 'small artist'
    ) tags
    GROUP BY tags.event_id
  )
  SELECT u.event_id, u.genres
  FROM unioned u
  JOIN public.events e ON e.id = u.event_id
  WHERE COALESCE(e.genres, ARRAY[]::text[]) IS DISTINCT FROM u.genres;

  UPDATE public.events e
  SET genres = w.genres
  FROM festival_genre_writes w
  WHERE e.id = w.event_id;

  FOR rec IN SELECT event_id, genres FROM festival_genre_writes
  LOOP
    PERFORM public.sync_event_genres(rec.event_id, rec.genres);
  END LOOP;

  ALTER TABLE public.events ENABLE TRIGGER update_events_updated_at;
  ALTER TABLE public.events ENABLE TRIGGER trigger_update_artist_upcoming_events;
  ALTER TABLE public.events ENABLE TRIGGER trigger_update_venue_upcoming_events;
EXCEPTION
  WHEN OTHERS THEN
    ALTER TABLE public.events ENABLE TRIGGER update_events_updated_at;
    ALTER TABLE public.events ENABLE TRIGGER trigger_update_artist_upcoming_events;
    ALTER TABLE public.events ENABLE TRIGGER trigger_update_venue_upcoming_events;
    RAISE;
END
$fest$;

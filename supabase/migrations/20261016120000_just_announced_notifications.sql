-- "Just announced": shows JamBase first listed in the last 10 days.
--   10 days is a test window: presales usually open 1-2 weeks after announcement.
--   Engagement by day-since-announcement is tracked in
--   20261016140000_just_announced_tracking.sql to tune it.
--   * Notifications: tell a user when an artist they follow (or have on their
--     bucket list) announces a new show near the location they browse with.
--   * Feed: get_just_announced_events() returns new shows near the user, the user's
--     own artists first; the app pins/weaves them into the recommendation feed.
--
-- Safe to re-run: every statement is idempotent.
--
-- Why announced_at, not created_at: created_at is when OUR sync first saw the row.
-- A backfill, a new market, or a late/failed sync would make months-old shows look
-- new. announced_at is JamBase's own event.datePublished, which stays fixed no
-- matter when we sync it. Every row that exists before the sync change ships has
-- announced_at = NULL, so old shows can never trigger this.
--
-- We don't get presale/on-sale dates from JamBase (offers carry no availability or
-- sale-start data), so the message doesn't promise a presale time.
--
-- ORDER: run this BEFORE deploying the backend sync change that writes
-- announced_at, or the sync's event upsert will fail on the unknown column.
--
-- Run this in the Supabase SQL editor.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS announced_at timestamptz;

CREATE INDEX IF NOT EXISTS events_announced_at_idx
  ON public.events (announced_at)
  WHERE announced_at IS NOT NULL;

COMMENT ON COLUMN public.events.announced_at IS
  'JamBase event.datePublished: when the show was first announced/listed. NULL for rows synced before this column existed.';

-- The location a user browses with in the app. Kept separate from users.latitude /
-- location_city, which are profile identity fields (see BrowseLocationContext).
CREATE TABLE IF NOT EXISTS public.user_browse_locations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  radius_miles int NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_browse_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_browse_locations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_browse_location(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_miles int
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;
  IF p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180
     OR p_radius_miles NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid browse location';
  END IF;

  INSERT INTO public.user_browse_locations (user_id, latitude, longitude, radius_miles, updated_at)
  VALUES (uid, p_latitude, p_longitude, p_radius_miles, now())
  ON CONFLICT (user_id) DO UPDATE
    SET latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        radius_miles = EXCLUDED.radius_miles,
        updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_browse_location(double precision, double precision, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_browse_location(double precision, double precision, int) TO authenticated;

-- One row per (user, event) already covered by a just-announced notification,
-- so a show is never announced to the same user twice.
CREATE TABLE IF NOT EXISTS public.just_announced_sent (
  user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

ALTER TABLE public.just_announced_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.just_announced_sent FROM anon, authenticated;

-- Great-circle distance in miles (haversine).
CREATE OR REPLACE FUNCTION public.miles_between(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 3958.8 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

DO $$ BEGIN
  ASSERT public.miles_between(38.9072, -77.0369, 38.9072, -77.0369) = 0, 'same point is 0 miles';
  ASSERT public.miles_between(38.9072, -77.0369, 39.2904, -76.6122) BETWEEN 33 AND 37, 'DC to Baltimore is ~35 miles';
  ASSERT public.miles_between(38.9072, -77.0369, 40.7128, -74.0060) BETWEEN 200 AND 210, 'DC to NYC is ~204 miles';
END $$;

CREATE OR REPLACE FUNCTION public.notify_just_announced()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sent int;
  local_hour int := extract(hour FROM now() AT TIME ZONE 'America/New_York');
BEGIN
  -- Quiet hours (US Eastern, same approximation as the other notification jobs).
  -- Shows announced overnight are still inside the 10-day window when 9am comes.
  IF local_hour < 9 OR local_hour >= 21 THEN
    RETURN 0;
  END IF;

  WITH new_events AS (
    SELECT e.id, e.artist_id, e.title, e.event_date, e.announced_at,
           e.latitude, e.longitude, e.venue_city,
           coalesce(v.name, e.venue_city, 'a venue near you') AS venue_name,
           coalesce(a.name, e.title) AS artist_name
    FROM public.events e
    LEFT JOIN public.venues v ON v.id = e.venue_id
    LEFT JOIN public.artists a ON a.id = e.artist_id
    WHERE e.announced_at > now() - interval '10 days'
      -- Second guard: we must also have first synced it recently.
      AND e.created_at > now() - interval '11 days'
      AND e.event_date > now()
      AND e.artist_id IS NOT NULL
  ),
  fans AS (
    SELECT f.user_id, f.artist_id FROM public.artist_follows f
    UNION
    SELECT b.user_id, en.entity_uuid
    FROM public.bucket_list b
    JOIN public.entities en ON en.id = b.entity_id AND en.entity_type = 'artist'
  ),
  matches AS (
    SELECT fa.user_id, ne.*
    FROM new_events ne
    JOIN fans fa ON fa.artist_id = ne.artist_id
    LEFT JOIN public.user_browse_locations bl ON bl.user_id = fa.user_id
    LEFT JOIN public.users u ON u.user_id = fa.user_id
    WHERE NOT EXISTS (
        SELECT 1 FROM public.just_announced_sent s
        WHERE s.user_id = fa.user_id AND s.event_id = ne.id
      )
      AND (
        -- 1. Location the user browses with in the app (their radius).
        (bl.user_id IS NOT NULL AND ne.latitude IS NOT NULL
          AND public.miles_between(bl.latitude, bl.longitude, ne.latitude, ne.longitude) <= bl.radius_miles)
        -- 2. No app location yet: profile coordinates, 50 miles.
        OR (bl.user_id IS NULL AND u.latitude IS NOT NULL AND ne.latitude IS NOT NULL
          AND public.miles_between(u.latitude, u.longitude, ne.latitude, ne.longitude) <= 50)
        -- 3. Neither: profile city name.
        OR (bl.user_id IS NULL AND u.latitude IS NULL
          AND lower(trim(u.location_city)) = lower(trim(ne.venue_city)))
      )
  ),
  eligible AS (
    -- Same spacing rules as re-engagement: nothing non-chat in 4h, < 3 in 24h.
    -- Skipped users are retried next hour while the show is still inside 10 days.
    SELECT m.*
    FROM matches m
    WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = m.user_id
          AND n.type NOT IN ('message', 'chat_message', 'group_chat_invite')
          AND n.created_at > now() - interval '4 hours'
      )
      AND (
        SELECT count(*) FROM public.notifications n
        WHERE n.user_id = m.user_id
          AND n.type NOT IN ('message', 'chat_message', 'group_chat_invite')
          AND n.created_at > now() - interval '24 hours'
      ) < 3
  ),
  -- One notification per user per run: the earliest-announced show, plus a count of the rest.
  per_user AS (
    SELECT DISTINCT ON (user_id)
      user_id, id AS event_id, artist_id, artist_name, venue_name, event_date,
      count(*) OVER (PARTITION BY user_id) AS total,
      array_agg(id) OVER (PARTITION BY user_id) AS all_event_ids
    FROM eligible
    ORDER BY user_id, announced_at, event_date
  ),
  mark_sent AS (
    INSERT INTO public.just_announced_sent (user_id, event_id)
    SELECT user_id, unnest(all_event_ids) FROM per_user
    ON CONFLICT DO NOTHING
  )
  INSERT INTO public.notifications (user_id, type, title, message, data)
  SELECT
    user_id,
    'artist_new_event',
    artist_name || ' just announced a show near you',
    venue_name || ' · ' || to_char(event_date AT TIME ZONE 'America/New_York', 'Dy, Mon FMDD')
      || CASE WHEN total > 1 THEN ' (+' || (total - 1) || ' more new show' || CASE WHEN total > 2 THEN 's' ELSE '' END || ')' ELSE '' END
      || '. Be first in line when tickets drop.',
    jsonb_build_object('event_id', event_id, 'artist_id', artist_id, 'reason', 'just_announced')
  FROM per_user;

  GET DIAGNOSTICS sent = ROW_COUNT;
  RETURN sent;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_just_announced() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.notify_just_announced() IS
  'Hourly: notify followers/bucket-list fans of newly announced shows near their browse location. Scheduled via pg_cron (just-announced-notifications).';

DO $$ BEGIN
  PERFORM cron.unschedule('just-announced-notifications')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'just-announced-notifications');
END $$;

-- Minute 20: clear of notification-queue-release (:00/:15/:30/:45) and reengagement (:05).
SELECT cron.schedule(
  'just-announced-notifications',
  '20 * * * *',
  $$SELECT public.notify_just_announced();$$
);

-- Feed source: shows first listed in the last 10 days within p_radius_miles of the
-- browse location. Artists the caller follows / has bucket-listed come first.
-- Returns jsonb rows shaped like feed v5 payloads (id, title, artist_name, venue_name,
-- images, event_media_url, ticket_urls, ...) so both apps reuse their v5 mappers.
CREATE OR REPLACE FUNCTION public.get_just_announced_events(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_miles int DEFAULT 50,
  p_limit int DEFAULT 20
) RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH fan_artists AS (
    SELECT f.artist_id FROM public.artist_follows f WHERE f.user_id = auth.uid()
    UNION
    SELECT en.entity_uuid
    FROM public.bucket_list b
    JOIN public.entities en ON en.id = b.entity_id AND en.entity_type = 'artist'
    WHERE b.user_id = auth.uid()
  )
  SELECT jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'artist_id', e.artist_id,
    'artist_name', a.name,
    'venue_id', e.venue_id,
    'venue_name', v.name,
    'venue_city', e.venue_city,
    'venue_state', e.venue_state,
    'event_date', e.event_date,
    'images', to_jsonb(e.images),
    'event_media_url', e.event_media_url,
    'ticket_urls', to_jsonb(e.ticket_urls),
    'external_url', e.external_url,
    'announced_at', e.announced_at,
    'is_fan', e.artist_id IN (SELECT artist_id FROM fan_artists)
  )
  FROM public.events e
  LEFT JOIN public.artists a ON a.id = e.artist_id
  LEFT JOIN public.venues v ON v.id = e.venue_id
  WHERE e.announced_at > now() - interval '10 days'
    AND e.created_at > now() - interval '11 days'
    AND e.event_date > now()
    AND e.latitude IS NOT NULL
    AND public.miles_between(p_latitude, p_longitude, e.latitude, e.longitude)
        <= least(greatest(p_radius_miles, 1), 500)
  ORDER BY (e.artist_id IN (SELECT artist_id FROM fan_artists)) DESC, e.announced_at DESC
  LIMIT least(greatest(p_limit, 1), 50);
$$;

REVOKE EXECUTE ON FUNCTION public.get_just_announced_events(double precision, double precision, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_just_announced_events(double precision, double precision, int, int) TO authenticated;

-- VERIFY
SELECT jobname, schedule FROM cron.job WHERE jobname = 'just-announced-notifications';

-- Fix: the profile-city fallback in notify_just_announced() compared the full
-- profile city ("Washington, DC") to the venue city ("Washington"), so it never
-- matched. Compare only the part before the comma. Everything else is unchanged
-- from 20261016120000_just_announced_notifications.sql.
--
-- Run this in the Supabase SQL editor.

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
          -- Profile cities are stored as "Washington, DC"; venue_city is just "Washington".
          AND lower(trim(split_part(u.location_city, ',', 1))) = lower(trim(ne.venue_city)))
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

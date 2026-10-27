-- =============================================================================
-- Onboarding: suggested artists (3 pre-selected) + just-announced location fallback
-- =============================================================================
-- 1. notify_just_announced(): same as 20261018120000_just_announced_city_match_fix.sql
--    plus tier 4: a user with no browse location, no profile coordinates and no city
--    (city is optional in onboarding now) still hears about new shows by artists they
--    follow. Their title drops "near you". Blocks marked CHANGED (onboarding-solid).
-- 2. onboarding_suggested_artists(p_limit): the artist step's list, with the first 3
--    pre-selected. Sources in order: the user's streaming top artists, artists with
--    upcoming shows near them, then nationally. Never errors for missing data.
--
-- Run this in the Supabase SQL editor. Safe to re-run.
-- ROLLBACK: re-run 20261018120000_just_announced_city_match_fix.sql;
--           DROP FUNCTION public.onboarding_suggested_artists(int);
-- =============================================================================

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
    SELECT fa.user_id, ne.*,
           (bl.user_id IS NOT NULL OR u.latitude IS NOT NULL
             OR nullif(trim(u.location_city), '') IS NOT NULL) AS user_has_location
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
        -- 4. CHANGED (onboarding-solid): no location at all (city is optional now, web
        -- users may never set one). They follow / bucket-listed this artist, so a new
        -- show is worth knowing about wherever it is.
        OR (bl.user_id IS NULL AND u.latitude IS NULL AND nullif(trim(u.location_city), '') IS NULL)
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
      user_id, id AS event_id, artist_id, artist_name, venue_name, event_date, user_has_location,
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
    artist_name || CASE WHEN user_has_location THEN ' just announced a show near you' ELSE ' just announced a new show' END,
    venue_name || ' · ' || to_char(event_date AT TIME ZONE 'America/New_York', 'Dy, Mon FMDD')
      || CASE WHEN total > 1 THEN ' (+' || (total - 1) || ' more new show' || CASE WHEN total > 2 THEN 's' ELSE '' END || ')' ELSE '' END
      || '. Be first in line when tickets drop.',
    jsonb_build_object('event_id', event_id, 'artist_id', artist_id, 'reason', 'just_announced')
  FROM per_user;

  GET DIAGNOSTICS sent = ROW_COUNT;
  RETURN sent;
END;
$$;


CREATE OR REPLACE FUNCTION public.onboarding_suggested_artists(p_limit int DEFAULT 12)
RETURNS TABLE (id uuid, name text, image_url text, preselected boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  loc AS (
    SELECT coalesce(bl.latitude, u.latitude) AS lat,
           coalesce(bl.longitude, u.longitude) AS lng,
           coalesce(bl.radius_miles, 50)::numeric AS radius,
           lower(trim(split_part(coalesce(u.location_city, ''), ',', 1))) AS city
    FROM me
    LEFT JOIN public.users u ON u.user_id = me.uid
    LEFT JOIN public.user_browse_locations bl ON bl.user_id = me.uid
  ),
  followed AS (
    SELECT f.artist_id FROM public.artist_follows f, me WHERE f.user_id = me.uid
  ),
  streamed AS (
    SELECT lower(trim(t.x->>'name')) AS nm, min(t.ord) AS rnk
    FROM public.streaming_profiles sp
    CROSS JOIN me
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(sp.profile_data->'topArtists') = 'array'
           THEN sp.profile_data->'topArtists' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS t(x, ord)
    WHERE sp.user_id = me.uid AND nullif(trim(t.x->>'name'), '') IS NOT NULL
    GROUP BY 1
  ),
  candidates AS (
    -- 1. Their own listening.
    SELECT a.id, a.name, a.image_url, 1 AS tier, s.rnk::numeric AS score
    FROM public.artists a JOIN streamed s ON lower(trim(a.name)) = s.nm
    UNION ALL
    -- 2. Artists playing near them soon (bounding box first, then real distance).
    SELECT a.id, a.name, a.image_url, 2, -count(*)::numeric
    FROM public.events e
    JOIN public.artists a ON a.id = e.artist_id
    CROSS JOIN loc
    WHERE e.event_date > now() AND e.event_date < now() + interval '120 days'
      AND (
        (loc.lat IS NOT NULL AND e.latitude IS NOT NULL
          AND e.latitude BETWEEN loc.lat - loc.radius / 69.0 AND loc.lat + loc.radius / 69.0
          AND public.miles_between(loc.lat, loc.lng, e.latitude, e.longitude) <= loc.radius)
        OR (loc.lat IS NULL AND loc.city <> '' AND lower(trim(e.venue_city)) = loc.city)
      )
    GROUP BY a.id, a.name, a.image_url
    UNION ALL
    -- 3. Nationally busiest.
    (SELECT a.id, a.name, a.image_url, 3, -coalesce(a.num_upcoming_events, 0)::numeric
     FROM public.artists a
     WHERE nullif(trim(a.name), '') IS NOT NULL
     ORDER BY a.num_upcoming_events DESC NULLS LAST
     LIMIT 60)
  ),
  best AS (
    -- One row per artist name (the catalog has duplicate names), best source wins.
    SELECT DISTINCT ON (lower(trim(c.name))) c.*
    FROM candidates c
    WHERE nullif(trim(c.name), '') IS NOT NULL
      AND c.id NOT IN (SELECT artist_id FROM followed WHERE artist_id IS NOT NULL)
    ORDER BY lower(trim(c.name)), c.tier, c.score
  ),
  ordered AS (
    SELECT b.*, row_number() OVER (ORDER BY b.tier, b.score, b.name) AS rn FROM best b
  )
  SELECT o.id, o.name, o.image_url, o.rn <= 3 AS preselected
  FROM ordered o
  ORDER BY o.rn
  LIMIT greatest(1, least(coalesce(p_limit, 12), 50));
$$;

REVOKE EXECUTE ON FUNCTION public.onboarding_suggested_artists(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onboarding_suggested_artists(int) TO authenticated;

-- Smoke: in the SQL editor auth.uid() is null, so this exercises the national tier.
DO $$
DECLARE n int; pre int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE preselected) INTO n, pre
  FROM public.onboarding_suggested_artists(12);
  ASSERT n <= 12, 'respects p_limit';
  ASSERT pre <= 3, 'at most 3 preselected';
  ASSERT n = 0 OR pre = least(n, 3), 'first rows preselected';
END $$;

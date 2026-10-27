-- Onboarding artist suggestions: make it fast, and stop pre-picking photo-less stubs.
--
-- Measured 2026-10-26: onboarding_suggested_artists() took 3.5-8s and sometimes hit the
-- statement timeout (57014), so the artist step waited, then fell back to the old list.
-- Causes:
--   * the "near you" tier scanned the 120-day event window even with no location, and
--     with a location had no index for the latitude box (a box query alone took ~3s);
--   * the national tier sorted all 62k artists by num_upcoming_events (no index).
-- Also: the national tier pre-picked residency stubs with no photo ("Sinatra Live!").
--
-- Changes (same signature and output; app code unchanged):
--   1. indexes for both lookups;
--   2. the near-you tier is skipped outright when the user has no location;
--   3. a longitude box is added next to the latitude box;
--   4. the national tier only offers artists with a photo.
--
-- Run in the Supabase SQL editor. Safe to re-run. The indexes build in seconds at
-- current table sizes (62k artists, 337k events); writes wait briefly while they build.
-- ROLLBACK: re-run the onboarding_suggested_artists block of 20261024120000;
--           DROP INDEX public.idx_artists_num_upcoming_events, public.idx_events_latitude_date;

CREATE INDEX IF NOT EXISTS idx_artists_num_upcoming_events
  ON public.artists (num_upcoming_events DESC NULLS LAST)
  WHERE image_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_latitude_date
  ON public.events (latitude, event_date)
  WHERE latitude IS NOT NULL;

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
    -- 2. Artists playing near them soon. CHANGED: the guard is a one-time filter, so with
    -- no location the events table is never touched; lat + lng boxes use the new index.
    SELECT a.id, a.name, a.image_url, 2, -count(*)::numeric
    FROM public.events e
    JOIN public.artists a ON a.id = e.artist_id
    CROSS JOIN loc
    WHERE ((SELECT lat FROM loc) IS NOT NULL OR (SELECT city FROM loc) <> '')
      AND e.event_date > now() AND e.event_date < now() + interval '120 days'
      AND (
        (loc.lat IS NOT NULL AND e.latitude IS NOT NULL
          AND e.latitude BETWEEN loc.lat - loc.radius / 69.0 AND loc.lat + loc.radius / 69.0
          AND e.longitude BETWEEN loc.lng - loc.radius / (69.0 * greatest(cos(radians(loc.lat)), 0.2))
                              AND loc.lng + loc.radius / (69.0 * greatest(cos(radians(loc.lat)), 0.2))
          AND public.miles_between(loc.lat, loc.lng, e.latitude, e.longitude) <= loc.radius)
        OR (loc.lat IS NULL AND loc.city <> '' AND lower(trim(e.venue_city)) = loc.city)
      )
    GROUP BY a.id, a.name, a.image_url
    UNION ALL
    -- 3. Nationally busiest. CHANGED: photo required (matches the partial index), so
    -- photo-less stubs are never pre-picked.
    (SELECT a.id, a.name, a.image_url, 3, -coalesce(a.num_upcoming_events, 0)::numeric
     FROM public.artists a
     WHERE a.image_url IS NOT NULL
       AND nullif(trim(a.name), '') IS NOT NULL
     ORDER BY a.num_upcoming_events DESC NULLS LAST
     LIMIT 60)
  ),
  best AS (
    -- One row per artist name (the catalog has duplicate names), best source wins;
    -- among same-name duplicates prefer the one with a photo.
    SELECT DISTINCT ON (lower(trim(c.name))) c.*
    FROM candidates c
    WHERE nullif(trim(c.name), '') IS NOT NULL
      AND c.id NOT IN (SELECT artist_id FROM followed WHERE artist_id IS NOT NULL)
    ORDER BY lower(trim(c.name)), c.tier, c.score, (c.image_url IS NULL), c.id
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
DECLARE n int; pre int; no_photo int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE preselected), count(*) FILTER (WHERE image_url IS NULL)
  INTO n, pre, no_photo
  FROM public.onboarding_suggested_artists(12);
  ASSERT n <= 12, 'respects p_limit';
  ASSERT n = 0 OR pre = least(n, 3), 'first rows preselected';
  ASSERT no_photo = 0, 'national picks all have photos';
END $$;

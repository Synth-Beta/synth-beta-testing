-- Onboarding artist step: stop following artists the user never chose.
--
-- The first 3 suggestions were pre-checked and followed unless unchecked. With no music
-- connected, those came from the "near you" / nationally busiest tiers, so new users ended
-- up following Sinatra Live!, Grand Ole Opry and ABBA Voyage beside their real picks, and
-- their feed was built on those follows.
--
-- Changes (same signature and output):
--   1. preselected is true only for tier 1, the user's own listening;
--   2. residencies and tribute acts are no longer suggested in the near-you or national
--      tiers. Tier 1 stays unfiltered: if they listen to it, it is theirs.
--
-- App builds before 1.5.3 check the first 3 rows when none are flagged, so change 2 is what
-- limits the damage until those builds age out.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ROLLBACK: re-run the function block of 20261027120000_onboarding_suggested_artists_speed.sql

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
    -- 2. Artists playing near them soon.
    SELECT a.id, a.name, a.image_url, 2, -count(*)::numeric
    FROM public.events e
    JOIN public.artists a ON a.id = e.artist_id
    CROSS JOIN loc
    WHERE ((SELECT lat FROM loc) IS NOT NULL OR (SELECT city FROM loc) <> '')
      AND e.event_date > now() AND e.event_date < now() + interval '120 days'
      -- CHANGED: 100+ shows is a residency, not a touring artist.
      AND coalesce(a.num_upcoming_events, 0) < 100
      AND a.name !~* 'tribute'
      AND NOT ('tribute' = ANY (coalesce(a.genres, '{}')))
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
    -- 3. Nationally busiest, with a photo. CHANGED: same residency and tribute filter.
    (SELECT a.id, a.name, a.image_url, 3, -coalesce(a.num_upcoming_events, 0)::numeric
     FROM public.artists a
     WHERE a.image_url IS NOT NULL
       AND nullif(trim(a.name), '') IS NOT NULL
       AND a.num_upcoming_events < 100
       AND a.name !~* 'tribute'
       AND NOT ('tribute' = ANY (coalesce(a.genres, '{}')))
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
  -- CHANGED: only their own listening starts checked.
  SELECT o.id, o.name, o.image_url, (o.rn <= 3 AND o.tier = 1) AS preselected
  FROM ordered o
  ORDER BY o.rn
  LIMIT greatest(1, least(coalesce(p_limit, 12), 50));
$$;

REVOKE EXECUTE ON FUNCTION public.onboarding_suggested_artists(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onboarding_suggested_artists(int) TO authenticated;

-- Smoke: in the SQL editor auth.uid() is null, so this exercises the national tier.
DO $$
DECLARE n int; pre int; bad int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE preselected), count(*) FILTER (WHERE name ~* 'tribute' OR name = 'Grand Ole Opry')
  INTO n, pre, bad
  FROM public.onboarding_suggested_artists(12);
  ASSERT n > 0, 'still suggests artists';
  ASSERT pre = 0, 'nothing pre-checked without listening data';
  ASSERT bad = 0, 'no residencies or tribute acts';
END $$;

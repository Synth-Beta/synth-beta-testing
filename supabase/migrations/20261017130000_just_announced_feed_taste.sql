-- Feed vs notifications for "just announced" shows (first listed by JamBase in the
-- last 10 days):
--   * Notifications (notify_just_announced, unchanged): ONLY artists the user follows
--     or has on their bucket list.
--   * Feed (this function): those same artists first, PLUS new shows that match the
--     user's taste - artist_preference_scores (listening stats, reviews, interest)
--     and genre_preference_scores - using the same slug-normalised, IDF-weighted,
--     relative-floor genre matching as get_personalized_feed_v5. Shows with no taste
--     match are left out, so the shelf isn't just "everything new nearby".
--
-- Same signature as before; replaces the version in
-- 20261016120000_just_announced_notifications.sql.
--
-- Run this in the Supabase SQL editor.

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
  WITH prefs AS (
    SELECT coalesce(up.genre_preference_scores, '{}'::jsonb) AS genres,
           coalesce(up.artist_preference_scores, '{}'::jsonb) AS artists
    FROM (SELECT 1) one
    LEFT JOIN public.user_preferences up ON up.user_id = auth.uid()
  ),
  -- Same relative floor as feed v5: a genre counts as taste only if its weighted score
  -- is >= 10% of the user's strongest one.
  genre_floor AS (
    SELECT coalesce(max(kv.value::numeric * coalesce(gi.idf_norm, 1)), 0) * 0.10 AS min_score
    FROM prefs, jsonb_each_text(prefs.genres) AS kv
    LEFT JOIN public.genre_idf gi ON gi.genre_slug = kv.key
  ),
  fan_artists AS (
    SELECT f.artist_id FROM public.artist_follows f WHERE f.user_id = auth.uid()
    UNION
    SELECT en.entity_uuid
    FROM public.bucket_list b
    JOIN public.entities en ON en.id = b.entity_id AND en.entity_type = 'artist'
    WHERE b.user_id = auth.uid()
  ),
  new_events AS (
    SELECT e.*
    FROM public.events e
    WHERE e.announced_at > now() - interval '10 days'
      AND e.created_at > now() - interval '11 days'
      AND e.event_date > now()
      AND e.latitude IS NOT NULL
      AND public.miles_between(p_latitude, p_longitude, e.latitude, e.longitude)
          <= least(greatest(p_radius_miles, 1), 500)
  ),
  scored AS (
    SELECT
      ne.*,
      ne.artist_id IN (SELECT artist_id FROM fan_artists) AS is_fan,
      greatest(coalesce((prefs.artists ->> ne.artist_id::text)::numeric, 0), 0) AS artist_score,
      coalesce((
        SELECT sum(coalesce((prefs.genres ->> gi.genre_slug)::numeric, 0) * gi.idf_norm)
               / power(greatest(coalesce(array_length(ne.genres, 1), 1), 1)::numeric, 0.25)
        FROM unnest(coalesce(ne.genres, ARRAY[]::text[])) AS g(genre)
        JOIN public.genre_idf gi ON gi.genre_slug = public.genre_match_slug(g.genre)
        WHERE coalesce((prefs.genres ->> gi.genre_slug)::numeric, 0) * gi.idf_norm
              >= (SELECT min_score FROM genre_floor)
          AND coalesce((prefs.genres ->> gi.genre_slug)::numeric, 0) > 0
      ), 0) AS genre_score
    FROM new_events ne, prefs
  )
  SELECT jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'artist_id', s.artist_id,
    'artist_name', a.name,
    'venue_id', s.venue_id,
    'venue_name', v.name,
    'venue_city', s.venue_city,
    'venue_state', s.venue_state,
    'event_date', s.event_date,
    'images', to_jsonb(s.images),
    'event_media_url', s.event_media_url,
    'ticket_urls', to_jsonb(s.ticket_urls),
    'external_url', s.external_url,
    'announced_at', s.announced_at,
    'is_fan', s.is_fan,
    'taste_score', round(s.artist_score + s.genre_score, 2)
  )
  FROM scored s
  LEFT JOIN public.artists a ON a.id = s.artist_id
  LEFT JOIN public.venues v ON v.id = s.venue_id
  WHERE s.is_fan OR s.artist_score > 0 OR s.genre_score > 0
  -- Your artists first, then strongest taste match, then newest announcement.
  ORDER BY s.is_fan DESC, (s.artist_score + s.genre_score) DESC, s.announced_at DESC
  LIMIT least(greatest(p_limit, 1), 50);
$$;

REVOKE EXECUTE ON FUNCTION public.get_just_announced_events(double precision, double precision, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_just_announced_events(double precision, double precision, int, int) TO authenticated;

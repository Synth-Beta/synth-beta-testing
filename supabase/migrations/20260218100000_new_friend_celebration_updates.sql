-- ============================================
-- New Friend Celebration Updates
-- ============================================
-- 1. Add avatar_url for current user and friend to RPC response
-- 2. Suggested events: geotagged near person1, person2, midpoint (only when far apart)
--    City resolution: location_city first, then bio (match city_centers)
--    Midpoint bucket only when far apart (>= 75mi); person1/person2 areas always used
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_new_friend_celebration_data(p_friend_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid;
  v_events_attended jsonb;
  v_shared_genres jsonb;
  v_suggested_events jsonb;
  v_shared_genres_arr text[];
  v_current_avatar text;
  v_friend_avatar text;
  v_user1_lat float;
  v_user1_lng float;
  v_user2_lat float;
  v_user2_lng float;
  v_mid_lat float;
  v_mid_lng float;
  v_distance_miles float;
  v_radius_miles float := 75;
  v_far_apart_threshold float := 75;  -- Only use person1/person2/midpoint when >= this far
BEGIN
  v_current_user_id := auth.uid();
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;
  
  -- Verify friendship exists
  IF NOT EXISTS (
    SELECT 1 FROM public.user_relationships
    WHERE relationship_type = 'friend' AND status = 'accepted'
      AND ((user_id = v_current_user_id AND related_user_id = p_friend_id)
           OR (user_id = p_friend_id AND related_user_id = v_current_user_id))
  ) THEN
    RAISE EXCEPTION 'Friendship not found or not accepted';
  END IF;

  -- Avatar URLs for both users
  SELECT avatar_url INTO v_current_avatar FROM public.users WHERE user_id = v_current_user_id;
  SELECT avatar_url INTO v_friend_avatar FROM public.users WHERE user_id = p_friend_id;

  -- Get lat/long for current user: location_city first, else bio (match city_centers)
  -- Uses city_centers for coordinates. Bio: substring match, prefer longer city names.
  SELECT cc.center_latitude::float, cc.center_longitude::float
  INTO v_user1_lat, v_user1_lng
  FROM public.users u
  LEFT JOIN public.city_centers cc ON (
    cc.normalized_name IS NOT NULL
    AND (
      -- location_city: exact match
      (u.location_city IS NOT NULL AND (
        regexp_replace(lower(trim(cc.normalized_name)), '\s+', ' ', 'g') =
        regexp_replace(lower(trim(u.location_city)), '\s+', ' ', 'g')
        OR (cc.aliases IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(cc.aliases) a
          WHERE regexp_replace(lower(trim(a)), '\s+', ' ', 'g') =
               regexp_replace(lower(trim(u.location_city)), '\s+', ' ', 'g')
        ))
      ))
      -- bio: city name appears in bio (when location_city null)
      OR (u.location_city IS NULL AND u.bio IS NOT NULL AND length(trim(u.bio)) > 0
          AND (position(lower(regexp_replace(trim(cc.normalized_name), '\s+', ' ', 'g')) in lower(u.bio)) > 0
              OR (cc.aliases IS NOT NULL AND EXISTS (
                SELECT 1 FROM unnest(cc.aliases) a
                WHERE position(lower(regexp_replace(trim(a), '\s+', ' ', 'g')) in lower(u.bio)) > 0
              ))))
    )
  )
  WHERE u.user_id = v_current_user_id
  ORDER BY
    CASE WHEN u.location_city IS NOT NULL THEN 0 ELSE 1 END,  -- Prefer location_city match
    cc.population DESC NULLS LAST,
    length(cc.normalized_name) DESC  -- Prefer longer names (e.g. "New York" over "New")
  LIMIT 1;

  -- Get lat/long for friend: same logic
  SELECT cc.center_latitude::float, cc.center_longitude::float
  INTO v_user2_lat, v_user2_lng
  FROM public.users u
  LEFT JOIN public.city_centers cc ON (
    cc.normalized_name IS NOT NULL
    AND (
      (u.location_city IS NOT NULL AND (
        regexp_replace(lower(trim(cc.normalized_name)), '\s+', ' ', 'g') =
        regexp_replace(lower(trim(u.location_city)), '\s+', ' ', 'g')
        OR (cc.aliases IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(cc.aliases) a
          WHERE regexp_replace(lower(trim(a)), '\s+', ' ', 'g') =
               regexp_replace(lower(trim(u.location_city)), '\s+', ' ', 'g')
        ))
      ))
      OR (u.location_city IS NULL AND u.bio IS NOT NULL AND length(trim(u.bio)) > 0
          AND (position(lower(regexp_replace(trim(cc.normalized_name), '\s+', ' ', 'g')) in lower(u.bio)) > 0
              OR (cc.aliases IS NOT NULL AND EXISTS (
                SELECT 1 FROM unnest(cc.aliases) a
                WHERE position(lower(regexp_replace(trim(a), '\s+', ' ', 'g')) in lower(u.bio)) > 0
              ))))
    )
  )
  WHERE u.user_id = p_friend_id
  ORDER BY
    CASE WHEN u.location_city IS NOT NULL THEN 0 ELSE 1 END,
    cc.population DESC NULLS LAST,
    length(cc.normalized_name) DESC
  LIMIT 1;

  -- Distance between users (for far-apart logic)
  IF v_user1_lat IS NOT NULL AND v_user1_lng IS NOT NULL AND v_user2_lat IS NOT NULL AND v_user2_lng IS NOT NULL THEN
    v_distance_miles := calculate_distance(v_user1_lat, v_user1_lng, v_user2_lat, v_user2_lng);
  ELSE
    v_distance_miles := 0;  -- Treat as "close" when we can't compute
  END IF;

  -- Midpoint only when BOTH have coords AND they're far apart
  IF v_user1_lat IS NOT NULL AND v_user2_lat IS NOT NULL AND v_distance_miles >= v_far_apart_threshold THEN
    v_mid_lat := (v_user1_lat + v_user2_lat) / 2.0;
    v_mid_lng := (v_user1_lng + v_user2_lng) / 2.0;
  ELSE
    v_mid_lat := NULL;
    v_mid_lng := NULL;
  END IF;

  -- Events attended together: both users have reviews with was_there=true or non-draft review
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'event_date', e.event_date,
        'venue_city', e.venue_city,
        'venue_name', v.name,
        'artist_name', a.name
      )
      ORDER BY e.event_date DESC
    ),
    '[]'::jsonb
  ) INTO v_events_attended
  FROM (
    SELECT DISTINCT r1.event_id
    FROM public.reviews r1
    INNER JOIN public.reviews r2 ON r1.event_id = r2.event_id AND r2.user_id = p_friend_id
    WHERE r1.user_id = v_current_user_id
      AND r1.event_id IS NOT NULL
      AND r1.is_draft = false
      AND r2.is_draft = false
      AND (r1.was_there = true OR (r1.review_text IS NOT NULL AND r1.review_text != 'ATTENDANCE_ONLY'))
      AND (r2.was_there = true OR (r2.review_text IS NOT NULL AND r2.review_text != 'ATTENDANCE_ONLY'))
  ) shared
  INNER JOIN public.events e ON e.id = shared.event_id
  LEFT JOIN public.artists a ON a.id = e.artist_id
  LEFT JOIN public.venues v ON v.id = e.venue_id;

  -- Shared genres: intersection of user_preferences.top_genres
  WITH shared AS (
    SELECT unnest(up1.top_genres) AS genre
    FROM public.user_preferences up1
    WHERE up1.user_id = v_current_user_id AND up1.top_genres IS NOT NULL AND array_length(up1.top_genres, 1) > 0
    INTERSECT
    SELECT unnest(up2.top_genres)
    FROM public.user_preferences up2
    WHERE up2.user_id = p_friend_id AND up2.top_genres IS NOT NULL AND array_length(up2.top_genres, 1) > 0
  )
  SELECT
    COALESCE(jsonb_agg(genre ORDER BY genre), '[]'::jsonb),
    COALESCE(ARRAY_AGG(genre ORDER BY genre), '{}')
  INTO v_shared_genres, v_shared_genres_arr
  FROM shared;

  IF v_shared_genres_arr IS NULL THEN
    v_shared_genres_arr := '{}';
  END IF;

  -- Suggested events: match shared genres AND geotagged near person1, person2, or midpoint
  -- Union of: events near user1, events near user2, events near midpoint (each up to 2-3)
  WITH genre_match AS (
    SELECT e2.id, e2.title, e2.event_date, e2.venue_city, e2.venue_id, e2.artist_id, e2.genres,
           e2.latitude, e2.longitude
    FROM public.events e2
    WHERE e2.event_date > now()
      AND e2.latitude IS NOT NULL AND e2.longitude IS NOT NULL
      AND (
        (array_length(v_shared_genres_arr, 1) > 0 AND e2.genres && v_shared_genres_arr)
        OR (array_length(v_shared_genres_arr, 1) IS NULL OR array_length(v_shared_genres_arr, 1) = 0)
      )
  ),
  near_user1 AS (
    SELECT gm.*, calculate_distance(v_user1_lat, v_user1_lng, gm.latitude::float, gm.longitude::float) AS dist
    FROM genre_match gm
    WHERE v_user1_lat IS NOT NULL AND v_user1_lng IS NOT NULL
      AND calculate_distance(v_user1_lat, v_user1_lng, gm.latitude::float, gm.longitude::float) <= v_radius_miles
    ORDER BY dist ASC
    LIMIT 2
  ),
  near_user2 AS (
    SELECT gm.*, calculate_distance(v_user2_lat, v_user2_lng, gm.latitude::float, gm.longitude::float) AS dist
    FROM genre_match gm
    WHERE v_user2_lat IS NOT NULL AND v_user2_lng IS NOT NULL
      AND calculate_distance(v_user2_lat, v_user2_lng, gm.latitude::float, gm.longitude::float) <= v_radius_miles
      AND gm.id NOT IN (SELECT id FROM near_user1)
    ORDER BY dist ASC
    LIMIT 2
  ),
  near_mid AS (
    SELECT gm.*, calculate_distance(v_mid_lat, v_mid_lng, gm.latitude::float, gm.longitude::float) AS dist
    FROM genre_match gm
    WHERE v_mid_lat IS NOT NULL AND v_mid_lng IS NOT NULL  -- Only set when far apart
      AND calculate_distance(v_mid_lat, v_mid_lng, gm.latitude::float, gm.longitude::float) <= v_radius_miles
      AND gm.id NOT IN (SELECT id FROM near_user1)
      AND gm.id NOT IN (SELECT id FROM near_user2)
    ORDER BY dist ASC
    LIMIT 2
  ),
  -- Fallback: if no geo coords, just use shared-genre events
  fallback AS (
    SELECT gm.*
    FROM genre_match gm
    WHERE v_user1_lat IS NULL AND v_user2_lat IS NULL
    ORDER BY gm.event_date ASC
    LIMIT 5
  ),
  combined AS (
    SELECT id, title, event_date, venue_city, venue_id, artist_id, genres FROM near_user1
    UNION
    SELECT id, title, event_date, venue_city, venue_id, artist_id, genres FROM near_user2
    UNION
    SELECT id, title, event_date, venue_city, venue_id, artist_id, genres FROM near_mid
    UNION
    SELECT id, title, event_date, venue_city, venue_id, artist_id, genres FROM fallback
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ev.id,
        'title', ev.title,
        'event_date', ev.event_date,
        'venue_city', ev.venue_city,
        'venue_name', vn.name,
        'artist_name', ar.name,
        'genres', ev.genres
      )
    ),
    '[]'::jsonb
  ) INTO v_suggested_events
  FROM (
    SELECT * FROM combined
    ORDER BY event_date ASC
    LIMIT 6
  ) ev
  LEFT JOIN public.artists ar ON ar.id = ev.artist_id
  LEFT JOIN public.venues vn ON vn.id = ev.venue_id;

  RETURN jsonb_build_object(
    'events_attended_together', COALESCE(v_events_attended, '[]'::jsonb),
    'shared_genres', COALESCE(v_shared_genres, '[]'::jsonb),
    'suggested_events', COALESCE(v_suggested_events, '[]'::jsonb),
    'current_user_avatar_url', v_current_avatar,
    'friend_avatar_url', v_friend_avatar
  );
END;
$$;

COMMENT ON FUNCTION public.get_new_friend_celebration_data IS 'Returns events attended together, shared genres, suggested events (geotagged near person1, person2, midpoint), and avatar URLs for new friend celebration popup.';

COMMIT;

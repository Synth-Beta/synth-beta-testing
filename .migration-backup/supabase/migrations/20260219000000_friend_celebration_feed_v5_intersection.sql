-- ============================================
-- Friend Celebration: Following overlap + feed v5 recommending intersection
-- ============================================
-- Suggested events: (1) Following overlap—events BOTH users follow (artist/venue/going/maybe).
-- (2) Recommending intersection—events in both feed v5 recommending pools (genre-weighted, no trending).
-- Returns up to 10 events, prioritizing following overlap.
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_new_friend_celebration_data(p_friend_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
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
  -- Feed v5 params
  v_min_ts timestamptz;
  v_max_ts timestamptz;
  v_min_lat numeric;
  v_max_lat numeric;
  v_min_lng numeric;
  v_max_lng numeric;
  v_has_location boolean;
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
  SELECT cc.center_latitude::float, cc.center_longitude::float
  INTO v_user1_lat, v_user1_lng
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
  WHERE u.user_id = v_current_user_id
  ORDER BY
    CASE WHEN u.location_city IS NOT NULL THEN 0 ELSE 1 END,
    cc.population DESC NULLS LAST,
    length(cc.normalized_name) DESC
  LIMIT 1;

  -- Get lat/long for friend
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

  -- Combined bounding box for feed v5 (union of both users' 50-mile boxes)
  v_has_location := (v_user1_lat IS NOT NULL AND v_user1_lng IS NOT NULL)
                 OR (v_user2_lat IS NOT NULL AND v_user2_lng IS NOT NULL);
  IF v_has_location THEN
    v_min_lat := LEAST(
      COALESCE(v_user1_lat, v_user2_lat) - (50.0 / 69.0),
      COALESCE(v_user2_lat, v_user1_lat) - (50.0 / 69.0)
    );
    v_max_lat := GREATEST(
      COALESCE(v_user1_lat, v_user2_lat) + (50.0 / 69.0),
      COALESCE(v_user2_lat, v_user1_lat) + (50.0 / 69.0)
    );
    v_min_lng := LEAST(
      COALESCE(v_user1_lng, v_user2_lng) - (50.0 / (69.0 * COS(RADIANS(COALESCE(v_user1_lat, v_user2_lat))))),
      COALESCE(v_user2_lng, v_user1_lng) - (50.0 / (69.0 * COS(RADIANS(COALESCE(v_user2_lat, v_user1_lat)))))
    );
    v_max_lng := GREATEST(
      COALESCE(v_user1_lng, v_user2_lng) + (50.0 / (69.0 * COS(RADIANS(COALESCE(v_user1_lat, v_user2_lat))))),
      COALESCE(v_user2_lng, v_user1_lng) + (50.0 / (69.0 * COS(RADIANS(COALESCE(v_user2_lat, v_user1_lat)))))
    );
  END IF;

  v_min_ts := NOW();
  v_max_ts := NOW() + (90 * INTERVAL '1 day');

  -- Events attended together
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

  -- Shared genres
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

  -- Suggested events: following overlap + feed v5 recommending intersection
  -- 1. Following overlap: events BOTH users follow (artist/venue/going/maybe) - prioritize these
  -- 2. Recommending intersection: events in both users' recommending pools (genre-weighted, no trending)
  WITH
  -- Following for user 1 (current user)
  following1 AS (
    SELECT e.id AS eid
    FROM public.events e
    WHERE e.event_date BETWEEN v_min_ts AND v_max_ts
      AND (
        EXISTS (SELECT 1 FROM public.artist_follows af WHERE af.user_id = v_current_user_id AND af.artist_id = e.artist_id)
        OR EXISTS (SELECT 1 FROM public.user_venue_relationships uvr WHERE uvr.user_id = v_current_user_id AND uvr.venue_id = e.venue_id)
        OR EXISTS (
          SELECT 1 FROM public.user_event_relationships uer
          WHERE uer.user_id = v_current_user_id AND uer.event_id = e.id
            AND uer.relationship_type IN ('going','maybe')
        )
      )
  ),
  -- Following for user 2 (friend)
  following2 AS (
    SELECT e.id AS eid
    FROM public.events e
    WHERE e.event_date BETWEEN v_min_ts AND v_max_ts
      AND (
        EXISTS (SELECT 1 FROM public.artist_follows af WHERE af.user_id = p_friend_id AND af.artist_id = e.artist_id)
        OR EXISTS (SELECT 1 FROM public.user_venue_relationships uvr WHERE uvr.user_id = p_friend_id AND uvr.venue_id = e.venue_id)
        OR EXISTS (
          SELECT 1 FROM public.user_event_relationships uer
          WHERE uer.user_id = p_friend_id AND uer.event_id = e.id
            AND uer.relationship_type IN ('going','maybe')
        )
      )
  ),
  -- Genre scores for both users (exactly one row each; '{}' if no prefs)
  genre_scores1 AS (
    SELECT COALESCE(genre_preference_scores, '{}'::jsonb) AS val
    FROM public.user_preferences WHERE user_id = v_current_user_id
    UNION ALL
    SELECT '{}'::jsonb WHERE NOT EXISTS (SELECT 1 FROM public.user_preferences WHERE user_id = v_current_user_id)
    LIMIT 1
  ),
  genre_scores2 AS (
    SELECT COALESCE(genre_preference_scores, '{}'::jsonb) AS val
    FROM public.user_preferences WHERE user_id = p_friend_id
    UNION ALL
    SELECT '{}'::jsonb WHERE NOT EXISTS (SELECT 1 FROM public.user_preferences WHERE user_id = p_friend_id)
    LIMIT 1
  ),
  -- Event weights for user 1 (recommending pool only, no trending/following)
  weights1 AS (
    SELECT
      e.id AS eid,
      (1.0 + COALESCE((
        SELECT SUM(
          COALESCE((g1.val->>g.genre)::NUMERIC, 0) +
          COALESCE((g1.val->>LOWER(g.genre))::NUMERIC, 0) +
          COALESCE((g1.val->>REPLACE(g.genre, ' ', ''))::NUMERIC, 0)
        )
        FROM unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) AS g(genre)
        CROSS JOIN genre_scores1 g1
      ), 0)) AS total_weight
    FROM public.events e
    CROSS JOIN genre_scores1
    WHERE e.event_date BETWEEN v_min_ts AND v_max_ts
      AND e.id NOT IN (SELECT eid FROM following1)
      AND (NOT v_has_location OR (
        e.latitude IS NOT NULL AND e.longitude IS NOT NULL
        AND e.latitude BETWEEN v_min_lat AND v_max_lat
        AND e.longitude BETWEEN v_min_lng AND v_max_lng
      ))
    LIMIT 10000
  ),
  -- Event weights for user 2 (recommending pool only, no trending/following)
  weights2 AS (
    SELECT
      e.id AS eid,
      (1.0 + COALESCE((
        SELECT SUM(
          COALESCE((g2.val->>g.genre)::NUMERIC, 0) +
          COALESCE((g2.val->>LOWER(g.genre))::NUMERIC, 0) +
          COALESCE((g2.val->>REPLACE(g.genre, ' ', ''))::NUMERIC, 0)
        )
        FROM unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) AS g(genre)
        CROSS JOIN genre_scores2 g2
      ), 0)) AS total_weight
    FROM public.events e
    CROSS JOIN genre_scores2
    WHERE e.event_date BETWEEN v_min_ts AND v_max_ts
      AND e.id NOT IN (SELECT eid FROM following2)
      AND (NOT v_has_location OR (
        e.latitude IS NOT NULL AND e.longitude IS NOT NULL
        AND e.latitude BETWEEN v_min_lat AND v_max_lat
        AND e.longitude BETWEEN v_min_lng AND v_max_lng
      ))
    LIMIT 10000
  ),
  -- Following overlap: events BOTH users follow (prioritize - both explicitly interested)
  following_overlap AS (
    SELECT f1.eid
    FROM following1 f1
    INNER JOIN following2 f2 ON f1.eid = f2.eid
  ),
  -- Recommending intersection: events in BOTH users' recommending pools
  rec_intersection AS (
    SELECT w1.eid, (w1.total_weight + w2.total_weight) AS combined_weight
    FROM weights1 w1
    INNER JOIN weights2 w2 ON w1.eid = w2.eid
  ),
  -- Combined: following overlap first (by event_date), then recommending (by combined_weight)
  -- Exclude from recommending any events already in following_overlap
  combined AS (
    SELECT fo.eid, 1 AS sort_rank, ev.event_date, 0::numeric AS combined_weight
    FROM following_overlap fo
    INNER JOIN public.events ev ON ev.id = fo.eid
    UNION ALL
    SELECT ri.eid, 2 AS sort_rank, ev.event_date, ri.combined_weight
    FROM rec_intersection ri
    INNER JOIN public.events ev ON ev.id = ri.eid
    WHERE ri.eid NOT IN (SELECT eid FROM following_overlap)
  ),
  -- Take up to 10: following first, then fill with recommending
  ordered AS (
    SELECT eid, sort_rank, event_date, combined_weight
    FROM combined
    ORDER BY sort_rank, combined_weight DESC NULLS LAST, event_date ASC
    LIMIT 10
  ),
  -- Fallback: when no intersection results, use shared-genre upcoming events (or any if no shared genres)
  fallback_events AS (
    SELECT e.id AS eid
    FROM public.events e
    WHERE e.event_date BETWEEN v_min_ts AND v_max_ts
      AND (
        (array_length(v_shared_genres_arr, 1) > 0 AND e.genres && v_shared_genres_arr)
        OR (array_length(v_shared_genres_arr, 1) IS NULL OR array_length(v_shared_genres_arr, 1) = 0)
      )
    ORDER BY e.event_date ASC
    LIMIT 10
  )
  SELECT COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object(
        'id', ev.id,
        'title', ev.title,
        'event_date', ev.event_date,
        'venue_city', ev.venue_city,
        'venue_name', vn.name,
        'artist_name', ar.name,
        'genres', ev.genres
      )
      ORDER BY o.sort_rank, o.combined_weight DESC NULLS LAST, o.event_date ASC
    )
    FROM ordered o
    INNER JOIN public.events ev ON ev.id = o.eid
    LEFT JOIN public.artists ar ON ar.id = ev.artist_id
    LEFT JOIN public.venues vn ON vn.id = ev.venue_id),
    (SELECT COALESCE(
      jsonb_agg(jsonb_build_object(
        'id', ev2.id, 'title', ev2.title, 'event_date', ev2.event_date,
        'venue_city', ev2.venue_city, 'venue_name', vn2.name, 'artist_name', ar2.name, 'genres', ev2.genres)
        ORDER BY ev2.event_date ASC),
      '[]'::jsonb
    )
    FROM fallback_events fe
    INNER JOIN public.events ev2 ON ev2.id = fe.eid
    LEFT JOIN public.artists ar2 ON ar2.id = ev2.artist_id
    LEFT JOIN public.venues vn2 ON vn2.id = ev2.venue_id)
  ) INTO v_suggested_events;

  RETURN jsonb_build_object(
    'events_attended_together', COALESCE(v_events_attended, '[]'::jsonb),
    'shared_genres', COALESCE(v_shared_genres, '[]'::jsonb),
    'suggested_events', COALESCE(v_suggested_events, '[]'::jsonb),
    'current_user_avatar_url', v_current_avatar,
    'friend_avatar_url', v_friend_avatar
  );
END;
$$;

COMMENT ON FUNCTION public.get_new_friend_celebration_data IS 'Returns events attended together, shared genres, and up to 10 suggested events: (1) following overlap—events BOTH users follow, (2) recommending intersection—events in both feed v5 recommending pools (genre-weighted, no trending).';

COMMIT;

-- ============================================================
-- Function: Get Recommended Group Chats
-- ============================================================
-- Similar to v4 feed engine, this function:
-- 1. Finds venues near user's location
-- 2. Finds artists matching user's genre preferences
-- 3. Returns verified group chats for those entities
-- 4. Excludes chats the user is already in
-- ============================================================

CREATE OR REPLACE FUNCTION get_recommended_chats(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_radius_miles NUMERIC DEFAULT 50
)
RETURNS TABLE(
  chat_id UUID,
  chat_name TEXT,
  entity_type TEXT,
  entity_id TEXT,
  entity_uuid UUID,
  entity_name TEXT,
  entity_image_url TEXT,
  member_count INT,
  last_activity_at TIMESTAMPTZ,
  relevance_score NUMERIC,
  distance_miles NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_lat NUMERIC;
  v_user_lng NUMERIC;
  v_top_genres TEXT[];
  v_genre_scores JSONB;
  v_user_chat_ids UUID[];
BEGIN
  -- Get user's location
  SELECT u.latitude, u.longitude
  INTO v_user_lat, v_user_lng
  FROM public.users u
  WHERE u.user_id = p_user_id;

  -- Get user's genre preferences
  SELECT 
    COALESCE(up.top_genres, ARRAY[]::TEXT[]),
    COALESCE(up.genre_preference_scores, '{}'::JSONB)
  INTO v_top_genres, v_genre_scores
  FROM public.user_preferences up
  WHERE up.user_id = p_user_id;

  -- Get list of chats user is already in (to exclude)
  SELECT ARRAY_AGG(DISTINCT cp.chat_id)
  INTO v_user_chat_ids
  FROM public.chat_participants cp
  WHERE cp.user_id = p_user_id;

  -- If user_chat_ids is NULL, set to empty array
  v_user_chat_ids := COALESCE(v_user_chat_ids, ARRAY[]::UUID[]);

  RETURN QUERY
  WITH
  -- Find venues near user's location
  nearby_venues AS (
    SELECT 
      v.id as venue_id,
      v.name as venue_name,
      v.image_url as venue_image_url,
      v.latitude,
      v.longitude,
      CASE 
        WHEN v_user_lat IS NOT NULL AND v_user_lng IS NOT NULL 
             AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
          calculate_distance(
            v_user_lat::FLOAT, 
            v_user_lng::FLOAT, 
            v.latitude::FLOAT, 
            v.longitude::FLOAT
          )::NUMERIC
        ELSE NULL
      END as distance_miles,
      -- Relevance score based on distance (closer = higher score)
      CASE 
        WHEN v_user_lat IS NOT NULL AND v_user_lng IS NOT NULL 
             AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
          GREATEST(
            100.0 - (
              calculate_distance(
                v_user_lat::FLOAT, 
                v_user_lng::FLOAT, 
                v.latitude::FLOAT, 
                v.longitude::FLOAT
              )::NUMERIC * 2.0
            ),
            0.0
          )
        ELSE 50.0 -- Default score if no location
      END as venue_score
    FROM public.venues v
    WHERE v.verified = true
      AND (
        v_user_lat IS NULL 
        OR v_user_lng IS NULL 
        OR v.latitude IS NULL 
        OR v.longitude IS NULL
        OR calculate_distance(
          v_user_lat::FLOAT, 
          v_user_lng::FLOAT, 
          v.latitude::FLOAT, 
          v.longitude::FLOAT
        ) <= p_radius_miles
      )
    ORDER BY distance_miles ASC NULLS LAST
    LIMIT 100 -- Limit candidate venues
  ),
  -- Find artists matching user's genre preferences
  matching_artists AS (
    SELECT 
      a.id as artist_id,
      a.name as artist_name,
      a.image_url as artist_image_url,
      a.genres as artist_genres,
      -- Calculate relevance score based on genre matches
      (
        CASE 
          WHEN a.genres IS NOT NULL AND array_length(a.genres, 1) > 0 THEN
            LEAST(
              (
                SELECT COALESCE(SUM(genre_score), 0)
                FROM (
                  SELECT 
                    COALESCE((v_genre_scores->>lower(trim(g)))::NUMERIC, 0) +
                    CASE 
                      WHEN lower(trim(g)) = ANY(
                        SELECT lower(trim(unnest(v_top_genres)))
                      ) THEN
                        -- Find position in top_genres array (case-insensitive)
                        GREATEST(
                          (
                            SELECT array_length(v_top_genres, 1) - pos + 1
                            FROM unnest(v_top_genres) WITH ORDINALITY AS t(genre, pos)
                            WHERE lower(trim(t.genre)) = lower(trim(g))
                            LIMIT 1
                          )::NUMERIC * 5.0,
                          0
                        )
                      ELSE 0 
                    END as genre_score
                  FROM unnest(a.genres) AS g
                ) genre_scores
              ),
              100.0
            )
          ELSE 0
        END
      ) as artist_score
    FROM public.artists a
    WHERE a.verified = true
      AND (
        -- If user has no preferences, include all verified artists
        (v_top_genres = ARRAY[]::TEXT[] AND v_genre_scores = '{}'::JSONB)
        -- Otherwise, match if artist has any genres in user's preferences
        OR a.genres IS NULL
        OR array_length(a.genres, 1) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(a.genres) g
          WHERE 
            (array_length(v_top_genres, 1) > 0 AND lower(trim(g)) = ANY(SELECT lower(trim(unnest(v_top_genres)))))
            OR (v_genre_scores ? lower(trim(g)))
        )
      )
    ORDER BY artist_score DESC
    LIMIT 100 -- Limit candidate artists
  ),
  -- Get verified chats for venues
  venue_chats AS (
    SELECT 
      c.id as chat_id,
      c.chat_name,
      c.entity_type,
      c.entity_id,
      c.entity_uuid,
      nv.venue_name as entity_name,
      COALESCE(nv.venue_image_url, '') as entity_image_url,
      c.member_count,
      c.last_activity_at,
      nv.venue_score as relevance_score,
      nv.distance_miles
    FROM public.chats c
    INNER JOIN nearby_venues nv ON nv.venue_id = c.entity_uuid
    WHERE c.is_verified = true
      AND c.entity_type = 'venue'
      AND c.id != ALL(v_user_chat_ids) -- Exclude chats user is already in
  ),
  -- Get verified chats for artists
  artist_chats AS (
    SELECT 
      c.id as chat_id,
      c.chat_name,
      c.entity_type,
      c.entity_id,
      c.entity_uuid,
      ma.artist_name as entity_name,
      COALESCE(ma.artist_image_url, '') as entity_image_url,
      c.member_count,
      c.last_activity_at,
      ma.artist_score as relevance_score,
      NULL::NUMERIC as distance_miles
    FROM public.chats c
    INNER JOIN matching_artists ma ON ma.artist_id = c.entity_uuid
    WHERE c.is_verified = true
      AND c.entity_type = 'artist'
      AND c.id != ALL(v_user_chat_ids) -- Exclude chats user is already in
  ),
  -- Get verified chats for events
  event_chats AS (
    SELECT 
      c.id as chat_id,
      c.chat_name,
      c.entity_type,
      c.entity_id,
      c.entity_uuid,
      e.title as entity_name,
      COALESCE(
        e.event_media_url,
        CASE WHEN array_length(e.media_urls, 1) > 0 THEN e.media_urls[1] ELSE NULL END,
        (e.images->0->>'url')::TEXT,
        ''
      ) as entity_image_url,
      c.member_count,
      c.last_activity_at,
      -- Relevance score based on event date proximity
      CASE 
        WHEN e.event_date IS NOT NULL THEN
          CASE 
            WHEN e.event_date::DATE - CURRENT_DATE BETWEEN 0 AND 7 THEN 80.0
            WHEN e.event_date::DATE - CURRENT_DATE BETWEEN 8 AND 30 THEN 60.0
            WHEN e.event_date::DATE - CURRENT_DATE BETWEEN 31 AND 90 THEN 40.0
            ELSE 20.0
          END
        ELSE 30.0
      END as relevance_score,
      CASE 
        WHEN v_user_lat IS NOT NULL AND v_user_lng IS NOT NULL 
             AND e.latitude IS NOT NULL AND e.longitude IS NOT NULL THEN
          calculate_distance(
            v_user_lat::FLOAT, 
            v_user_lng::FLOAT, 
            e.latitude::FLOAT, 
            e.longitude::FLOAT
          )::NUMERIC
        ELSE NULL
      END as distance_miles
    FROM public.chats c
    INNER JOIN public.events e ON e.id = c.entity_uuid
    WHERE c.is_verified = true
      AND c.entity_type = 'event'
      AND c.id != ALL(v_user_chat_ids) -- Exclude chats user is already in
      AND (e.event_date IS NULL OR e.event_date >= CURRENT_DATE) -- Only future events
  ),
  -- Combine venue, artist, and event chats
  all_recommended_chats AS (
    SELECT * FROM venue_chats
    UNION ALL
    SELECT * FROM artist_chats
    UNION ALL
    SELECT * FROM event_chats
  ),
  -- Fallback: If no verified chats found, get popular group chats
  -- Also include verified chats that might not have matched location/genre criteria
  fallback_chats AS (
    SELECT 
      c.id as chat_id,
      c.chat_name,
      c.entity_type,
      c.entity_id,
      c.entity_uuid,
      CASE 
        WHEN c.entity_type = 'venue' THEN v.name
        WHEN c.entity_type = 'artist' THEN a.name
        ELSE NULL
      END as entity_name,
      COALESCE(
        CASE 
          WHEN c.entity_type = 'venue' THEN v.image_url
          WHEN c.entity_type = 'artist' THEN a.image_url
          WHEN c.entity_type = 'event' THEN 
            COALESCE(
              e.event_media_url,
              CASE WHEN array_length(e.media_urls, 1) > 0 THEN e.media_urls[1] ELSE NULL END,
              (e.images->0->>'url')::TEXT
            )
          ELSE NULL
        END,
        ''
      ) as entity_image_url,
      COALESCE(c.member_count, 0) as member_count,
      c.last_activity_at,
      -- Relevance score based on member count and recency
      (
        LEAST(COALESCE(c.member_count, 0)::NUMERIC * 2.0, 50.0) +
        CASE 
          WHEN c.last_activity_at IS NOT NULL AND c.last_activity_at > NOW() - INTERVAL '7 days' THEN 30.0
          WHEN c.last_activity_at IS NOT NULL AND c.last_activity_at > NOW() - INTERVAL '30 days' THEN 15.0
          ELSE 0.0
        END +
        CASE 
          WHEN c.created_at > NOW() - INTERVAL '7 days' THEN 20.0
          ELSE 0.0
        END +
        -- Bonus for verified chats
        CASE WHEN c.is_verified = true THEN 10.0 ELSE 0.0 END
      ) as relevance_score,
      CASE 
        WHEN v_user_lat IS NOT NULL AND v_user_lng IS NOT NULL 
             AND c.entity_type = 'venue' AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
          calculate_distance(
            v_user_lat::FLOAT, 
            v_user_lng::FLOAT, 
            v.latitude::FLOAT, 
            v.longitude::FLOAT
          )::NUMERIC
        ELSE NULL
      END as distance_miles
    FROM public.chats c
    LEFT JOIN public.venues v ON v.id = c.entity_uuid AND c.entity_type = 'venue'
    LEFT JOIN public.artists a ON a.id = c.entity_uuid AND c.entity_type = 'artist'
    LEFT JOIN public.events e ON e.id = c.entity_uuid AND c.entity_type = 'event'
    WHERE c.is_group_chat = true
      AND c.id != ALL(v_user_chat_ids) -- Exclude chats user is already in
      -- Don't require member_count > 0, but prefer chats with members
      -- Also include verified chats even if they don't have members yet
    ORDER BY 
      CASE WHEN c.member_count > 0 THEN 1 ELSE 2 END, -- Prefer chats with members
      c.member_count DESC NULLS LAST,
      c.last_activity_at DESC NULLS LAST,
      c.created_at DESC
    LIMIT p_limit * 3 -- Get more candidates for fallback
  ),
  -- Final result: Use verified chats if available, otherwise use fallback
  final_chats AS (
    SELECT * FROM all_recommended_chats
    WHERE EXISTS (SELECT 1 FROM all_recommended_chats LIMIT 1)
    UNION ALL
    SELECT * FROM fallback_chats
    WHERE NOT EXISTS (SELECT 1 FROM all_recommended_chats LIMIT 1)
  )
  SELECT 
    fc.chat_id,
    fc.chat_name,
    fc.entity_type,
    fc.entity_id,
    fc.entity_uuid,
    fc.entity_name,
    fc.entity_image_url,
    fc.member_count,
    fc.last_activity_at,
    fc.relevance_score,
    fc.distance_miles
  FROM final_chats fc
  ORDER BY 
    fc.relevance_score DESC,
    fc.member_count DESC,
    fc.last_activity_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_recommended_chats(UUID, INT, INT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recommended_chats(UUID, INT, INT, NUMERIC) TO anon;

-- Comment
COMMENT ON FUNCTION get_recommended_chats IS 
'Returns recommended verified group chats based on user location (for venues) and genre preferences (for artists). Similar to v4 feed engine. Excludes chats the user is already in.';


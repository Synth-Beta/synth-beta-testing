-- ============================================================
-- Update get_personalized_feed_v3 to include all photo sources
-- Priority: event_media_url > images JSONB > media_urls > event_photos > reviews
-- Note: Uses actual schema columns (artist_jambase_id, venue_jambase_id, etc.)
-- ============================================================

-- Drop existing function first (any signature)
DROP FUNCTION IF EXISTS public.get_personalized_feed_v3 CASCADE;

CREATE OR REPLACE FUNCTION public.get_personalized_feed_v3(
  p_user_id        UUID,
  p_limit          INT DEFAULT 50,
  p_offset         INT DEFAULT 0,
  p_city_lat       NUMERIC DEFAULT NULL,
  p_city_lng       NUMERIC DEFAULT NULL,
  p_radius_miles   NUMERIC DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  score NUMERIC,
  payload JSONB,
  context JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  has_location BOOLEAN := p_city_lat IS NOT NULL AND p_city_lng IS NOT NULL;
BEGIN
  RETURN QUERY
  WITH 
  -- Step 1: Resolve Social Graph using existing connection functions
  social_graph AS (
    -- 1st degree friends (using existing function)
    SELECT 
      fdc.connected_user_id,
      1 AS connection_depth
    FROM get_first_degree_connections(p_user_id) fdc
    
    UNION ALL
    
    -- 2nd degree (friends of friends - using existing function)
    SELECT 
      sdc.connected_user_id,
      2 AS connection_depth
    FROM get_second_degree_connections(p_user_id) sdc
    
    UNION ALL
    
    -- 3rd degree (friends of friends of friends - using existing function)
    SELECT 
      tdc.connected_user_id,
      3 AS connection_depth
    FROM get_third_degree_connections(p_user_id) tdc
  ),
  
  -- User preferences CTE
  user_pref AS (
    SELECT
      COALESCE(preferred_genres, '{}'::TEXT[]) AS preferred_genres,
      COALESCE(preferred_artists, '{}'::UUID[]) AS preferred_artists,
      COALESCE(preferred_venues, '{}'::TEXT[]) AS preferred_venues,
      COALESCE(genre_preferences, '{}'::JSONB) AS genre_preferences,
      COALESCE(music_preference_signals, '{}'::JSONB) AS music_preference_signals
    FROM user_preferences
    WHERE user_id = p_user_id
    UNION ALL
    SELECT '{}'::TEXT[], '{}'::UUID[], '{}'::TEXT[], '{}'::JSONB, '{}'::JSONB
    WHERE NOT EXISTS (SELECT 1 FROM user_preferences WHERE user_id = p_user_id)
  ),
  
  -- Artist follows (3NF compliant - uses artist_follows table)
  artist_follows AS (
    SELECT
      af.artist_id AS artist_uuid,
      lower(trim(a.jambase_artist_id)) AS artist_id_text
    FROM artist_follows af
    JOIN artists a ON a.id = af.artist_id
    WHERE af.user_id = p_user_id
  ),
  
  -- Friend event interests (3NF compliant - uses user_event_relationships + social_graph)
  friend_event_interest AS (
    SELECT
      uer.event_id,
      COUNT(*) AS friend_count
    FROM user_event_relationships uer
    JOIN social_graph sg ON sg.connected_user_id = uer.user_id AND sg.connection_depth = 1
    WHERE uer.relationship_type IN ('going','maybe')
    GROUP BY uer.event_id
  ),
  
  -- Get best photo for each event (priority: event_photos > reviews > event fields)
  -- NOTE: event_photos lookup commented out - uncomment when event_photos table exists
  -- event_photos_lookup AS (
  --   SELECT DISTINCT ON (ep.event_id)
  --     ep.event_id,
  --     ep.photo_url AS best_photo_url
  --   FROM event_photos ep
  --   WHERE ep.event_id IS NOT NULL
  --     AND EXISTS (SELECT 1 FROM events e WHERE e.id = ep.event_id)
  --   ORDER BY ep.event_id, ep.is_featured DESC, ep.likes_count DESC, ep.created_at DESC
  -- ),
  
  -- Get best review photo for each event
  review_photos_lookup AS (
    SELECT DISTINCT ON (r.event_id)
      r.event_id,
      (r.photos[1])::TEXT AS best_photo_url
    FROM reviews r
    WHERE r.event_id IS NOT NULL 
      AND r.photos IS NOT NULL 
      AND array_length(r.photos, 1) > 0
    ORDER BY r.event_id, r.likes_count DESC, r.created_at DESC
  ),
  
  -- Step 2A: Event Candidates (enhanced v2 logic with comprehensive photo resolution)
  event_candidates AS (
    SELECT
      e.id AS event_id,
      e.title,
      e.artist_name,
      e.artist_jambase_id_text AS artist_id,
      e.artist_jambase_id AS artist_uuid,
      e.venue_name,
      e.venue_jambase_id_text AS venue_id,
      e.venue_jambase_id AS venue_uuid,
      e.venue_city,
      e.venue_state,
      e.venue_address,
      e.venue_zip,
      e.event_date,
      e.doors_time,
      e.description,
      e.genres,
      e.latitude,
      e.longitude,
      e.ticket_urls,
      e.ticket_available,
      e.price_range,
      e.price_min AS ticket_price_min,
      e.price_max AS ticket_price_max,
      e.is_promoted,
      e.promotion_tier,
      -- Comprehensive photo resolution with priority:
      -- 1. event_media_url (from artist)
      -- 2. images JSONB (first image URL, prefer 16:9 or large images)
      -- 3. media_urls array (first element)
      -- 4. event_photos (featured first, then by likes) - commented out
      -- 5. review photos (most liked)
      COALESCE(
        e.event_media_url,
        CASE 
          WHEN e.images IS NOT NULL AND jsonb_typeof(e.images) = 'array' AND jsonb_array_length(e.images) > 0 THEN
            COALESCE(
              (SELECT (img->>'url')::TEXT 
               FROM jsonb_array_elements(e.images) img 
               WHERE img->>'url' IS NOT NULL 
                 AND (img->>'ratio' = '16_9' OR (img->>'width')::INT > 1000)
               LIMIT 1),
              (e.images->0->>'url')::TEXT
            )
          ELSE NULL
        END,
        CASE 
          WHEN e.media_urls IS NOT NULL AND array_length(e.media_urls, 1) > 0 THEN e.media_urls[1]
          ELSE NULL
        END,
        -- epl.best_photo_url,  -- Uncomment when event_photos table exists
        rpl.best_photo_url
      ) AS poster_image_url,
      -- Also include images JSONB for frontend use
      e.images,
      CASE
        WHEN has_location AND e.latitude IS NOT NULL AND e.longitude IS NOT NULL THEN
          calculate_distance(p_city_lat::FLOAT, p_city_lng::FLOAT, e.latitude::FLOAT, e.longitude::FLOAT)::NUMERIC
        ELSE NULL
      END AS distance_miles,
      COALESCE(fei.friend_count, 0) AS friend_interest_count,
      COALESCE((
        SELECT COUNT(*) FROM user_event_relationships uer2
        WHERE uer2.relationship_type IN ('going','maybe')
          AND uer2.event_id = e.id
      ), 0) AS total_interest_count,
      CASE WHEN EXISTS (
        SELECT 1 FROM user_event_relationships uer3
        WHERE uer3.user_id = p_user_id
          AND uer3.relationship_type IN ('going','maybe')
          AND uer3.event_id = e.id
      ) THEN TRUE ELSE FALSE END AS user_is_interested
    FROM events e
    LEFT JOIN friend_event_interest fei ON fei.event_id = e.id
    -- LEFT JOIN event_photos_lookup epl ON epl.event_id = e.id  -- Uncomment when event_photos table exists
    LEFT JOIN review_photos_lookup rpl ON rpl.event_id = e.id
    WHERE e.event_date >= NOW() - INTERVAL '30 days'  -- Include recent past events
      AND (
        NOT has_location  -- If no location provided, show all events
        OR e.latitude IS NULL  -- If event has no location, include it
        OR e.longitude IS NULL  -- If event has no location, include it
        OR calculate_distance(p_city_lat::FLOAT, p_city_lng::FLOAT, e.latitude::FLOAT, e.longitude::FLOAT)::NUMERIC <= (p_radius_miles * 2.0)::NUMERIC  -- Wider radius
      )
      AND e.event_date <= NOW() + INTERVAL '365 days'  -- Full year of events
    ORDER BY e.event_date ASC, e.is_promoted DESC  -- Prioritize upcoming and promoted events
    LIMIT (p_limit * 5)::INTEGER  -- Much larger limit for better selection
  ),
  
  -- Artist follow lookup (optimized - precompute once)
  artist_follow_lookup AS (
    SELECT DISTINCT
      COALESCE(af.artist_uuid::TEXT, lower(trim(af.artist_id_text))) AS artist_key,
      TRUE AS is_followed
    FROM artist_follows af
    WHERE af.artist_uuid IS NOT NULL OR af.artist_id_text IS NOT NULL
  ),
  
  -- Event scoring (optimized with precomputed artist follows)
  scored_events AS (
    SELECT
      ec.*,
      (
        50::NUMERIC  -- Base score
        + COALESCE((
            SELECT SUM(
              CASE 
                WHEN jsonb_typeof(value) = 'number' THEN (value::TEXT)::NUMERIC
                WHEN value->>'weight' IS NOT NULL THEN (value->>'weight')::NUMERIC
                ELSE 1::NUMERIC
              END
            )
            FROM jsonb_each(up.genre_preferences)
            WHERE key = ANY(ec.genres)
          ), 0::NUMERIC) * 10  -- Genre match boost
        + CASE WHEN EXISTS (
            SELECT 1 FROM artist_follow_lookup afl
            WHERE afl.artist_key = COALESCE(ec.artist_uuid::TEXT, lower(trim(ec.artist_id)), '')
          ) THEN 100::NUMERIC ELSE 0::NUMERIC END  -- Artist follow boost
        + (ec.friend_interest_count::NUMERIC * 15)  -- Friend interest boost
        + CASE WHEN ec.is_promoted THEN 50::NUMERIC ELSE 0::NUMERIC END  -- Promotion boost
        + CASE 
            WHEN ec.promotion_tier = 'featured' THEN 100::NUMERIC
            WHEN ec.promotion_tier = 'premium' THEN 75::NUMERIC
            WHEN ec.promotion_tier = 'basic' THEN 25::NUMERIC
            ELSE 0::NUMERIC
          END  -- Promotion tier boost
        - CASE 
            WHEN ec.distance_miles IS NOT NULL AND ec.distance_miles > 0 THEN 
              LEAST(ec.distance_miles::NUMERIC / 10.0, 30::NUMERIC)  -- Distance penalty (max 30 points)
            ELSE 0::NUMERIC
          END  -- Distance penalty
        + CASE WHEN ec.user_is_interested THEN -200::NUMERIC ELSE 0::NUMERIC END  -- Exclude already interested events
      ) AS raw_score
    FROM event_candidates ec
    CROSS JOIN user_pref up
  ),
  
  -- Normalize scores (0-100 scale)
  normalized_events AS (
    SELECT
      se.*,
      CASE 
        WHEN MAX(se.raw_score) OVER () = MIN(se.raw_score) OVER () THEN 50::NUMERIC
        ELSE 50::NUMERIC + (
          (se.raw_score - MIN(se.raw_score) OVER ())::NUMERIC / 
          NULLIF(MAX(se.raw_score) OVER () - MIN(se.raw_score) OVER (), 0)::NUMERIC
        ) * 50::NUMERIC
      END AS normalized_score
    FROM scored_events se
  ),
  
  -- Step 3: Combine all candidates into unified feed items
  all_feed_items AS (
    -- Events
    SELECT
      ne.event_id::TEXT AS id,
      'event'::TEXT AS type,
      ne.normalized_score::NUMERIC AS score,
      jsonb_build_object(
        'event_id', ne.event_id,
        'title', ne.title,
        'artist_name', ne.artist_name,
        'artist_id', ne.artist_id,
        'artist_uuid', ne.artist_uuid,
        'venue_name', ne.venue_name,
        'venue_id', ne.venue_id,
        'venue_uuid', ne.venue_uuid,
        'venue_city', ne.venue_city,
        'venue_state', ne.venue_state,
        'venue_address', ne.venue_address,
        'venue_zip', ne.venue_zip,
        'event_date', ne.event_date,
        'doors_time', ne.doors_time,
        'description', ne.description,
        'genres', ne.genres,
        'latitude', ne.latitude,
        'longitude', ne.longitude,
        'ticket_urls', ne.ticket_urls,
        'ticket_available', ne.ticket_available,
        'price_range', ne.price_range,
        'ticket_price_min', ne.ticket_price_min,
        'ticket_price_max', ne.ticket_price_max,
        'poster_image_url', ne.poster_image_url,
        'images', ne.images,
        'distance_miles', ne.distance_miles,
        'is_promoted', ne.is_promoted,
        'promotion_tier', ne.promotion_tier,
        'friend_interest_count', ne.friend_interest_count,
        'total_interest_count', ne.total_interest_count,
        'user_is_interested', ne.user_is_interested,
        'has_friends_going', CASE WHEN ne.friend_interest_count >= 2 THEN TRUE ELSE FALSE END
      ) AS payload,
      jsonb_build_object(
        'relevance_score', ne.normalized_score,
        'raw_score', ne.raw_score,
        'friend_interest_count', ne.friend_interest_count,
        'distance_miles', ne.distance_miles
      ) AS context,
      ne.event_date AS created_at
    FROM normalized_events ne
    WHERE ne.user_is_interested = FALSE  -- Exclude events user is already interested in
    ORDER BY ne.normalized_score DESC, ne.event_date ASC
    LIMIT p_limit
    OFFSET p_offset
  )
  
  SELECT 
    afi.id::UUID,
    afi.type::TEXT,
    afi.score::NUMERIC,
    afi.payload::JSONB,
    afi.context::JSONB,
    afi.created_at::TIMESTAMPTZ
  FROM all_feed_items afi
  ORDER BY afi.score DESC, afi.created_at ASC;
END;
$function$;

COMMENT ON FUNCTION public.get_personalized_feed_v3 IS 
'Unified personalized feed v3 with comprehensive photo resolution. Photo priority: event_media_url > images JSONB > media_urls > event_photos > reviews';


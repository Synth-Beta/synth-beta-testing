-- ============================================================
-- Unified Personalized Feed v3
-- Multiple content types (events, reviews, friend suggestions, group chats)
-- in a single unified feed with smart blending
-- ============================================================

-- Ensure calculate_distance function exists (used for location filtering)
CREATE OR REPLACE FUNCTION public.calculate_distance(
    lat1 FLOAT, 
    lon1 FLOAT, 
    lat2 FLOAT, 
    lon2 FLOAT
) RETURNS FLOAT AS $$
BEGIN
    RETURN (
        3959 * acos(
            cos(radians(lat1)) * 
            cos(radians(lat2)) * 
            cos(radians(lon2) - radians(lon1)) + 
            sin(radians(lat1)) * 
            sin(radians(lat2))
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Drop existing v3 if it exists
DROP FUNCTION IF EXISTS public.get_personalized_feed_v3(UUID, INT, INT, NUMERIC, NUMERIC, NUMERIC);

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
  
  -- Artist follows
  artist_follows AS (
    SELECT
      CASE
        WHEN related_entity_id ~* '^[0-9a-f-]{36}$' THEN related_entity_id::UUID
        ELSE NULL
      END AS artist_uuid,
      lower(trim(related_entity_id)) AS artist_id_text
    FROM relationships
    WHERE user_id = p_user_id
      AND related_entity_type = 'artist'
      AND relationship_type = 'follow'
      AND status = 'accepted'
  ),
  
  -- Friend event interests
  friend_event_interest AS (
    SELECT
      r.related_entity_id::UUID AS event_id,
      COUNT(*) AS friend_count
    FROM relationships r
    JOIN social_graph sg ON sg.connected_user_id = r.user_id AND sg.connection_depth = 1
    WHERE r.related_entity_type = 'event'
      AND r.relationship_type IN ('going','maybe')
    GROUP BY r.related_entity_id
  ),
  
  -- Step 2A: Event Candidates (enhanced v2 logic)
  event_candidates AS (
    SELECT
      e.id AS event_id,
      e.title,
      e.artist_name,
      e.artist_id,
      e.artist_uuid,
      e.venue_name,
      e.venue_id,
      e.venue_uuid,
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
      e.promoted AS is_promoted,
      e.promotion_tier,
      CASE
        WHEN e.media_urls IS NOT NULL AND array_length(e.media_urls, 1) > 0 THEN e.media_urls[1]
        ELSE NULL
      END AS poster_image_url,
      CASE
        WHEN has_location AND e.latitude IS NOT NULL AND e.longitude IS NOT NULL THEN
          calculate_distance(p_city_lat::FLOAT, p_city_lng::FLOAT, e.latitude::FLOAT, e.longitude::FLOAT)::NUMERIC
        ELSE NULL
      END AS distance_miles,
      COALESCE(fei.friend_count, 0) AS friend_interest_count,
      COALESCE((
        SELECT COUNT(*) FROM relationships r2
        WHERE r2.related_entity_type = 'event'
          AND r2.relationship_type IN ('going','maybe')
          AND r2.related_entity_id::UUID = e.id
      ), 0) AS total_interest_count,
      CASE WHEN EXISTS (
        SELECT 1 FROM relationships r3
        WHERE r3.user_id = p_user_id
          AND r3.related_entity_type = 'event'
          AND r3.relationship_type IN ('going','maybe')
          AND r3.related_entity_id::UUID = e.id
      ) THEN TRUE ELSE FALSE END AS user_is_interested
    FROM events e
    LEFT JOIN friend_event_interest fei ON fei.event_id = e.id
    WHERE e.event_date >= NOW() - INTERVAL '30 days'  -- Include recent past events
      AND (
        NOT has_location  -- If no location provided, show all events
        OR e.latitude IS NULL  -- If event has no location, include it
        OR e.longitude IS NULL  -- If event has no location, include it
        OR calculate_distance(p_city_lat::FLOAT, p_city_lng::FLOAT, e.latitude::FLOAT, e.longitude::FLOAT)::NUMERIC <= (p_radius_miles * 2.0)::NUMERIC  -- Wider radius
      )
      AND e.event_date <= NOW() + INTERVAL '365 days'  -- Full year of events
    ORDER BY e.event_date ASC, e.promoted DESC  -- Prioritize upcoming and promoted events
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
            FROM user_pref up, jsonb_each(up.genre_preferences) g
            WHERE EXISTS (
              SELECT 1 FROM unnest(ec.genres) eg
              WHERE lower(trim(eg)) = lower(trim(g.key))
            )
          ), 0::NUMERIC) * 2::NUMERIC
        + CASE
            WHEN ec.artist_uuid IS NOT NULL AND (
              EXISTS (SELECT 1 FROM user_pref up WHERE ec.artist_uuid = ANY(up.preferred_artists))
              OR EXISTS (SELECT 1 FROM artist_follow_lookup afl WHERE afl.artist_key = ec.artist_uuid::TEXT)
            ) THEN 30::NUMERIC
            WHEN ec.artist_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM artist_follow_lookup afl WHERE afl.artist_key = lower(trim(ec.artist_id))
            ) THEN 25::NUMERIC
            ELSE 0::NUMERIC
          END
        + LEAST(ec.friend_interest_count * 8::NUMERIC, 25::NUMERIC)::NUMERIC
        + CASE
            WHEN ec.is_promoted THEN
              CASE ec.promotion_tier
                WHEN 'featured' THEN 35::NUMERIC
                WHEN 'premium' THEN 25::NUMERIC
                WHEN 'basic' THEN 15::NUMERIC
                ELSE 10::NUMERIC
              END
            ELSE 0::NUMERIC
          END
        + CASE
            WHEN ec.event_date <= (NOW() + INTERVAL '7 days') THEN 15::NUMERIC
            WHEN ec.event_date <= (NOW() + INTERVAL '30 days') THEN 10::NUMERIC
            WHEN ec.event_date <= (NOW() + INTERVAL '90 days') THEN 5::NUMERIC
            ELSE 0::NUMERIC
          END
        - CASE
            WHEN ec.distance_miles IS NOT NULL THEN LEAST((ec.distance_miles::NUMERIC / 8::NUMERIC), 15::NUMERIC)::NUMERIC
            ELSE 0::NUMERIC
          END
        + CASE WHEN ec.ticket_available THEN 5::NUMERIC ELSE 0::NUMERIC END
      )::NUMERIC AS raw_score
    FROM event_candidates ec
  ),
  
  -- Cache MIN/MAX for normalization (performance optimization)
  event_score_stats AS (
    SELECT
      COALESCE(MAX(raw_score), 0)::NUMERIC AS max_score,
      COALESCE(MIN(raw_score), 0)::NUMERIC AS min_score,
      COUNT(*) AS event_count
    FROM scored_events
  ),
  
  -- Normalize event scores to 0-100 (optimized with cached stats)
  normalized_events AS (
    SELECT
      se.*,
      CASE
        WHEN ess.event_count > 0 THEN
          CASE
            WHEN ess.max_score > ess.min_score THEN
              -- Normal distribution when there's a range
              ((se.raw_score::NUMERIC - ess.min_score)::NUMERIC / 
               NULLIF(ess.max_score - ess.min_score, 0::NUMERIC))::NUMERIC * 100::NUMERIC
            WHEN ess.max_score > 0::NUMERIC THEN
              -- All same score > 0, give them all 100
              100::NUMERIC
            ELSE
              -- All scores are 0, use raw score as-is (will be 0)
              se.raw_score::NUMERIC
          END
        ELSE 0::NUMERIC
      END AS normalized_score
    FROM scored_events se
    CROSS JOIN event_score_stats ess
    ORDER BY se.raw_score DESC
    LIMIT (p_limit * 3)::INTEGER  -- Larger limit for better event selection
  ),
  
  -- Step 2B: Review Candidates (from 1st, 2nd, 3rd degree connections, optimized)
  review_candidates AS (
    SELECT
      r.id AS review_id,
      r.user_id AS reviewer_id,
      r.event_id,
      r.rating,
      r.review_text,
      r.photos,
      r.likes_count,
      r.comments_count,
      r.shares_count,
      r.created_at AS review_created_at,
      COALESCE(sg_min.connection_depth, 999) AS connection_depth,
      -- Event info
      e.title AS event_title,
      e.artist_name,
      e.venue_name,
      e.event_date,
      e.venue_city,
      e.genres AS event_genres,
      -- Reviewer info
      u.name AS reviewer_name,
      u.avatar_url AS reviewer_avatar,
      u.verified AS reviewer_verified
    FROM reviews r
    JOIN events e ON e.id = r.event_id
    JOIN users u ON u.user_id = r.user_id
    LEFT JOIN LATERAL (
      SELECT MIN(connection_depth) AS connection_depth
      FROM social_graph sg2
      WHERE sg2.connected_user_id = r.user_id
      LIMIT 1
    ) sg_min ON true
    WHERE r.is_public = true
      AND r.is_draft = false
      AND r.review_text IS NOT NULL
      AND r.review_text != ''
      AND r.review_text != 'ATTENDANCE_ONLY'
      AND e.event_date >= NOW() - INTERVAL '90 days'  -- Wider window for reviews (3 months)
      AND r.user_id != p_user_id
      -- Show reviews from connections OR all public reviews if no connection (prioritize connections)
      AND (
        (sg_min.connection_depth IS NOT NULL AND sg_min.connection_depth <= 3)
        OR sg_min.connection_depth IS NULL  -- Include non-connection reviews too
      )
    ORDER BY r.created_at DESC  -- Most recent reviews first
    LIMIT (p_limit * 3)::INTEGER  -- Larger limit for review selection
  ),
  
  -- Review scoring
  scored_reviews AS (
    SELECT
      rc.*,
      (
        (CASE rc.connection_depth
          WHEN 1 THEN 30::NUMERIC
          WHEN 2 THEN 18::NUMERIC
          WHEN 3 THEN 8::NUMERIC
          ELSE 0::NUMERIC
        END)::NUMERIC
        -- Simplified: Skip city/genre matching for reviews to improve performance
        + 0::NUMERIC  -- Placeholder for city match (disabled for performance)
        + CASE
            WHEN EXISTS (
              SELECT 1 FROM user_pref up, unnest(up.preferred_genres) pg
              WHERE EXISTS (
                SELECT 1 FROM unnest(rc.event_genres) eg
                WHERE lower(trim(pg)) = lower(trim(eg))
              )
            ) THEN 10::NUMERIC
            ELSE 0::NUMERIC
          END
        + (LEAST(
          COALESCE(rc.likes_count, 0)::NUMERIC * 2::NUMERIC +
          COALESCE(rc.comments_count, 0)::NUMERIC * 3::NUMERIC +
          COALESCE(rc.shares_count, 0)::NUMERIC * 1::NUMERIC,
          15::NUMERIC
        ))::NUMERIC
      )::NUMERIC AS raw_score
    FROM review_candidates rc
  ),
  
  -- Cache MIN/MAX for review normalization (performance optimization)
  review_score_stats AS (
    SELECT
      COALESCE(MAX(raw_score), 0)::NUMERIC AS max_score,
      COALESCE(MIN(raw_score), 0)::NUMERIC AS min_score,
      COUNT(*) AS review_count
    FROM scored_reviews
  ),
  
  -- Normalize review scores (optimized with cached stats)
  normalized_reviews AS (
    SELECT
      sr.*,
      CASE
        WHEN rss.review_count > 0 THEN
          CASE
            WHEN rss.max_score > rss.min_score THEN
              -- Normal distribution when there's a range
              ((sr.raw_score::NUMERIC - rss.min_score)::NUMERIC / 
               NULLIF(rss.max_score - rss.min_score, 0::NUMERIC))::NUMERIC * 100::NUMERIC * 0.9::NUMERIC
            WHEN rss.max_score > 0::NUMERIC THEN
              -- All same score > 0, give them all 90 (with 0.9 weight)
              90::NUMERIC
            ELSE
              -- All scores are 0, use raw score as-is
              (sr.raw_score::NUMERIC * 0.9::NUMERIC)::NUMERIC
          END
        ELSE 0::NUMERIC
      END AS normalized_score
    FROM scored_reviews sr
    CROSS JOIN review_score_stats rss
    ORDER BY sr.raw_score DESC
    LIMIT (p_limit * 2)::INTEGER  -- Larger limit for reviews
  ),
  
  -- User's location for city matching
  user_location AS (
    SELECT location_city
    FROM users
    WHERE user_id = p_user_id
  ),
  
  -- Step 2C: Friend Suggestion Candidates (2nd/3rd degree with shared interests)
  -- Simplified for performance - skip expensive genre counting
  friend_suggestion_candidates_base AS (
    -- 2nd degree candidates (simplified)
    SELECT DISTINCT
      sdc.connected_user_id AS user_id,
      2 AS connection_depth,
      sdc.name,
      sdc.avatar_url,
      u.verified,
      u.location_city,
      0 AS shared_genres_count,  -- Skip expensive genre counting for performance
      sdc.mutual_friends_count,
      -- City match bonus (for scoring/ordering)
      CASE WHEN u.location_city IS NOT NULL AND ul.location_city IS NOT NULL 
           AND LOWER(TRIM(u.location_city)) = LOWER(TRIM(ul.location_city)) 
           THEN TRUE ELSE FALSE END AS same_city
    FROM get_second_degree_connections(p_user_id) sdc
    JOIN users u ON u.user_id = sdc.connected_user_id
    CROSS JOIN user_location ul
    WHERE sdc.mutual_friends_count >= 1
    
    UNION ALL
    
    -- 3rd degree candidates (simplified)
    SELECT DISTINCT
      tdc.connected_user_id AS user_id,
      3 AS connection_depth,
      tdc.name,
      tdc.avatar_url,
      u.verified,
      u.location_city,
      0 AS shared_genres_count,  -- Skip expensive genre counting for performance
      tdc.mutual_friends_count,
      -- City match bonus
      CASE WHEN u.location_city IS NOT NULL AND ul2.location_city IS NOT NULL 
           AND LOWER(TRIM(u.location_city)) = LOWER(TRIM(ul2.location_city)) 
           THEN TRUE ELSE FALSE END AS same_city
    FROM get_third_degree_connections(p_user_id) tdc
    JOIN users u ON u.user_id = tdc.connected_user_id
    CROSS JOIN user_location ul2
    WHERE tdc.mutual_friends_count >= 1
  ),
  
  friend_suggestion_candidates AS (
    SELECT *
    FROM friend_suggestion_candidates_base
    LIMIT 40  -- Limit after union to reduce work
  ),
  
  filtered_friend_suggestions AS (
    SELECT *
    FROM friend_suggestion_candidates
    WHERE mutual_friends_count >= 1
    ORDER BY 
      same_city DESC,  -- Same city first
      mutual_friends_count DESC,  -- More mutual friends first
      shared_genres_count DESC,  -- More shared genres first
      connection_depth ASC  -- Closer connections first
    LIMIT 10  -- Limit to top 10 suggestions
  ),
  
  -- Step 2D: Group Chat Candidates (using chats table with is_group_chat)
  group_chat_candidates AS (
    SELECT
      c.id AS chat_id,
      c.chat_name,
      c.users,
      c.created_at AS chat_created_at,
      -- Check if user is not a member
      NOT (p_user_id = ANY(c.users)) AS user_not_member,
      -- Count friends in chat (1st degree connections)
      (
        SELECT COUNT(*)
        FROM social_graph sg
        WHERE sg.connection_depth = 1
          AND sg.connected_user_id = ANY(c.users)
      ) AS friends_in_chat_count,
      -- Count active members in last 14 days (simplified - would need messages table join)
      array_length(c.users, 1) AS member_count
    FROM chats c
    WHERE c.is_group_chat = true
      AND NOT (p_user_id = ANY(c.users))
      AND c.created_at >= NOW() - INTERVAL '14 days'  -- Recent chats only
  ),
  
  -- Group chat scoring
  scored_group_chats AS (
    SELECT
      gcc.*,
      (
        30::NUMERIC  -- Base score
        + CASE WHEN gcc.friends_in_chat_count > 0 THEN (gcc.friends_in_chat_count::NUMERIC * 25::NUMERIC) ELSE 0::NUMERIC END  -- Friend bonus: +25 per friend
        + CASE WHEN gcc.member_count >= 5 THEN 15::NUMERIC ELSE 0::NUMERIC END  -- Activity bonus for larger groups
        + CASE WHEN gcc.chat_created_at >= NOW() - INTERVAL '7 days' THEN 10::NUMERIC ELSE 0::NUMERIC END  -- Recency bonus
      )::NUMERIC AS raw_score
    FROM group_chat_candidates gcc
    WHERE gcc.user_not_member = true
    ORDER BY raw_score DESC
    LIMIT 5  -- Limit to top 5 for rail
  ),
  
  -- Cache MIN/MAX for group chat normalization (performance optimization)
  group_chat_score_stats AS (
    SELECT
      COALESCE(MAX(raw_score), 0)::NUMERIC AS max_score,
      COALESCE(MIN(raw_score), 0)::NUMERIC AS min_score,
      COUNT(*) AS chat_count
    FROM scored_group_chats
  ),
  
  normalized_group_chats AS (
    SELECT
      sgc.chat_id,
      sgc.chat_name,
      sgc.users,
      sgc.chat_created_at,
      sgc.user_not_member,
      sgc.friends_in_chat_count,
      sgc.member_count,
      sgc.raw_score,
      CASE
        WHEN gcss.chat_count > 0 THEN
          CASE
            WHEN gcss.max_score > gcss.min_score THEN
              -- Normal distribution when there's a range
              ((sgc.raw_score::NUMERIC - gcss.min_score)::NUMERIC / 
               NULLIF(gcss.max_score - gcss.min_score, 0::NUMERIC))::NUMERIC * 100::NUMERIC * 0.7::NUMERIC
            WHEN gcss.max_score > 0::NUMERIC THEN
              -- All same score > 0, give them all 70 (with 0.7 weight)
              70::NUMERIC
            ELSE
              -- All scores are 0, use raw score as-is
              (sgc.raw_score::NUMERIC * 0.7::NUMERIC)::NUMERIC
          END
        ELSE 0::NUMERIC
      END AS normalized_score
    FROM scored_group_chats sgc
    CROSS JOIN group_chat_score_stats gcss
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
        'distance_miles', ne.distance_miles,
        'is_promoted', ne.is_promoted,
        'promotion_tier', ne.promotion_tier,
        'friend_interest_count', ne.friend_interest_count,
        'total_interest_count', ne.total_interest_count,
        'user_is_interested', ne.user_is_interested,
        'has_friends_going', CASE WHEN ne.friend_interest_count >= 2 THEN TRUE ELSE FALSE END
      ) AS payload,
      jsonb_build_object(
        'because', jsonb_build_array(
          CASE WHEN ne.friend_interest_count > 0 THEN ne.friend_interest_count::TEXT || ' friends going' ELSE NULL END,
          CASE WHEN ne.is_promoted THEN 'promoted event' ELSE NULL END,
          CASE WHEN EXISTS (
            SELECT 1 FROM user_pref up, unnest(ne.genres) g
            WHERE EXISTS (
              SELECT 1 FROM unnest(up.preferred_genres) pg
              WHERE lower(trim(pg)) = lower(trim(g))
            )
          ) THEN 'matches your genres' ELSE NULL END
        )
      ) AS context,
      ne.event_date AS created_at,
      row_number() OVER () AS item_order
    FROM normalized_events ne
    
    UNION ALL
    
    -- Reviews
    SELECT
      nr.review_id::TEXT AS id,
      'review'::TEXT AS type,
      nr.normalized_score::NUMERIC AS score,
      jsonb_build_object(
        'review_id', nr.review_id,
        'reviewer_id', nr.reviewer_id,
        'event_id', nr.event_id,
        'rating', nr.rating,
        'review_text', nr.review_text,
        'photos', nr.photos,
        'likes_count', nr.likes_count,
        'comments_count', nr.comments_count,
        'shares_count', nr.shares_count,
        'review_created_at', nr.review_created_at,
        'event_title', nr.event_title,
        'artist_name', nr.artist_name,
        'venue_name', nr.venue_name,
        'event_date', nr.event_date,
        'venue_city', nr.venue_city,
        'reviewer_name', nr.reviewer_name,
        'reviewer_avatar', nr.reviewer_avatar,
        'reviewer_verified', nr.reviewer_verified,
        'connection_depth', nr.connection_depth
      ) AS payload,
      jsonb_build_object(
        'author', CASE nr.connection_depth
          WHEN 1 THEN 'Friend'
          WHEN 2 THEN 'Friend of a friend'
          WHEN 3 THEN 'Friend of a friend of a friend'
          ELSE 'Connection'
        END,
        'event', nr.event_title || ' @ ' || nr.venue_name
      ) AS context,
      nr.review_created_at AS created_at,
      row_number() OVER () AS item_order
    FROM normalized_reviews nr
    
    UNION ALL
    
    -- Friend suggestions (as a rail - every ~10 items)
    SELECT
      gen_random_uuid()::TEXT AS id,
      'friend_suggestion'::TEXT AS type,
      0::NUMERIC AS score,  -- Structural item, not scored
      jsonb_build_object(
        'users', (
          SELECT jsonb_agg(jsonb_build_object(
            'user_id', ffs.user_id,
            'name', ffs.name,
            'avatar_url', ffs.avatar_url,
            'verified', ffs.verified,
            'connection_depth', ffs.connection_depth,
            'shared_genres_count', ffs.shared_genres_count,
            'mutual_friends_count', ffs.mutual_friends_count
          ))
          FROM filtered_friend_suggestions ffs
          LIMIT 10
        )
      ) AS payload,
      jsonb_build_object('because', 'People you may know') AS context,
      NOW() AS created_at,
      row_number() OVER () AS item_order
    FROM filtered_friend_suggestions
    WHERE EXISTS (SELECT 1 FROM filtered_friend_suggestions LIMIT 1)
    
    UNION ALL
    
    -- Group chats
    SELECT
      ngc.chat_id::TEXT AS id,
      'group_chat'::TEXT AS type,
      ngc.normalized_score::NUMERIC AS score,
      jsonb_build_object(
        'chat_id', ngc.chat_id,
        'chat_name', ngc.chat_name,
        'created_at', ngc.chat_created_at
      ) AS payload,
      jsonb_build_object('because', 'Suggested for you') AS context,
      ngc.chat_created_at AS created_at,
      row_number() OVER () AS item_order
    FROM normalized_group_chats ngc
  ),
  
  -- Step 4: Apply blending rules (max 2 reviews in a row, 1 group chat per 8 items, etc.)
  ranked_feed_items AS (
    SELECT
      afi.*,
      row_number() OVER (PARTITION BY afi.type ORDER BY afi.score DESC, afi.created_at DESC) AS type_rank
    FROM all_feed_items afi
  ),
  
  -- Separate rails from main feed items
  rails AS (
    SELECT
      rfi.id::UUID,
      rfi.type,
      rfi.score,
      rfi.payload,
      rfi.context,
      rfi.created_at,
      0 AS position_order  -- Friend suggestions first
    FROM ranked_feed_items rfi
    WHERE rfi.type = 'friend_suggestion' AND rfi.type_rank <= 1
    
    UNION ALL
    
    SELECT
      rfi.id::UUID,
      rfi.type,
      rfi.score,
      rfi.payload,
      rfi.context,
      rfi.created_at,
      1 AS position_order  -- Group chat rail second (if friend rail exists)
    FROM ranked_feed_items rfi
    WHERE rfi.type = 'group_chat' AND rfi.type_rank <= 1
  ),
  
  -- Main feed candidates (excluding rails)
  main_feed_candidates AS (
    SELECT
      rfi.id::UUID,
      rfi.type,
      rfi.score,
      rfi.payload,
      rfi.context,
      rfi.created_at,
      -- Create a blending score
      (
        CASE rfi.type
          WHEN 'event' THEN rfi.score::NUMERIC * 1.0::NUMERIC
          WHEN 'review' THEN rfi.score::NUMERIC * 0.9::NUMERIC
          WHEN 'group_chat' THEN rfi.score::NUMERIC * 0.7::NUMERIC
          ELSE rfi.score::NUMERIC
        END
      )::NUMERIC AS blended_score
    FROM ranked_feed_items rfi
    WHERE 
      rfi.type != 'friend_suggestion'  -- Exclude friend suggestion rails
      AND (rfi.type != 'group_chat' OR rfi.type_rank > 1)  -- Exclude first group chat (rail)
      AND (
        (rfi.type = 'event' AND rfi.type_rank <= CAST(p_limit * 4 AS INTEGER))  -- More events (was 1.5)
        OR (rfi.type = 'review' AND rfi.type_rank <= CAST(p_limit * 2 AS INTEGER))  -- More reviews (was 0.5)
        OR (rfi.type = 'group_chat' AND rfi.type_rank <= 20)  -- More group chats (was 10)
      )
  ),
  
  -- Apply hard blending constraints using window functions
  positioned_main_feed AS (
    SELECT
      mfc.*,
      LAG(mfc.type) OVER (ORDER BY mfc.blended_score DESC, mfc.created_at DESC) AS prev_type,
      LAG(mfc.type, 2) OVER (ORDER BY mfc.blended_score DESC, mfc.created_at DESC) AS prev_type_2,
      ROW_NUMBER() OVER (ORDER BY mfc.blended_score DESC, mfc.created_at DESC) AS feed_position
    FROM main_feed_candidates mfc
  ),
  
  -- Apply constraints (simplified - handle NULLs properly)
  constrained_main_feed AS (
    SELECT
      pmf.*
    FROM positioned_main_feed pmf
    WHERE 
      -- Never 3 events in a row without social content (use COALESCE for NULL handling)
      NOT (
        pmf.type = 'event' 
        AND COALESCE(pmf.prev_type, '') = 'event' 
        AND COALESCE(pmf.prev_type_2, '') = 'event'
      )
      -- Never 3 reviews in a row
      AND NOT (
        pmf.type = 'review' 
        AND COALESCE(pmf.prev_type, '') = 'review' 
        AND COALESCE(pmf.prev_type_2, '') = 'review'
      )
      -- Group chats in feed only every 8+ items (but allow first 2 positions)
      AND (
        pmf.type != 'group_chat' 
        OR pmf.feed_position <= 2
        OR pmf.feed_position % 8 = 0
      )
  ),
  
  -- Combine rails and constrained main feed
  combined_feed AS (
    SELECT
      r.id,
      r.type,
      r.score,
      r.payload,
      r.context,
      r.created_at,
      r.position_order,
      NULL::NUMERIC AS blended_score
    FROM rails r
    
    UNION ALL
    
    SELECT
      cmf.id,
      cmf.type,
      cmf.score,
      cmf.payload,
      cmf.context,
      cmf.created_at,
      2 AS position_order,  -- Main feed items come after rails
      cmf.blended_score
    FROM constrained_main_feed cmf
  )
  
  SELECT
    cf.id,
    cf.type,
    cf.score,
    cf.payload,
    cf.context,
    cf.created_at
  FROM combined_feed cf
  ORDER BY 
    cf.position_order,
    CASE 
      WHEN cf.blended_score IS NOT NULL THEN cf.blended_score 
      ELSE cf.score 
    END DESC,
    CASE cf.type
      WHEN 'event' THEN 1
      WHEN 'review' THEN 2
      WHEN 'group_chat' THEN 3
      WHEN 'friend_suggestion' THEN 4
    END,
    cf.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_personalized_feed_v3(
  UUID, INT, INT, NUMERIC, NUMERIC, NUMERIC
) TO authenticated;

COMMENT ON FUNCTION public.get_personalized_feed_v3 IS 
'Unified personalized feed v3: Returns events, reviews, friend suggestions, and group chats in a single feed with intelligent blending. Supports multiple content types with normalized scoring and social graph integration.';


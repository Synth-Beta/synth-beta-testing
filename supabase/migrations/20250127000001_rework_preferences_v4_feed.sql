-- ============================================================
-- MIGRATION: Rework Preferences V4 Feed
-- Prioritizes followed artists/venues, newly added events, and recommendation reasons
-- ============================================================

-- Drop existing v4 function if it exists
DROP FUNCTION IF EXISTS get_preferences_v4_feed CASCADE;

-- ============================================================
-- Function: Get Personalized Events Feed v4 (Reworked)
-- Priority order:
-- 1. Events from followed artists/venues
-- 2. Newly added events (past 7 days) with user signals
-- 3. Recommended events based on signals/preferences
-- ============================================================
CREATE OR REPLACE FUNCTION get_preferences_v4_feed(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_include_past BOOLEAN DEFAULT false,
  p_city_filter TEXT DEFAULT NULL,
  p_state_filter TEXT DEFAULT NULL,
  p_max_days_ahead INT DEFAULT 90,
  p_skip_following BOOLEAN DEFAULT false,  -- When true, skip following-first logic (for refresh)
  p_radius_miles NUMERIC DEFAULT NULL  -- Radius in miles for distance-based filtering
)
RETURNS TABLE(
  event_id UUID,
  title TEXT,
  artist_name TEXT,
  artist_id UUID,
  venue_name TEXT,
  venue_id UUID,
  event_date TIMESTAMPTZ,
  doors_time TIMESTAMPTZ,
  description TEXT,
  genres TEXT[],
  venue_address TEXT,
  venue_city TEXT,
  venue_state TEXT,
  venue_zip TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  ticket_available BOOLEAN,
  price_range TEXT,
  ticket_urls TEXT[],
  setlist JSONB,
  setlist_enriched BOOLEAN,
  setlist_song_count INT,
  setlist_fm_id TEXT,
  setlist_fm_url TEXT,
  setlist_source TEXT,
  setlist_last_updated TIMESTAMPTZ,
  tour_name TEXT,
  event_media_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  relevance_score NUMERIC,
  user_is_interested BOOLEAN,
  interested_count INT,
  recommendation_reason TEXT,  -- NEW: 'just_released', 'because_you_follow_artist', 'because_you_follow_venue', 'because_you_love_genre'
  recommendation_context TEXT   -- NEW: Additional context (artist name, genre name, etc.)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_prefs RECORD;
  v_top_genres TEXT[];
  v_top_artists UUID[];
  v_genre_scores JSONB;
  v_artist_scores JSONB;
  v_venue_scores JSONB;
  v_followed_artists UUID[];
  v_followed_venues UUID[];
  v_city_center_lat NUMERIC;
  v_city_center_lng NUMERIC;
BEGIN
  -- Get user preferences from the new BCNF schema
  SELECT 
    up.genre_preference_scores,
    up.artist_preference_scores,
    up.venue_preference_scores,
    up.top_genres,
    up.top_artists,
    up.top_venues
  INTO v_user_prefs
  FROM public.user_preferences up
  WHERE up.user_id = p_user_id;

  -- Get city center coordinates if city filter and radius are provided
  IF p_city_filter IS NOT NULL AND p_radius_miles IS NOT NULL AND p_radius_miles > 0 THEN
    SELECT cc.center_latitude, cc.center_longitude
    INTO v_city_center_lat, v_city_center_lng
    FROM public.city_centers cc
    WHERE 
      -- Try exact match on normalized_name
      LOWER(TRIM(cc.normalized_name)) = LOWER(TRIM(p_city_filter)) OR
      -- Try prefix match
      LOWER(TRIM(cc.normalized_name)) LIKE LOWER(TRIM(p_city_filter)) || '%' OR
      -- Try contains match
      LOWER(TRIM(cc.normalized_name)) LIKE '%' || LOWER(TRIM(p_city_filter)) || '%' OR
      -- Try aliases
      EXISTS (
        SELECT 1 FROM unnest(cc.aliases) alias
        WHERE LOWER(TRIM(alias)) = LOWER(TRIM(p_city_filter))
      )
    AND (p_state_filter IS NULL OR cc.state = p_state_filter)
    ORDER BY 
      CASE 
        WHEN LOWER(TRIM(cc.normalized_name)) = LOWER(TRIM(p_city_filter)) THEN 0
        WHEN LOWER(TRIM(cc.normalized_name)) LIKE LOWER(TRIM(p_city_filter)) || '%' THEN 1
        ELSE 2
      END,
      cc.event_count DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- Extract arrays and JSONB objects
  v_top_genres := COALESCE(v_user_prefs.top_genres, ARRAY[]::TEXT[]);
  v_top_artists := COALESCE(v_user_prefs.top_artists, ARRAY[]::UUID[]);
  v_genre_scores := COALESCE(v_user_prefs.genre_preference_scores, '{}'::jsonb);
  v_artist_scores := COALESCE(v_user_prefs.artist_preference_scores, '{}'::jsonb);
  v_venue_scores := COALESCE(v_user_prefs.venue_preference_scores, '{}'::jsonb);

  -- Get followed artists
  SELECT COALESCE(ARRAY_AGG(af.artist_id), ARRAY[]::UUID[])
  INTO v_followed_artists
  FROM public.artist_follows af
  WHERE af.user_id = p_user_id;

  -- Get followed venues
  SELECT COALESCE(ARRAY_AGG(uvr.venue_id), ARRAY[]::UUID[])
  INTO v_followed_venues
  FROM public.user_venue_relationships uvr
  WHERE uvr.user_id = p_user_id;

  RETURN QUERY
  WITH bounding_box_candidates AS (
    -- Stage 1: Fast bounding box filter using indexes (no expensive calculations)
    SELECT e.id as event_id,
           e.latitude,
           e.longitude,
           e.event_date
    FROM public.events e
    WHERE 
      (p_include_past = true OR e.event_date >= CURRENT_DATE)
      AND (e.event_date IS NULL OR e.event_date::DATE <= CURRENT_DATE + (p_max_days_ahead || ' days')::INTERVAL)
      AND (
        -- If we have city center coordinates and radius, use bounding box only
        (v_city_center_lat IS NOT NULL AND v_city_center_lng IS NOT NULL AND p_radius_miles IS NOT NULL AND p_radius_miles > 0 AND
         e.latitude IS NOT NULL AND e.longitude IS NOT NULL AND
         -- Tight bounding box (slightly larger than radius for safety)
         e.latitude BETWEEN (v_city_center_lat - (p_radius_miles / 69.0) * 1.1) AND (v_city_center_lat + (p_radius_miles / 69.0) * 1.1) AND
         e.longitude BETWEEN (v_city_center_lng - (p_radius_miles / (69.0 * COS(RADIANS(v_city_center_lat)))) * 1.1) AND (v_city_center_lng + (p_radius_miles / (69.0 * COS(RADIANS(v_city_center_lat)))) * 1.1)
        ) OR
        -- Fallback to city name matching if no coordinates/radius
        (v_city_center_lat IS NULL OR v_city_center_lng IS NULL OR p_radius_miles IS NULL OR p_radius_miles <= 0) AND
        (p_city_filter IS NULL OR 
         -- Try exact match first (fastest, can use index)
         LOWER(TRIM(e.venue_city)) = LOWER(TRIM(p_city_filter)) OR
         -- Then prefix match
         LOWER(TRIM(e.venue_city)) LIKE LOWER(TRIM(p_city_filter)) || '%' OR
         -- Contains match (handles variations like "Washington" matching "Washington DC")
         LOWER(TRIM(e.venue_city)) LIKE '%' || LOWER(TRIM(p_city_filter)) || '%' OR
         -- Reverse contains (handles "Washington DC" filter matching "Washington" in DB)
         LOWER(TRIM(p_city_filter)) LIKE '%' || LOWER(TRIM(e.venue_city)) || '%')
      )
      AND (p_state_filter IS NULL OR e.venue_state = p_state_filter)
    ORDER BY 
      CASE 
        WHEN p_city_filter IS NULL THEN 0
        WHEN v_city_center_lat IS NOT NULL AND v_city_center_lng IS NOT NULL THEN 0  -- Distance-based gets priority
        WHEN LOWER(TRIM(e.venue_city)) = LOWER(TRIM(p_city_filter)) THEN 0
        ELSE 1
      END,
      e.event_date ASC NULLS LAST
    LIMIT CASE 
      -- Limit bounding box candidates aggressively
      WHEN v_city_center_lat IS NOT NULL AND p_radius_miles IS NOT NULL THEN 300  -- More candidates for distance filtering
      WHEN p_city_filter IS NOT NULL THEN 100
      ELSE 150
    END
  ),
  filtered_events AS (
    -- Stage 2: Apply exact distance filter only on bounding box candidates
    -- Calculate distance once using subquery to avoid duplicate calculations
    SELECT 
      dist_calc.event_id,
      dist_calc.calculated_distance
    FROM (
      SELECT 
        bbc.event_id,
        -- Calculate distance only for radius filtering, otherwise NULL
        CASE 
          WHEN v_city_center_lat IS NOT NULL AND v_city_center_lng IS NOT NULL AND p_radius_miles IS NOT NULL AND p_radius_miles > 0 AND
               bbc.latitude IS NOT NULL AND bbc.longitude IS NOT NULL THEN
            -- Exact Haversine distance (only calculated on pre-filtered candidates)
            (
             3959 * acos(
               GREATEST(-1.0, LEAST(1.0,
                 cos(radians(v_city_center_lat)) * 
                 cos(radians(bbc.latitude)) * 
                 cos(radians(bbc.longitude) - radians(v_city_center_lng)) + 
                 sin(radians(v_city_center_lat)) * 
                 sin(radians(bbc.latitude))
               ))
             )
            )
          ELSE NULL
        END as calculated_distance,
        bbc.event_date
      FROM bounding_box_candidates bbc
    ) dist_calc
    WHERE 
      -- If using radius filtering, apply exact distance check
      (dist_calc.calculated_distance IS NULL OR dist_calc.calculated_distance <= p_radius_miles)
    ORDER BY 
      CASE 
        WHEN dist_calc.calculated_distance IS NOT NULL THEN dist_calc.calculated_distance  -- Closer events first
        ELSE 0
      END,
      dist_calc.event_date ASC NULLS LAST
    LIMIT CASE 
      -- Final limit after distance filtering
      WHEN p_city_filter IS NOT NULL THEN LEAST((p_limit * 3), 100)
      ELSE LEAST((p_limit * 4), 150)
    END
  ),
  event_interests AS (
    -- Pre-aggregate event interests only for filtered events
    SELECT 
      uer.event_id as event_id,
      BOOL_OR(uer.user_id = p_user_id) as user_is_interested,
      COUNT(*) as interested_count
    FROM public.user_event_relationships uer
    INNER JOIN filtered_events fe ON fe.event_id = uer.event_id
    WHERE uer.relationship_type IN ('interest', 'going', 'maybe')
    GROUP BY uer.event_id
  ),
  base_events AS (
    -- Get base event data with joins
    SELECT 
      e.id as event_id,
      e.title,
      COALESCE(a.name, 'Unknown Artist') as artist_name,
      e.artist_id,
      COALESCE(v.name, 'Unknown Venue') as venue_name,
      e.venue_id,
      e.event_date,
      e.doors_time,
      e.description,
      e.genres,
      e.venue_address,
      e.venue_city,
      e.venue_state,
      e.venue_zip,
      e.latitude,
      e.longitude,
      e.ticket_available,
      e.price_range,
      e.ticket_urls,
      e.setlist,
      (e.setlist->>'enriched')::BOOLEAN as setlist_enriched,
      (e.setlist->>'song_count')::INT as setlist_song_count,
      e.setlist->>'fm_id' as setlist_fm_id,
      e.setlist->>'fm_url' as setlist_fm_url,
      e.setlist->>'source' as setlist_source,
      (e.setlist->>'last_updated')::TIMESTAMPTZ as setlist_last_updated,
      e.tour_name,
      e.event_media_url,
      e.created_at,
      e.updated_at,
      COALESCE(ei.user_is_interested, false) as user_is_interested,
      COALESCE(ei.interested_count, 0)::INT as interested_count
    FROM filtered_events fe
    INNER JOIN public.events e ON e.id = fe.event_id
    LEFT JOIN public.artists a ON a.id = e.artist_id
    LEFT JOIN public.venues v ON v.id = e.venue_id
    LEFT JOIN event_interests ei ON ei.event_id = e.id
  ),
  -- 1. FOLLOWED ARTISTS/VENUES (highest priority, unless p_skip_following = true)
  following_events AS (
    SELECT 
      be.*,
      CASE 
        WHEN NOT p_skip_following AND be.artist_id IS NOT NULL AND be.artist_id = ANY(v_followed_artists) THEN
          'because_you_follow_artist'
        WHEN NOT p_skip_following AND be.venue_id IS NOT NULL AND be.venue_id = ANY(v_followed_venues) THEN
          'because_you_follow_venue'
        ELSE NULL
      END as recommendation_reason,
      CASE 
        WHEN NOT p_skip_following AND be.artist_id IS NOT NULL AND be.artist_id = ANY(v_followed_artists) THEN
          be.artist_name
        WHEN NOT p_skip_following AND be.venue_id IS NOT NULL AND be.venue_id = ANY(v_followed_venues) THEN
          be.venue_name
        ELSE NULL
      END as recommendation_context,
      1000.0 as priority_score  -- High priority for following
    FROM base_events be
    WHERE NOT p_skip_following
      AND (
        (be.artist_id IS NOT NULL AND be.artist_id = ANY(v_followed_artists))
        OR (be.venue_id IS NOT NULL AND be.venue_id = ANY(v_followed_venues))
      )
  ),
  -- 2. NEWLY ADDED EVENTS (past 7 days) - show all new events, boost score if they match user signals
  newly_added_events AS (
    SELECT 
      be.*,
      'just_released' as recommendation_reason,
      NULL as recommendation_context,
      -- Boost score based on recency and user signals
      (
        500.0 +  -- Base score for new events
        CASE 
          WHEN be.artist_id IS NOT NULL AND be.artist_id = ANY(v_top_artists) THEN 200.0
          WHEN be.artist_id IS NOT NULL AND v_artist_scores ? be.artist_id::TEXT THEN
            LEAST((v_artist_scores->>be.artist_id::TEXT)::NUMERIC * 2.0, 200.0)
          ELSE 0
        END +
        CASE 
          WHEN be.genres IS NOT NULL AND array_length(be.genres, 1) > 0 THEN
            LEAST(
              (
                SELECT COALESCE(SUM(genre_score), 0)
                FROM (
                  SELECT 
                    COALESCE((v_genre_scores->>g)::NUMERIC, 0) +
                    CASE 
                      WHEN g = ANY(v_top_genres) THEN
                        GREATEST((array_length(v_top_genres, 1) - array_position(v_top_genres, g) + 1)::NUMERIC * 1.5, 0)
                      ELSE 0 
                    END as genre_score
                  FROM unnest(be.genres) AS g
                ) genre_scores
              ),
              150.0
            )
          ELSE 0
        END
      ) as priority_score
    FROM base_events be
    WHERE be.created_at >= CURRENT_DATE - INTERVAL '7 days'
      AND be.event_id NOT IN (SELECT following_events.event_id FROM following_events)  -- Exclude already included
  ),
  -- 3. RECOMMENDED EVENTS based on signals/preferences
  recommended_events AS (
    SELECT 
      be.*,
      CASE 
        WHEN be.artist_id IS NOT NULL AND be.artist_id = ANY(v_top_artists) THEN
          'because_you_follow_artist'
        WHEN be.genres IS NOT NULL AND array_length(be.genres, 1) > 0 AND EXISTS (
          SELECT 1 FROM unnest(be.genres) g 
          WHERE g = ANY(v_top_genres) OR v_genre_scores ? lower(g)
        ) THEN
          'because_you_love_genre'
        ELSE NULL
      END as recommendation_reason,
      CASE 
        WHEN be.artist_id IS NOT NULL AND be.artist_id = ANY(v_top_artists) THEN
          be.artist_name
        WHEN be.genres IS NOT NULL AND array_length(be.genres, 1) > 0 THEN
          (
            SELECT g FROM unnest(be.genres) g 
            WHERE g = ANY(v_top_genres) OR v_genre_scores ? lower(g)
            LIMIT 1
          )
        ELSE NULL
      END as recommendation_context,
      -- Calculate relevance score using user_preferences
      (
        -- ARTIST SCORE (max 40 points)
        CASE 
          WHEN be.artist_id IS NOT NULL AND be.artist_id = ANY(v_top_artists) THEN
            (array_length(v_top_artists, 1) - array_position(v_top_artists, be.artist_id) + 1)::NUMERIC * 2.0
          WHEN be.artist_id IS NOT NULL AND v_artist_scores ? be.artist_id::TEXT THEN
            LEAST((v_artist_scores->>be.artist_id::TEXT)::NUMERIC * 0.4, 40.0)
          ELSE 0
        END +
        -- GENRE SCORE (max 30 points)
        CASE 
          WHEN be.genres IS NOT NULL AND array_length(be.genres, 1) > 0 THEN
            LEAST(
              (
                SELECT COALESCE(SUM(genre_score), 0)
                FROM (
                  SELECT 
                    COALESCE((v_genre_scores->>g)::NUMERIC, 0) +
                    CASE 
                      WHEN g = ANY(v_top_genres) THEN
                        GREATEST((array_length(v_top_genres, 1) - array_position(v_top_genres, g) + 1)::NUMERIC * 1.5, 0)
                      ELSE 0 
                    END as genre_score
                  FROM unnest(be.genres) AS g
                ) genre_scores
              ),
              30.0
            )
          ELSE 0
        END +
        -- VENUE SCORE (max 15 points)
        CASE 
          WHEN be.venue_id IS NOT NULL AND v_venue_scores ? be.venue_id::TEXT THEN
            LEAST((v_venue_scores->>be.venue_id::TEXT)::NUMERIC * 0.15, 15.0)
          ELSE 0
        END +
        -- RECENCY SCORE (max 5 points)
        CASE 
          WHEN be.event_date IS NOT NULL THEN
            CASE 
              WHEN be.event_date::DATE - CURRENT_DATE BETWEEN 0 AND 30 THEN
                5.0 * (1.0 - ((be.event_date::DATE - CURRENT_DATE)::NUMERIC / 30.0))
              WHEN be.event_date::DATE - CURRENT_DATE BETWEEN 31 AND 60 THEN 2.0
              ELSE 0
            END
          ELSE 0
        END
      ) as priority_score
    FROM base_events be
    WHERE be.event_id NOT IN (SELECT following_events.event_id FROM following_events)
      AND be.event_id NOT IN (SELECT newly_added_events.event_id FROM newly_added_events)
  ),
  -- Combine all events with mixing logic
  all_events AS (
    SELECT * FROM following_events
    UNION ALL
    SELECT * FROM newly_added_events
    UNION ALL
    SELECT * FROM recommended_events
  ),
  -- Mix events: alternate between types to avoid overload
  mixed_events AS (
    SELECT 
      ae.*,
      ROW_NUMBER() OVER (
        PARTITION BY 
          CASE 
            WHEN ae.recommendation_reason = 'because_you_follow_artist' OR ae.recommendation_reason = 'because_you_follow_venue' THEN 1
            WHEN ae.recommendation_reason = 'just_released' THEN 2
            WHEN ae.recommendation_reason = 'because_you_love_genre' THEN 3
            ELSE 4
          END
        ORDER BY ae.priority_score DESC, ae.event_date ASC
      ) as type_rank
    FROM all_events ae
  ),
  -- Interleave events by type
  interleaved_events AS (
    SELECT 
      me.*,
      ROW_NUMBER() OVER (
        ORDER BY 
          me.type_rank,
          CASE 
            WHEN me.recommendation_reason = 'because_you_follow_artist' OR me.recommendation_reason = 'because_you_follow_venue' THEN 1
            WHEN me.recommendation_reason = 'just_released' THEN 2
            WHEN me.recommendation_reason = 'because_you_love_genre' THEN 3
            ELSE 4
          END,
          me.priority_score DESC,
          me.event_date ASC
      ) as final_rank
    FROM mixed_events me
  )
  SELECT 
    ie.event_id,
    ie.title,
    ie.artist_name,
    ie.artist_id,
    ie.venue_name,
    ie.venue_id,
    ie.event_date,
    ie.doors_time,
    ie.description,
    ie.genres,
    ie.venue_address,
    ie.venue_city,
    ie.venue_state,
    ie.venue_zip,
    ie.latitude,
    ie.longitude,
    ie.ticket_available,
    ie.price_range,
    ie.ticket_urls,
    ie.setlist,
    ie.setlist_enriched,
    ie.setlist_song_count,
    ie.setlist_fm_id,
    ie.setlist_fm_url,
    ie.setlist_source,
    ie.setlist_last_updated,
    ie.tour_name,
    ie.event_media_url,
    ie.created_at,
    ie.updated_at,
    ie.priority_score as relevance_score,
    ie.user_is_interested,
    ie.interested_count,
    COALESCE(ie.recommendation_reason, 'recommended') as recommendation_reason,
    ie.recommendation_context
  FROM interleaved_events ie
  ORDER BY ie.final_rank
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_preferences_v4_feed TO authenticated;

-- Comment
COMMENT ON FUNCTION get_preferences_v4_feed IS 
'Personalized event feed v4 (reworked). Prioritizes: 1) Followed artists/venues, 2) Newly added events (past 7 days) with signals, 3) Recommended events. Includes recommendation reasons and mixes types to avoid overload.';


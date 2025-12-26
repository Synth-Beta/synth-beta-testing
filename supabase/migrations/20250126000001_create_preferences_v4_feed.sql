-- ============================================================
-- MIGRATION: Personalized Event Feed v4 using user_preferences BCNF schema
-- Uses the new normalized preference system for recommendations
-- ============================================================
-- Note: Assumes user_event_relationships table already exists
-- Schema: user_event_relationships(user_id, event_id, relationship_type)
-- relationship_type values: 'interest', 'going', 'maybe', 'not_going'

-- Drop existing v4 function if it exists
DROP FUNCTION IF EXISTS get_preferences_v4_feed CASCADE;

-- ============================================================
-- Function: Get Personalized Events Feed v4 (using user_preferences)
-- Uses the new BCNF schema with genre_preference_scores, artist_preference_scores, etc.
-- ============================================================
CREATE OR REPLACE FUNCTION get_preferences_v4_feed(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_include_past BOOLEAN DEFAULT false,
  p_city_filter TEXT DEFAULT NULL,
  p_state_filter TEXT DEFAULT NULL,
  p_max_days_ahead INT DEFAULT 90
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
  friends_interested_count INT
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

  -- Extract arrays and JSONB objects
  v_top_genres := COALESCE(v_user_prefs.top_genres, ARRAY[]::TEXT[]);
  v_top_artists := COALESCE(v_user_prefs.top_artists, ARRAY[]::UUID[]);
  v_genre_scores := COALESCE(v_user_prefs.genre_preference_scores, '{}'::jsonb);
  v_artist_scores := COALESCE(v_user_prefs.artist_preference_scores, '{}'::jsonb);
  v_venue_scores := COALESCE(v_user_prefs.venue_preference_scores, '{}'::jsonb);

  RETURN QUERY
  WITH user_friends AS (
    -- Pre-compute friends list once
    SELECT DISTINCT
      CASE 
        WHEN ur.user_id = p_user_id THEN ur.related_user_id
        WHEN ur.related_user_id = p_user_id THEN ur.user_id
      END as friend_id
    FROM public.user_relationships ur
    WHERE (ur.user_id = p_user_id OR ur.related_user_id = p_user_id)
      AND ur.relationship_type = 'friend'
      AND ur.status = 'accepted'
  ),
  filtered_events AS (
    -- Filter events early and limit to prevent processing too many
    -- When city filter is applied, use a smaller candidate pool for better performance
    SELECT e.id as event_id
    FROM public.events e
    WHERE 
      (p_include_past = true OR e.event_date >= CURRENT_DATE)
      AND (e.event_date IS NULL OR e.event_date::DATE <= CURRENT_DATE + (p_max_days_ahead || ' days')::INTERVAL)
      AND (p_city_filter IS NULL OR 
           -- Try exact match first (can use index)
           e.venue_city ILIKE p_city_filter OR
           -- Try prefix match (can partially use index)
           e.venue_city ILIKE p_city_filter || '%' OR
           -- Fallback to contains match (slower but needed for variations)
           e.venue_city ILIKE '%' || p_city_filter || '%')
      AND (p_state_filter IS NULL OR e.venue_state = p_state_filter)
    ORDER BY 
      -- Prioritize exact matches, then prefix matches, then contains matches
      CASE 
        WHEN p_city_filter IS NULL THEN 0
        WHEN e.venue_city ILIKE p_city_filter THEN 0
        WHEN e.venue_city ILIKE p_city_filter || '%' THEN 1
        ELSE 2
      END,
      e.event_date ASC NULLS LAST
    LIMIT CASE 
      -- Reduce limit when city filter is applied to improve performance
      WHEN p_city_filter IS NOT NULL THEN GREATEST(LEAST((p_limit * 2), 200), 50)
      ELSE GREATEST(LEAST((p_limit * 3), 300), 100)
    END
  ),
  friend_ids_array AS (
    -- Materialize friend IDs as array once (always returns exactly one row)
    SELECT COALESCE(ARRAY_AGG(uf.friend_id), ARRAY[]::UUID[]) as friend_ids
    FROM user_friends uf
  ),
  event_interests AS (
    -- Pre-aggregate event interests only for filtered events
    SELECT 
      uer.event_id,
      BOOL_OR(uer.user_id = p_user_id) as user_is_interested,
      COUNT(*) as interested_count,
      COUNT(*) FILTER (
        WHERE uer.user_id = ANY(fia.friend_ids)
      ) as friends_interested_count
    FROM public.user_event_relationships uer
    INNER JOIN filtered_events fe ON fe.event_id = uer.event_id
    CROSS JOIN LATERAL (SELECT friend_ids FROM friend_ids_array) fia
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
      COALESCE(ei.interested_count, 0)::INT as interested_count,
      COALESCE(ei.friends_interested_count, 0)::INT as friends_interested_count
    FROM filtered_events fe
    INNER JOIN public.events e ON e.id = fe.event_id
    LEFT JOIN public.artists a ON a.id = e.artist_id
    LEFT JOIN public.venues v ON v.id = e.venue_id
    LEFT JOIN event_interests ei ON ei.event_id = e.id
  ),
  scored_events AS (
    SELECT 
      be.event_id,
      be.title,
      be.artist_name,
      be.artist_id,
      be.venue_name,
      be.venue_id,
      be.event_date,
      be.doors_time,
      be.description,
      be.genres,
      be.venue_address,
      be.venue_city,
      be.venue_state,
      be.venue_zip,
      be.latitude,
      be.longitude,
      be.ticket_available,
      be.price_range,
      be.ticket_urls,
      be.setlist,
      be.setlist_enriched,
      be.setlist_song_count,
      be.setlist_fm_id,
      be.setlist_fm_url,
      be.setlist_source,
      be.setlist_last_updated,
      be.tour_name,
      be.event_media_url,
      be.created_at,
      be.updated_at,
      be.user_is_interested,
      be.interested_count,
      be.friends_interested_count,
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
        -- GENRE SCORE (max 30 points) - simplified calculation
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
        -- SOCIAL PROOF SCORE (max 10 points)
        LEAST(be.friends_interested_count * 2.0, 10.0) +
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
      ) as relevance_score
    FROM base_events be
  )
  SELECT 
    se.event_id,
    se.title,
    se.artist_name,
    se.artist_id,
    se.venue_name,
    se.venue_id,
    se.event_date,
    se.doors_time,
    se.description,
    se.genres,
    se.venue_address,
    se.venue_city,
    se.venue_state,
    se.venue_zip,
    se.latitude,
    se.longitude,
    se.ticket_available,
    se.price_range,
    se.ticket_urls,
    se.setlist,
    se.setlist_enriched,
    se.setlist_song_count,
    se.setlist_fm_id,
    se.setlist_fm_url,
    se.setlist_source,
    se.setlist_last_updated,
    se.tour_name,
    se.event_media_url,
    se.created_at,
    se.updated_at,
    se.relevance_score,
    se.user_is_interested,
    se.interested_count,
    se.friends_interested_count
  FROM scored_events se
  ORDER BY se.relevance_score DESC, se.event_date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_preferences_v4_feed TO authenticated;

-- Comment
COMMENT ON FUNCTION get_preferences_v4_feed IS 
'Personalized event feed v4 using user_preferences BCNF schema. Returns events sorted by relevance score based on genre_preference_scores, artist_preference_scores, and venue_preference_scores.';


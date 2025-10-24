-- ============================================
-- FINAL GENRE-FIRST ALGORITHM FOR PROMOTIONS
-- ============================================
-- Simplified version that works with basic user_jambase_events table
-- Uses presence of records to indicate interest (no interested column needed)

-- Drop existing functions first to avoid conflicts
DROP FUNCTION IF EXISTS get_user_genre_profile(UUID) CASCADE;
DROP FUNCTION IF EXISTS calculate_event_relevance_score(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS get_personalized_events_feed(UUID, INT, INT, BOOLEAN) CASCADE;

-- Create the get_user_genre_profile function using actual schema
CREATE OR REPLACE FUNCTION get_user_genre_profile(p_user_id UUID)
RETURNS TABLE(
  genre TEXT,
  weight NUMERIC,
  source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH genre_signals AS (
    -- From followed artists' genres (using artist_profile table)
    SELECT 
      unnest(ap.genres) as genre,
      1.0 as preference_score, -- Default weight for artist-based genres
      'artist' as source
    FROM artist_follows af
    JOIN artist_profile ap ON af.artist_id = ap.id
    WHERE af.user_id = p_user_id
      AND ap.genres IS NOT NULL
      AND array_length(ap.genres, 1) > 0
    
    UNION ALL
    
    -- From interested events' genres (using user_jambase_events - presence indicates interest)
    SELECT 
      je.genres[1] as genre, -- Take first genre from array
      0.8 as preference_score, -- Lower weight for event-based genres
      'event' as source
    FROM user_jambase_events uje
    JOIN jambase_events je ON uje.jambase_event_id = je.id
    WHERE uje.user_id = p_user_id
      AND je.genres IS NOT NULL
      AND array_length(je.genres, 1) > 0
  ),
  genre_weights AS (
    SELECT 
      gs.genre,
      SUM(gs.preference_score) as total_weight,
      array_agg(DISTINCT gs.source) as sources
    FROM genre_signals gs
    GROUP BY gs.genre
  )
  SELECT 
    gw.genre,
    gw.total_weight / NULLIF(SUM(gw.total_weight) OVER (), 0) as weight, -- Normalize to sum = 1
    array_to_string(gw.sources, ', ') as source
  FROM genre_weights gw
  WHERE gw.total_weight > 0
  ORDER BY gw.total_weight DESC;
END;
$function$;

-- Create the calculate_event_relevance_score function using actual schema
CREATE OR REPLACE FUNCTION calculate_event_relevance_score(p_user_id UUID, p_event_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_event RECORD;
  v_user_genre_profile RECORD;
  v_genre_affinity_score NUMERIC := 0;
  v_artist_familiarity_score NUMERIC := 0;
  v_song_behavior_score NUMERIC := 0;
  v_social_proof_score NUMERIC := 0;
  v_recency_score NUMERIC := 0;
  v_promotion_boost NUMERIC := 0;
  v_final_score NUMERIC := 0;
  v_genre_weight NUMERIC;
  v_artist_listen_count NUMERIC;
  v_days_until_event NUMERIC;
  v_friends_interested_count NUMERIC;
  v_is_promoted BOOLEAN := false;
  v_promotion_tier TEXT;
  v_active_promotion_id UUID;
BEGIN
  -- Get event details with promotion data via JOIN
  SELECT 
    e.id,
    e.title,
    e.artist_name,
    e.artist_id,
    e.venue_name,
    e.venue_id,
    e.genres,
    e.event_date,
    -- Promotion data from JOIN
    CASE WHEN ep.id IS NOT NULL THEN true ELSE false END as is_promoted,
    ep.promotion_tier,
    ep.id as active_promotion_id
  INTO v_event
  FROM jambase_events e
  LEFT JOIN event_promotions ep ON e.id = ep.event_id
    AND ep.promotion_status = 'active'
    AND ep.starts_at <= now()
    AND ep.expires_at >= now()
  WHERE e.id = p_event_id;

  -- If event not found, return 0
  IF v_event.id IS NULL THEN
    RETURN 0;
  END IF;

  -- Set promotion variables
  v_is_promoted := v_event.is_promoted;
  v_promotion_tier := v_event.promotion_tier;
  v_active_promotion_id := v_event.active_promotion_id;

  -- 1. GENRE AFFINITY SCORE (max 45 points) - CORE MATCH STRENGTH
  -- Get user's genre profile and calculate weighted affinity
  FOR v_user_genre_profile IN 
    SELECT genre, weight FROM get_user_genre_profile(p_user_id)
  LOOP
    -- Check if event genres match user's preferred genres
    IF v_event.genres && ARRAY[v_user_genre_profile.genre] THEN
      v_genre_weight := v_user_genre_profile.weight;
      v_genre_affinity_score := v_genre_affinity_score + (v_genre_weight * 45);
    END IF;
  END LOOP;

  -- 2. ARTIST FAMILIARITY SCORE (max 20 points) - REINFORCE KNOWN ARTISTS
  -- Check if user follows this artist
  IF EXISTS (
    SELECT 1 FROM artist_follows af
    JOIN artist_profile ap ON af.artist_id = ap.id
    WHERE af.user_id = p_user_id 
      AND ap.name = v_event.artist_name
  ) THEN
    v_artist_familiarity_score := 20; -- Full score for followed artists
  ELSE
    -- Check if user has shown interest in this artist's events (presence in user_jambase_events)
    SELECT COUNT(*) INTO v_artist_listen_count
    FROM user_jambase_events uje
    JOIN jambase_events je ON uje.jambase_event_id = je.id
    WHERE uje.user_id = p_user_id 
      AND je.artist_name = v_event.artist_name;
    
    IF v_artist_listen_count > 0 THEN
      v_artist_familiarity_score := LEAST(v_artist_listen_count * 5, 20); -- 5 points per interested event, max 20
    END IF;
  END IF;

  -- 3. SONG BEHAVIOR SIGNAL (max 15 points) - CAPTURE LISTENING DEPTH
  -- This would integrate with song-level metadata in the future
  -- For now, use artist familiarity as a proxy
  v_song_behavior_score := v_artist_familiarity_score * 0.75; -- 75% of artist score

  -- 4. SOCIAL PROOF SCORE (max 5 points) - FRIEND-DRIVEN RELEVANCE
  SELECT COUNT(*) INTO v_friends_interested_count
  FROM user_jambase_events uje
  WHERE uje.jambase_event_id = v_event.id
    AND uje.user_id IN (
      SELECT CASE
        WHEN user1_id = p_user_id THEN user2_id
        WHEN user2_id = p_user_id THEN user1_id
      END
      FROM friends
      WHERE user1_id = p_user_id OR user2_id = p_user_id
    );

  v_social_proof_score := LEAST(v_friends_interested_count * 1, 5);

  -- 5. RECENCY & LOCATION SCORE (max 5 points) - EVENT TIMING RELEVANCE
  v_days_until_event := EXTRACT(EPOCH FROM (v_event.event_date - now())) / 86400;
  
  IF v_days_until_event >= 0 AND v_days_until_event <= 45 THEN
    v_recency_score := GREATEST(0, 5 - (v_days_until_event / 9));
  ELSIF v_days_until_event > 45 AND v_days_until_event <= 60 THEN
    v_recency_score := 0.5; -- Small bonus for events within 60 days
  ELSE
    v_recency_score := 0;
  END IF;

  -- 6. PROMOTION BOOST (max 25 points) - BUSINESS LAYER
  -- Only apply if event is actively promoted
  IF v_is_promoted AND v_active_promotion_id IS NOT NULL THEN
    CASE v_promotion_tier
      WHEN 'basic' THEN
        v_promotion_boost := 10; -- Basic: 10 point boost
      WHEN 'premium' THEN
        v_promotion_boost := 18; -- Premium: 18 point boost
      WHEN 'featured' THEN
        v_promotion_boost := 25; -- Featured: 25 point boost
      ELSE
        v_promotion_boost := 0;
    END CASE;
  END IF;

  -- Calculate final score (capped at 100 before promotions)
  v_final_score := v_genre_affinity_score + v_artist_familiarity_score + 
                   v_song_behavior_score + v_social_proof_score + v_recency_score;
  
  -- Cap at 100 before adding promotion boost
  v_final_score := LEAST(v_final_score, 100);
  
  -- Add promotion boost (can exceed 100)
  v_final_score := v_final_score + v_promotion_boost;

  -- Ensure minimum score of 0
  v_final_score := GREATEST(v_final_score, 0);

  RETURN v_final_score;
END;
$function$;

-- Create the get_personalized_events_feed function using actual schema
CREATE OR REPLACE FUNCTION get_personalized_events_feed(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_include_past BOOLEAN DEFAULT false
)
RETURNS TABLE(
  event_id UUID,
  jambase_event_id TEXT,
  title TEXT,
  artist_name TEXT,
  artist_id TEXT,
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
  poster_image_url TEXT,
  ticket_available BOOLEAN,
  price_range TEXT,
  ticket_urls TEXT[],
  age_restriction TEXT,
  venue_capacity INT,
  tour_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  relevance_score NUMERIC,
  user_is_interested BOOLEAN,
  interested_count INT,
  friends_interested_count INT,
  is_promoted BOOLEAN,
  promotion_tier TEXT,
  active_promotion_id UUID,
  genre_affinity_score NUMERIC,
  artist_familiarity_score NUMERIC,
  song_behavior_score NUMERIC,
  social_proof_score NUMERIC,
  recency_score NUMERIC,
  promotion_boost NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH scored_events AS (
    -- Get events with base relevance scores and promotion data
    SELECT
      e.id,
      e.jambase_event_id,
      e.title,
      e.artist_name,
      e.artist_id,
      e.venue_name,
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
      e.poster_image_url,
      e.ticket_available,
      e.price_range,
      e.ticket_urls,
      e.age_restriction,
      e.venue_capacity,
      e.tour_name,
      e.created_at,
      e.updated_at,
      -- Promotion data from event_promotions table
      CASE WHEN ep.id IS NOT NULL THEN true ELSE false END as is_promoted,
      ep.promotion_tier,
      ep.id as active_promotion_id,
      calculate_event_relevance_score(p_user_id, e.id) as score,
      EXISTS(
        SELECT 1 FROM user_jambase_events uje 
        WHERE uje.user_id = p_user_id AND uje.jambase_event_id = e.id
      ) as user_is_interested,
      (
        SELECT COUNT(*)::INT FROM user_jambase_events uje
        WHERE uje.jambase_event_id = e.id AND uje.user_id != p_user_id
      ) as interested_count,
      (
        SELECT COUNT(*)::INT FROM user_jambase_events uje
        WHERE uje.jambase_event_id = e.id
          AND uje.user_id IN (
            SELECT CASE
              WHEN user1_id = p_user_id THEN user2_id
              WHEN user2_id = p_user_id THEN user1_id
            END
            FROM friends
            WHERE user1_id = p_user_id OR user2_id = p_user_id
          )
      ) as friends_interested_count
    FROM jambase_events e
    LEFT JOIN event_promotions ep ON e.id = ep.event_id
      AND ep.promotion_status = 'active'
      AND ep.starts_at <= now()
      AND ep.expires_at >= now()
    WHERE (p_include_past = true OR e.event_date >= CURRENT_DATE)
      AND e.artist_name IS NOT NULL
      AND e.artist_name != ''
  )
  SELECT 
    se.id,
    se.jambase_event_id,
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
    se.poster_image_url,
    se.ticket_available,
    se.price_range,
    se.ticket_urls,
    se.age_restriction,
    se.venue_capacity,
    se.tour_name,
    se.created_at,
    se.updated_at,
    se.score as relevance_score,
    se.user_is_interested,
    se.interested_count,
    se.friends_interested_count,
    se.is_promoted,
    se.promotion_tier,
    se.active_promotion_id,
    0.0 as genre_affinity_score, -- Placeholder - would be calculated separately
    0.0 as artist_familiarity_score, -- Placeholder - would be calculated separately
    0.0 as song_behavior_score, -- Placeholder - would be calculated separately
    0.0 as social_proof_score, -- Placeholder - would be calculated separately
    0.0 as recency_score, -- Placeholder - would be calculated separately
    0.0 as promotion_boost -- Placeholder - would be calculated separately
  FROM scored_events se
  ORDER BY se.score DESC, se.event_date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_genre_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_event_relevance_score(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_personalized_events_feed(UUID, INT, INT, BOOLEAN) TO authenticated;

-- Verification
SELECT 
  'Genre-First Algorithm Fixed for Promotions (Final)' as status,
  'Uses presence-based interest detection - no interested column needed' as description;

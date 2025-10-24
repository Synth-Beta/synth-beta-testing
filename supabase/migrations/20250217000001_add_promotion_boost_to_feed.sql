-- ============================================
-- ADD PROMOTION BOOST TO FEED ALGORITHM
-- ============================================
-- Updates the personalized feed scoring to prioritize promoted events

-- Update the calculate_event_relevance_score function to include promotion boost
CREATE OR REPLACE FUNCTION calculate_event_relevance_score(
  p_user_id UUID,
  p_event_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_score NUMERIC := 0;
  v_event RECORD;
  v_artist_score NUMERIC := 0;
  v_genre_score NUMERIC := 0;
  v_venue_score NUMERIC := 0;
  v_social_score NUMERIC := 0;
  v_recency_score NUMERIC := 0;
  v_promotion_boost NUMERIC := 0;
BEGIN
  -- Get event details including promotion info
  SELECT 
    e.id,
    e.artist_name,
    e.artist_id,
    e.venue_name,
    e.venue_id,
    e.genres,
    e.event_date,
    e.is_promoted,
    e.promotion_tier,
    e.active_promotion_id
  INTO v_event
  FROM jambase_events e
  WHERE e.id = p_event_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- ARTIST MATCH SCORE (max 40 points)
  SELECT COALESCE(preference_score, 0)
  INTO v_artist_score
  FROM music_preference_signals
  WHERE user_id = p_user_id
    AND preference_type = 'artist'
    AND preference_value = v_event.artist_name;
  
  -- Cap at 40
  v_artist_score := LEAST(v_artist_score, 40);
  
  -- GENRE MATCH SCORE (max 30 points)
  IF v_event.genres IS NOT NULL AND array_length(v_event.genres, 1) > 0 THEN
    SELECT COALESCE(SUM(preference_score), 0)
    INTO v_genre_score
    FROM music_preference_signals
    WHERE user_id = p_user_id
      AND preference_type = 'genre'
      AND preference_value = ANY(v_event.genres);
    
    -- Normalize: divide by number of genres and cap at 30
    v_genre_score := LEAST(v_genre_score / array_length(v_event.genres, 1), 30);
  END IF;
  
  -- VENUE MATCH SCORE (max 15 points)
  SELECT COALESCE(preference_score, 0)
  INTO v_venue_score
  FROM music_preference_signals
  WHERE user_id = p_user_id
    AND preference_type = 'venue'
    AND preference_value = v_event.venue_name;
  
  -- Cap at 15
  v_venue_score := LEAST(v_venue_score, 15);
  
  -- SOCIAL PROOF SCORE (max 10 points)
  -- Check if friends are interested in this event
  SELECT COUNT(*) * 2 -- 2 points per friend interested
  INTO v_social_score
  FROM user_jambase_events uje
  WHERE uje.jambase_event_id = p_event_id
    AND uje.user_id IN (
      SELECT CASE 
        WHEN user1_id = p_user_id THEN user2_id
        WHEN user2_id = p_user_id THEN user1_id
      END
      FROM friends
      WHERE user1_id = p_user_id OR user2_id = p_user_id
    );
  
  -- Cap at 10
  v_social_score := LEAST(v_social_score, 10);
  
  -- RECENCY SCORE (max 5 points)
  -- Events in next 30 days get boost
  IF v_event.event_date IS NOT NULL THEN
    DECLARE
      days_until_event INT;
    BEGIN
      -- Date subtraction returns integer days directly
      days_until_event := v_event.event_date::DATE - CURRENT_DATE;
      
      IF days_until_event >= 0 AND days_until_event <= 30 THEN
        -- Linear decay: 5 points for today, 0 points at 30 days
        v_recency_score := 5.0 * (1.0 - (days_until_event::NUMERIC / 30.0));
      ELSIF days_until_event > 30 AND days_until_event <= 60 THEN
        -- Small boost for events 31-60 days out
        v_recency_score := 2.0;
      END IF;
    END;
  END IF;
  
  -- PROMOTION BOOST (max 25 points)
  -- Only apply if event is actively promoted and promotion is still valid
  IF v_event.is_promoted AND v_event.active_promotion_id IS NOT NULL THEN
    -- Check if promotion is still active
    IF EXISTS (
      SELECT 1 FROM event_promotions ep
      WHERE ep.id = v_event.active_promotion_id
        AND ep.promotion_status = 'active'
        AND ep.starts_at <= now()
        AND ep.expires_at >= now()
    ) THEN
      -- Apply tier-based boost
      CASE v_event.promotion_tier
        WHEN 'basic' THEN
          v_promotion_boost := 10; -- Basic: 10 point boost
        WHEN 'premium' THEN
          v_promotion_boost := 18; -- Premium: 18 point boost
        WHEN 'featured' THEN
          v_promotion_boost := 25; -- Featured: 25 point boost (max)
        ELSE
          v_promotion_boost := 5; -- Fallback for unknown tiers
      END CASE;
    END IF;
  END IF;
  
  -- TOTAL SCORE (now includes promotion boost)
  v_score := v_artist_score + v_genre_score + v_venue_score + v_social_score + v_recency_score + v_promotion_boost;
  
  RETURN v_score;
END;
$function$;

-- Update the get_personalized_events_feed function to include promotion fields
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
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  relevance_score NUMERIC,
  user_is_interested BOOLEAN,
  interested_count INT,
  friends_interested_count INT,
  is_promoted BOOLEAN,
  promotion_tier TEXT,
  active_promotion_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH event_scores AS (
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
      e.ticket_available,
      e.price_range,
      e.ticket_urls,
      e.setlist,
      e.setlist_enriched,
      e.setlist_song_count,
      e.setlist_fm_id,
      e.setlist_fm_url,
      e.setlist_source,
      e.setlist_last_updated,
      e.tour_name,
      e.created_at,
      e.updated_at,
      e.is_promoted,
      e.promotion_tier,
      e.active_promotion_id,
      calculate_event_relevance_score(p_user_id, e.id) as score,
      EXISTS(
        SELECT 1 FROM user_jambase_events uje 
        WHERE uje.user_id = p_user_id AND uje.jambase_event_id = e.id
      ) as is_interested,
      (
        SELECT COUNT(*) FROM user_jambase_events uje 
        WHERE uje.jambase_event_id = e.id AND uje.user_id != p_user_id
      )::INT as interested_count,
      (
        SELECT COUNT(*) FROM user_jambase_events uje
        WHERE uje.jambase_event_id = e.id
          AND uje.user_id IN (
            SELECT CASE 
              WHEN user1_id = p_user_id THEN user2_id
              WHEN user2_id = p_user_id THEN user1_id
            END
            FROM friends
            WHERE user1_id = p_user_id OR user2_id = p_user_id
          )
      )::INT as friends_interested_count
    FROM jambase_events e
    WHERE (p_include_past = true OR e.event_date >= CURRENT_DATE)
  )
  SELECT 
    es.id,
    es.jambase_event_id,
    es.title,
    es.artist_name,
    es.artist_id,
    es.venue_name,
    es.venue_id,
    es.event_date,
    es.doors_time,
    es.description,
    es.genres,
    es.venue_address,
    es.venue_city,
    es.venue_state,
    es.venue_zip,
    es.latitude,
    es.longitude,
    es.ticket_available,
    es.price_range,
    es.ticket_urls,
    es.setlist,
    es.setlist_enriched,
    es.setlist_song_count,
    es.setlist_fm_id,
    es.setlist_fm_url,
    es.setlist_source,
    es.setlist_last_updated,
    es.tour_name,
    es.created_at,
    es.updated_at,
    es.score,
    es.is_interested,
    es.interested_count,
    es.friends_interested_count,
    es.is_promoted,
    es.promotion_tier,
    es.active_promotion_id
  FROM event_scores es
  ORDER BY es.score DESC, es.event_date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- Create a function to get promotion boost explanation for debugging
CREATE OR REPLACE FUNCTION get_promotion_boost_explanation(
  p_user_id UUID,
  p_event_id UUID
)
RETURNS TABLE(
  event_title TEXT,
  is_promoted BOOLEAN,
  promotion_tier TEXT,
  base_score NUMERIC,
  promotion_boost NUMERIC,
  total_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_event RECORD;
  v_base_score NUMERIC;
  v_promotion_boost NUMERIC := 0;
  v_total_score NUMERIC;
BEGIN
  -- Get event details
  SELECT 
    e.title,
    e.is_promoted,
    e.promotion_tier,
    e.active_promotion_id
  INTO v_event
  FROM jambase_events e
  WHERE e.id = p_event_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate base score (without promotion boost)
  -- This is a simplified version - in practice you'd call the full function
  v_base_score := 50; -- Placeholder - would be actual base score
  
  -- Calculate promotion boost
  IF v_event.is_promoted AND v_event.active_promotion_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM event_promotions ep
      WHERE ep.id = v_event.active_promotion_id
        AND ep.promotion_status = 'active'
        AND ep.starts_at <= now()
        AND ep.expires_at >= now()
    ) THEN
      CASE v_event.promotion_tier
        WHEN 'basic' THEN v_promotion_boost := 10;
        WHEN 'premium' THEN v_promotion_boost := 18;
        WHEN 'featured' THEN v_promotion_boost := 25;
        ELSE v_promotion_boost := 5;
      END CASE;
    END IF;
  END IF;
  
  v_total_score := v_base_score + v_promotion_boost;
  
  RETURN QUERY SELECT
    v_event.title,
    v_event.is_promoted,
    v_event.promotion_tier,
    v_base_score,
    v_promotion_boost,
    v_total_score;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_promotion_boost_explanation(UUID, UUID) TO authenticated;

-- Verification
SELECT 
  'Promotion Boost Added to Feed Algorithm' as status,
  'Promoted events will now appear higher in user feeds' as description;

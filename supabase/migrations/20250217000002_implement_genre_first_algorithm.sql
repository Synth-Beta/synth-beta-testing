-- ============================================
-- IMPLEMENT GENRE-FIRST ALGORITHM
-- ============================================
-- Implements the new genre-first scoring system with improved weights and logic

-- Create function to get user's genre profile with normalized weights
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
    -- From music preference signals (listening data)
    SELECT 
      preference_value as genre,
      preference_score,
      'listening' as source
    FROM music_preference_signals
    WHERE user_id = p_user_id 
      AND preference_type = 'genre'
      AND preference_score > 0
    
    UNION ALL
    
    -- From followed artists' genres
    SELECT 
      unnest(genres) as genre,
      5.0 as preference_score, -- Base weight for followed artists
      'followed_artists' as source
    FROM artist_profiles ap
    JOIN artist_follows af ON ap.artist_id = af.artist_id
    WHERE af.user_id = p_user_id
      AND ap.genres IS NOT NULL
    
    UNION ALL
    
    -- From liked events
    SELECT 
      unnest(genres) as genre,
      3.0 as preference_score, -- Base weight for liked events
      'liked_events' as source
    FROM jambase_events je
    JOIN user_jambase_events uje ON je.id = uje.jambase_event_id
    WHERE uje.user_id = p_user_id
      AND uje.interested = true
      AND je.genres IS NOT NULL
  ),
  genre_aggregated AS (
    SELECT 
      genre,
      SUM(preference_score) as total_score,
      COUNT(DISTINCT source) as source_count
    FROM genre_signals
    GROUP BY genre
  ),
  genre_normalized AS (
    SELECT 
      genre,
      total_score,
      source_count,
      total_score / SUM(total_score) OVER() as normalized_weight
    FROM genre_aggregated
  )
  SELECT 
    gn.genre,
    gn.normalized_weight,
    CASE 
      WHEN gn.source_count = 1 THEN 'single_source'
      WHEN gn.source_count = 2 THEN 'dual_source'
      ELSE 'multi_source'
    END as source
  FROM genre_normalized gn
  WHERE gn.normalized_weight > 0.01 -- Only include genres with >1% weight
  ORDER BY gn.normalized_weight DESC;
END;
$function$;

-- Create function to get user's song behavior signals
CREATE OR REPLACE FUNCTION get_user_song_behavior_signals(p_user_id UUID)
RETURNS TABLE(
  mood TEXT,
  tempo_range TEXT,
  sub_genre TEXT,
  weight NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH recent_songs AS (
    -- Get recently played/liked songs from streaming profiles
    SELECT 
      sp.track_name,
      sp.artist_name,
      sp.genres,
      sp.play_count,
      sp.last_played_at
    FROM streaming_profiles sp
    WHERE sp.user_id = p_user_id
      AND sp.last_played_at >= CURRENT_DATE - INTERVAL '30 days'
      AND sp.play_count > 0
    ORDER BY sp.last_played_at DESC
    LIMIT 100
  ),
  song_metadata AS (
    -- Extract metadata from song data (simplified - would use actual music API)
    SELECT 
      track_name,
      artist_name,
      CASE 
        WHEN genres && ARRAY['indie', 'alternative', 'folk'] THEN 'chill'
        WHEN genres && ARRAY['rock', 'metal', 'punk'] THEN 'energetic'
        WHEN genres && ARRAY['pop', 'dance', 'electronic'] THEN 'upbeat'
        WHEN genres && ARRAY['jazz', 'blues', 'soul'] THEN 'smooth'
        ELSE 'neutral'
      END as mood,
      CASE 
        WHEN genres && ARRAY['electronic', 'dance', 'house'] THEN 'fast'
        WHEN genres && ARRAY['ballad', 'acoustic', 'folk'] THEN 'slow'
        ELSE 'medium'
      END as tempo_range,
      CASE 
        WHEN genres && ARRAY['indie rock', 'alternative rock'] THEN 'indie_rock'
        WHEN genres && ARRAY['pop rock', 'power pop'] THEN 'pop_rock'
        WHEN genres && ARRAY['electronic', 'synthpop'] THEN 'electronic'
        WHEN genres && ARRAY['folk', 'acoustic'] THEN 'folk'
        ELSE 'other'
      END as sub_genre,
      play_count
    FROM recent_songs
  ),
  behavior_aggregated AS (
    SELECT 
      mood,
      tempo_range,
      sub_genre,
      SUM(play_count) as total_plays,
      COUNT(*) as song_count
    FROM song_metadata
    GROUP BY mood, tempo_range, sub_genre
  ),
  behavior_normalized AS (
    SELECT 
      mood,
      tempo_range,
      sub_genre,
      total_plays,
      song_count,
      total_plays / SUM(total_plays) OVER() as weight
    FROM behavior_aggregated
  )
  SELECT 
    bn.mood,
    bn.tempo_range,
    bn.sub_genre,
    bn.weight
  FROM behavior_normalized bn
  WHERE bn.weight > 0.05 -- Only include significant patterns
  ORDER BY bn.weight DESC;
END;
$function$;

-- Create function to calculate artist familiarity with novelty penalty
CREATE OR REPLACE FUNCTION calculate_artist_familiarity_with_novelty(
  p_user_id UUID,
  p_artist_name TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_familiarity_score NUMERIC := 0;
  v_novelty_penalty NUMERIC := 0;
  v_recent_events_count INT := 0;
BEGIN
  -- Get artist familiarity from preference signals
  SELECT COALESCE(preference_score, 0)
  INTO v_familiarity_score
  FROM music_preference_signals
  WHERE user_id = p_user_id
    AND preference_type = 'artist'
    AND preference_value = p_artist_name;
  
  -- Cap at 20 points
  v_familiarity_score := LEAST(v_familiarity_score, 20);
  
  -- Calculate novelty penalty (reduce score if user has seen this artist recently)
  SELECT COUNT(*)
  INTO v_recent_events_count
  FROM jambase_events je
  JOIN user_jambase_events uje ON je.id = uje.jambase_event_id
  WHERE uje.user_id = p_user_id
    AND je.artist_name = p_artist_name
    AND je.event_date >= CURRENT_DATE - INTERVAL '90 days';
  
  -- Apply novelty penalty: -2 points for each recent event (max -6)
  IF v_recent_events_count >= 2 THEN
    v_novelty_penalty := LEAST((v_recent_events_count - 1) * 2, 6);
  END IF;
  
  RETURN GREATEST(v_familiarity_score - v_novelty_penalty, 0);
END;
$function$;

-- Create function to calculate song behavior signal score
CREATE OR REPLACE FUNCTION calculate_song_behavior_score(
  p_user_id UUID,
  p_event_genres TEXT[]
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_behavior_score NUMERIC := 0;
  v_song_signal RECORD;
  v_genre_match_score NUMERIC := 0;
BEGIN
  -- Get user's song behavior signals
  FOR v_song_signal IN 
    SELECT mood, tempo_range, sub_genre, weight
    FROM get_user_song_behavior_signals(p_user_id)
  LOOP
    -- Check if event genres match user's song behavior patterns
    -- This is a simplified matching - in practice would use more sophisticated genre mapping
    IF p_event_genres IS NOT NULL THEN
      -- Match based on sub-genre patterns
      CASE v_song_signal.sub_genre
        WHEN 'indie_rock' THEN
          IF p_event_genres && ARRAY['indie', 'alternative', 'rock'] THEN
            v_genre_match_score := v_genre_match_score + v_song_signal.weight;
          END IF;
        WHEN 'pop_rock' THEN
          IF p_event_genres && ARRAY['pop', 'rock', 'alternative'] THEN
            v_genre_match_score := v_genre_match_score + v_song_signal.weight;
          END IF;
        WHEN 'electronic' THEN
          IF p_event_genres && ARRAY['electronic', 'dance', 'synthpop'] THEN
            v_genre_match_score := v_genre_match_score + v_song_signal.weight;
          END IF;
        WHEN 'folk' THEN
          IF p_event_genres && ARRAY['folk', 'acoustic', 'singer-songwriter'] THEN
            v_genre_match_score := v_genre_match_score + v_song_signal.weight;
          END IF;
      END CASE;
    END IF;
  END LOOP;
  
  -- Convert to 0-15 point scale
  v_behavior_score := LEAST(v_genre_match_score * 15, 15);
  
  RETURN v_behavior_score;
END;
$function$;

-- Update the main scoring function with genre-first algorithm
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
  v_genre_affinity_score NUMERIC := 0;
  v_artist_familiarity_score NUMERIC := 0;
  v_song_behavior_score NUMERIC := 0;
  v_social_proof_score NUMERIC := 0;
  v_recency_score NUMERIC := 0;
  v_promotion_boost NUMERIC := 0;
  v_genre_profile RECORD;
  v_total_genre_weight NUMERIC := 0;
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
  
  -- GENRE AFFINITY SCORE (max 45 points) - NEW PRIMARY FACTOR
  -- Calculate weighted genre affinity based on user's genre profile
  IF v_event.genres IS NOT NULL AND array_length(v_event.genres, 1) > 0 THEN
    -- Get user's genre profile
    FOR v_genre_profile IN 
      SELECT genre, weight
      FROM get_user_genre_profile(p_user_id)
    LOOP
      -- Check if event has this genre
      IF v_genre_profile.genre = ANY(v_event.genres) THEN
        v_genre_affinity_score := v_genre_affinity_score + v_genre_profile.weight;
        v_total_genre_weight := v_total_genre_weight + v_genre_profile.weight;
      END IF;
    END LOOP;
    
    -- Normalize and scale to 45 points
    IF v_total_genre_weight > 0 THEN
      v_genre_affinity_score := (v_genre_affinity_score / v_total_genre_weight) * 45;
    END IF;
  END IF;
  
  -- ARTIST FAMILIARITY SCORE (max 20 points) - REDUCED FROM 40
  -- Now includes novelty penalty to encourage discovery
  v_artist_familiarity_score := calculate_artist_familiarity_with_novelty(p_user_id, v_event.artist_name);
  
  -- SONG BEHAVIOR SIGNAL SCORE (max 15 points) - NEW
  -- Based on user's recent listening patterns and track metadata
  v_song_behavior_score := calculate_song_behavior_score(p_user_id, v_event.genres);
  
  -- SOCIAL PROOF SCORE (max 5 points) - REDUCED FROM 10
  -- Check if friends are interested in this event
  SELECT COUNT(*) * 1 -- 1 point per friend interested (reduced from 2)
  INTO v_social_proof_score
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
  
  -- Cap at 5
  v_social_proof_score := LEAST(v_social_proof_score, 5);
  
  -- RECENCY SCORE (max 5 points) - IMPROVED ALGORITHM
  -- Linear decay from now to 45 days out, 0 beyond 60 days
  IF v_event.event_date IS NOT NULL THEN
    DECLARE
      days_until_event INT;
    BEGIN
      days_until_event := v_event.event_date::DATE - CURRENT_DATE;
      
      IF days_until_event >= 0 AND days_until_event <= 45 THEN
        -- Linear decay: 5 points for today, 0 points at 45 days
        v_recency_score := 5.0 * (1.0 - (days_until_event::NUMERIC / 45.0));
      ELSIF days_until_event > 45 AND days_until_event <= 60 THEN
        -- Small boost for events 46-60 days out
        v_recency_score := 1.0;
      END IF;
    END;
  END IF;
  
  -- PROMOTION BOOST (max 25 points) - UNCHANGED
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
  
  -- TOTAL SCORE (now with genre-first weighting)
  v_score := v_genre_affinity_score + v_artist_familiarity_score + v_song_behavior_score + 
             v_social_proof_score + v_recency_score + v_promotion_boost;
  
  -- Cap at 100 before promotion boost (promotions can push over 100)
  v_score := LEAST(v_score, 100 + v_promotion_boost);
  
  RETURN v_score;
END;
$function$;

-- Create function to get genre exploration events (5% of feed)
CREATE OR REPLACE FUNCTION get_genre_exploration_events(
  p_user_id UUID,
  p_limit INT DEFAULT 5
)
RETURNS TABLE(
  event_id UUID,
  exploration_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH user_genres AS (
    SELECT genre
    FROM get_user_genre_profile(p_user_id)
  ),
  adjacent_genres AS (
    -- Define genre adjacency (simplified mapping)
    SELECT 
      CASE 
        WHEN ug.genre = 'indie rock' THEN 'dream pop'
        WHEN ug.genre = 'alternative' THEN 'indie pop'
        WHEN ug.genre = 'electronic' THEN 'synthwave'
        WHEN ug.genre = 'folk' THEN 'indie folk'
        WHEN ug.genre = 'pop' THEN 'indie pop'
        ELSE 'alternative'
      END as exploration_genre
    FROM user_genres ug
  ),
  exploration_events AS (
    SELECT 
      je.id as event_id,
      RANDOM() as exploration_score -- Random for variety
    FROM jambase_events je
    WHERE je.event_date >= CURRENT_DATE
      AND je.genres && (SELECT ARRAY_AGG(exploration_genre) FROM adjacent_genres)
      AND NOT EXISTS (
        SELECT 1 FROM user_jambase_events uje 
        WHERE uje.user_id = p_user_id AND uje.jambase_event_id = je.id
      )
  )
  SELECT 
    ee.event_id,
    ee.exploration_score
  FROM exploration_events ee
  ORDER BY ee.exploration_score DESC
  LIMIT p_limit;
END;
$function$;

-- Update the main feed function to include diversity controls
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
  active_promotion_id UUID,
  genre_affinity_score NUMERIC,
  artist_familiarity_score NUMERIC,
  song_behavior_score NUMERIC,
  is_exploration BOOLEAN
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
      )::INT as friends_interested_count,
      false as is_exploration
    FROM jambase_events e
    WHERE (p_include_past = true OR e.event_date >= CURRENT_DATE)
  ),
  diversity_controlled AS (
    -- Apply diversity rule: max 3 events per artist
    SELECT 
      es.*,
      ROW_NUMBER() OVER (
        PARTITION BY es.artist_name 
        ORDER BY es.score DESC
      ) as artist_rank
    FROM event_scores es
  ),
  main_events AS (
    SELECT *
    FROM diversity_controlled
    WHERE artist_rank <= 3
    ORDER BY score DESC
    LIMIT p_limit - 3 -- Reserve 3 slots for exploration
  ),
  exploration_events AS (
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
      )::INT as friends_interested_count,
      true as is_exploration
    FROM jambase_events e
    WHERE e.id IN (
      SELECT event_id FROM get_genre_exploration_events(p_user_id, 3)
    )
  ),
  combined_events AS (
    SELECT * FROM main_events
    UNION ALL
    SELECT * FROM exploration_events
  )
  SELECT 
    ce.id,
    ce.jambase_event_id,
    ce.title,
    ce.artist_name,
    ce.artist_id,
    ce.venue_name,
    ce.venue_id,
    ce.event_date,
    ce.doors_time,
    ce.description,
    ce.genres,
    ce.venue_address,
    ce.venue_city,
    ce.venue_state,
    ce.venue_zip,
    ce.latitude,
    ce.longitude,
    ce.ticket_available,
    ce.price_range,
    ce.ticket_urls,
    ce.setlist,
    ce.setlist_enriched,
    ce.setlist_song_count,
    ce.setlist_fm_id,
    ce.setlist_fm_url,
    ce.setlist_source,
    ce.setlist_last_updated,
    ce.tour_name,
    ce.created_at,
    ce.updated_at,
    ce.score,
    ce.is_interested,
    ce.interested_count,
    ce.friends_interested_count,
    ce.is_promoted,
    ce.promotion_tier,
    ce.active_promotion_id,
    0.0 as genre_affinity_score, -- Placeholder - would be calculated separately
    0.0 as artist_familiarity_score, -- Placeholder - would be calculated separately
    0.0 as song_behavior_score, -- Placeholder - would be calculated separately
    ce.is_exploration
  FROM combined_events ce
  ORDER BY 
    CASE WHEN ce.is_exploration THEN 1 ELSE 0 END, -- Exploration events last
    ce.score DESC,
    ce.event_date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_genre_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_song_behavior_signals(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_artist_familiarity_with_novelty(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_song_behavior_score(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_genre_exploration_events(UUID, INT) TO authenticated;

-- Verification
SELECT 
  'Genre-First Algorithm Implemented' as status,
  'New scoring: Genre(45), Artist(20), Song(15), Social(5), Recency(5), Promotion(25)' as description;

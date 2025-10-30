-- ============================================================
-- MIGRATION 8: Personalized Event Feed with Relevance Scoring
-- Calculates hidden relevance scores for each event based on user's music preferences
-- All scores mapped to user UUID
-- ============================================================

-- Drop existing functions if they exist
-- Use CASCADE to handle dependencies
DROP FUNCTION IF EXISTS calculate_event_relevance_score CASCADE;
DROP FUNCTION IF EXISTS get_personalized_events_feed CASCADE;
DROP FUNCTION IF EXISTS get_user_top_genres CASCADE;
DROP FUNCTION IF EXISTS get_user_top_artists CASCADE;
DROP FUNCTION IF EXISTS get_user_music_profile_summary CASCADE;

-- ============================================================
-- Function: Calculate Event Relevance Score for User
-- ============================================================
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
BEGIN
  -- Get event details
  SELECT 
    e.id,
    e.artist_name,
    e.artist_id,
    e.venue_name,
    e.venue_id,
    e.genres,
    e.event_date
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
  
  -- TOTAL SCORE
  v_score := v_artist_score + v_genre_score + v_venue_score + v_social_score + v_recency_score;
  
  RETURN v_score;
END;
$function$;

-- ============================================================
-- Function: Get Personalized Events Feed for User
-- Returns events sorted by relevance score (hidden from user)
-- ============================================================
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
  friends_interested_count INT
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
      calculate_event_relevance_score(p_user_id, e.id) as score,
      EXISTS(
        SELECT 1 FROM user_jambase_events uje 
        WHERE uje.user_id = p_user_id AND (
          -- Handle differing types between tables by casting to UUID when needed
          (pg_typeof(e.jambase_event_id)::text = 'uuid' AND uje.jambase_event_id::uuid = e.jambase_event_id) OR
          (pg_typeof(e.jambase_event_id)::text <> 'uuid' AND uje.jambase_event_id = e.jambase_event_id)
        )
      ) as is_interested,
      (
        SELECT COUNT(*) FROM user_jambase_events uje 
        WHERE (
          (pg_typeof(e.jambase_event_id)::text = 'uuid' AND uje.jambase_event_id::uuid = e.jambase_event_id) OR
          (pg_typeof(e.jambase_event_id)::text <> 'uuid' AND uje.jambase_event_id = e.jambase_event_id)
        )
        AND uje.user_id != p_user_id
      )::INT as interested_count,
      (
        SELECT COUNT(*) FROM user_jambase_events uje
        WHERE (
          (pg_typeof(e.jambase_event_id)::text = 'uuid' AND uje.jambase_event_id::uuid = e.jambase_event_id) OR
          (pg_typeof(e.jambase_event_id)::text <> 'uuid' AND uje.jambase_event_id = e.jambase_event_id)
        )
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
    es.friends_interested_count
  FROM event_scores es
  ORDER BY 
    es.score DESC NULLS LAST,  -- Primary sort by relevance
    es.event_date ASC,          -- Secondary sort by date
    es.friends_interested_count DESC  -- Tertiary sort by social proof
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- ============================================================
-- Function: Get User's Top Genres (for quick access)
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_top_genres(
  p_user_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  genre TEXT,
  score NUMERIC,
  interaction_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    mps.preference_value,
    mps.preference_score,
    mps.interaction_count::BIGINT
  FROM music_preference_signals mps
  WHERE mps.user_id = p_user_id
    AND mps.preference_type = 'genre'
  ORDER BY mps.preference_score DESC
  LIMIT p_limit;
END;
$function$;

-- ============================================================
-- Function: Get User's Top Artists (for quick access)
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_top_artists(
  p_user_id UUID,
  p_limit INT DEFAULT 20
)
RETURNS TABLE(
  artist_name TEXT,
  artist_id UUID,
  score NUMERIC,
  interaction_count BIGINT,
  genres TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    mps.preference_value,
    a.id,
    mps.preference_score,
    mps.interaction_count::BIGINT,
    COALESCE(ap.genres, ARRAY[]::TEXT[])
  FROM music_preference_signals mps
  LEFT JOIN artists a ON a.name = mps.preference_value
  LEFT JOIN artist_profile ap ON ap.jambase_artist_id = a.jambase_artist_id
  WHERE mps.user_id = p_user_id
    AND mps.preference_type = 'artist'
  ORDER BY mps.preference_score DESC
  LIMIT p_limit;
END;
$function$;

-- ============================================================
-- Function: Get Complete Music Profile for User (debug/admin)
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_music_profile_summary(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'user_id', p_user_id,
    'top_genres', (
      SELECT jsonb_agg(jsonb_build_object(
        'genre', preference_value,
        'score', preference_score,
        'count', interaction_count
      ) ORDER BY preference_score DESC)
      FROM music_preference_signals
      WHERE user_id = p_user_id AND preference_type = 'genre'
      LIMIT 10
    ),
    'top_artists', (
      SELECT jsonb_agg(jsonb_build_object(
        'artist', preference_value,
        'score', preference_score,
        'count', interaction_count
      ) ORDER BY preference_score DESC)
      FROM music_preference_signals
      WHERE user_id = p_user_id AND preference_type = 'artist'
      LIMIT 20
    ),
    'total_artist_interactions', (
      SELECT COUNT(*) FROM user_artist_interactions WHERE user_id = p_user_id
    ),
    'total_song_interactions', (
      SELECT COUNT(*) FROM user_song_interactions WHERE user_id = p_user_id
    ),
    'total_genre_interactions', (
      SELECT COUNT(*) FROM user_genre_interactions WHERE user_id = p_user_id
    ),
    'artists_followed', (
      SELECT COUNT(*) FROM artist_follows WHERE user_id = p_user_id
    ),
    'events_interested', (
      SELECT COUNT(*) FROM user_jambase_events WHERE user_id = p_user_id
    ),
    'reviews_written', (
      SELECT COUNT(*) FROM user_reviews WHERE user_id = p_user_id
    ),
    'has_streaming_data', (
      SELECT EXISTS(SELECT 1 FROM streaming_profiles WHERE user_id = p_user_id)
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$function$;

-- Add helpful comments
COMMENT ON FUNCTION calculate_event_relevance_score IS 'Calculates hidden relevance score (0-100) for an event based on user music preferences';
COMMENT ON FUNCTION get_personalized_events_feed IS 'Returns events sorted by personalized relevance score (hidden from user UI)';
COMMENT ON FUNCTION get_user_top_genres IS 'Quick access to user top genres by preference score';
COMMENT ON FUNCTION get_user_top_artists IS 'Quick access to user top artists by preference score';
COMMENT ON FUNCTION get_user_music_profile_summary IS 'Complete music profile summary for debugging/admin';


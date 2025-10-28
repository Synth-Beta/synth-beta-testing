-- Ensure get_personalized_events_feed and calculate_event_relevance_score functions exist
-- This recreates both functions to ensure they're properly defined and don't reference artist_profile

-- First, ensure get_user_genre_profile is recreated (fixes interested column issue)
DROP FUNCTION IF EXISTS get_user_genre_profile(UUID) CASCADE;

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
  -- Use only tables that are guaranteed to exist
  -- Removed artist_profile dependency entirely
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
    
    -- From interested events (presence-based: row exists = user is interested)
    -- Note: user_jambase_events table doesn't have an 'interested' column
    SELECT 
      unnest(genres) as genre,
      3.0 as preference_score,
      'liked_events' as source
    FROM jambase_events je
    JOIN user_jambase_events uje ON je.id = uje.jambase_event_id
    WHERE uje.user_id = p_user_id
      AND je.genres IS NOT NULL
      AND array_length(je.genres, 1) > 0
    
    -- Note: Removed artist_profile dependency
    -- If you need followed artists' genres, ensure artist_profile table exists first
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
      ga.genre,
      ga.total_score,
      ga.source_count,
      ga.total_score / NULLIF(SUM(ga.total_score) OVER(), 0) as normalized_weight
    FROM genre_aggregated ga
  ),
  genre_with_source AS (
    SELECT DISTINCT ON (gn.genre)
      gn.genre,
      gn.normalized_weight,
      gn.source_count,
      gs.source
    FROM genre_normalized gn
    LEFT JOIN genre_signals gs ON gs.genre = gn.genre
    ORDER BY gn.genre, gn.source_count DESC
  )
  SELECT 
    gws.genre,
    COALESCE(gws.normalized_weight, 0) as weight,
    CASE 
      WHEN gws.source_count > 1 THEN 'multiple'
      ELSE COALESCE(gws.source, 'unknown')
    END as source
  FROM genre_with_source gws
  WHERE gws.normalized_weight > 0
  ORDER BY gws.normalized_weight DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION get_user_genre_profile(UUID) TO authenticated;

-- Now ensure calculate_event_relevance_score exists and doesn't reference artist_profile
DROP FUNCTION IF EXISTS calculate_event_relevance_score(UUID, UUID) CASCADE;

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
  v_total_listen_count NUMERIC;
  v_artist_percentile NUMERIC;
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
  -- Get user's genre profile (already fixed to not reference artist_profile)
  FOR v_user_genre_profile IN 
    SELECT genre, weight FROM get_user_genre_profile(p_user_id)
  LOOP
    -- Check if event genres match user's preferred genres
    IF v_event.genres && ARRAY[v_user_genre_profile.genre] THEN
      v_genre_weight := v_user_genre_profile.weight;
      v_genre_affinity_score := v_genre_affinity_score + (v_genre_weight * 45);
    END IF;
  END LOOP;

  -- 2. ARTIST FAMILIARITY SCORE (max 20 points) - Uses artist_preference_signals (not artist_profile)
  SELECT COALESCE(SUM(aps.preference_score), 0) INTO v_artist_listen_count
  FROM artist_preference_signals aps
  WHERE aps.user_id = p_user_id 
    AND aps.artist_name = v_event.artist_name
    AND aps.preference_type = 'listen_count';

  IF v_artist_listen_count > 0 THEN
    SELECT COUNT(*) INTO v_total_listen_count
    FROM artist_preference_signals aps
    WHERE aps.user_id = p_user_id 
      AND aps.preference_type = 'listen_count';
    
    IF v_total_listen_count > 0 THEN
      v_artist_percentile := v_artist_listen_count / v_total_listen_count;
      v_artist_familiarity_score := LEAST(v_artist_percentile * 20, 20);
    END IF;
  END IF;

  -- 3. SONG BEHAVIOR SIGNAL (max 15 points)
  v_song_behavior_score := v_artist_familiarity_score * 0.75;

  -- 4. SOCIAL PROOF SCORE (max 5 points)
  -- Note: user_jambase_events.jambase_event_id is UUID (references jambase_events.id), not TEXT
  SELECT COUNT(*) INTO v_friends_interested_count
  FROM user_jambase_events uje
  WHERE uje.jambase_event_id = v_event.id  -- Use id (UUID), not jambase_event_id (TEXT)
    AND uje.user_id IN (
      SELECT CASE
        WHEN user1_id = p_user_id THEN user2_id
        WHEN user2_id = p_user_id THEN user1_id
      END
      FROM friends
      WHERE user1_id = p_user_id OR user2_id = p_user_id
    );

  v_social_proof_score := LEAST(v_friends_interested_count * 1, 5);

  -- 5. RECENCY SCORE (max 5 points)
  v_days_until_event := EXTRACT(EPOCH FROM (v_event.event_date - now())) / 86400;
  
  IF v_days_until_event >= 0 AND v_days_until_event <= 45 THEN
    v_recency_score := GREATEST(0, 5 - (v_days_until_event / 9));
  ELSIF v_days_until_event > 45 AND v_days_until_event <= 60 THEN
    v_recency_score := 0.5;
  ELSE
    v_recency_score := 0;
  END IF;

  -- 6. PROMOTION BOOST (max 25 points)
  IF v_is_promoted AND v_active_promotion_id IS NOT NULL THEN
    CASE v_promotion_tier
      WHEN 'basic' THEN v_promotion_boost := 10;
      WHEN 'premium' THEN v_promotion_boost := 18;
      WHEN 'featured' THEN v_promotion_boost := 25;
      ELSE v_promotion_boost := 0;
    END CASE;
  END IF;

  -- Calculate final score
  v_final_score := v_genre_affinity_score + v_artist_familiarity_score + 
                   v_song_behavior_score + v_social_proof_score + v_recency_score;
  v_final_score := LEAST(v_final_score, 100);
  v_final_score := v_final_score + v_promotion_boost;
  v_final_score := GREATEST(v_final_score, 0);

  RETURN v_final_score;
END;
$function$;

GRANT EXECUTE ON FUNCTION calculate_event_relevance_score(UUID, UUID) TO authenticated;

-- Now recreate get_personalized_events_feed
DROP FUNCTION IF EXISTS get_personalized_events_feed(UUID, INT, INT, BOOLEAN) CASCADE;

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
  venue_id TEXT,
  event_date TIMESTAMPTZ,
  doors_time TIMESTAMPTZ,
  description TEXT,
  genres TEXT[],
  venue_address TEXT,
  venue_city TEXT,
  venue_state TEXT,
  venue_country TEXT,
  venue_postal_code TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  poster_image_url TEXT,
  ticket_url TEXT,
  ticket_provider TEXT,
  ticket_provider_url TEXT,
  ticket_price_min NUMERIC,
  ticket_price_max NUMERIC,
  ticket_price_currency TEXT,
  ticket_availability TEXT,
  ticket_sale_start TIMESTAMPTZ,
  ticket_sale_end TIMESTAMPTZ,
  age_restriction TEXT,
  venue_capacity INT,
  venue_type TEXT,
  venue_phone TEXT,
  venue_website TEXT,
  venue_description TEXT,
  artist_website TEXT,
  artist_spotify_url TEXT,
  artist_instagram_url TEXT,
  artist_twitter_url TEXT,
  artist_facebook_url TEXT,
  artist_youtube_url TEXT,
  artist_soundcloud_url TEXT,
  artist_bandcamp_url TEXT,
  artist_website_url TEXT,
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
    -- calculate_event_relevance_score doesn't reference artist_profile
    SELECT
      e.id,
      e.jambase_event_id,
      e.title,
      e.artist_name,
      e.artist_id,
      e.venue_name,
      e.venue_id::TEXT,  -- Cast to TEXT to match function signature
      e.event_date,
      e.doors_time,
      e.description,
      e.genres,
      e.venue_address,
      e.venue_city,
      e.venue_state,
      NULL::TEXT as venue_country, -- Column doesn't exist in jambase_events
      e.venue_zip as venue_postal_code, -- Using venue_zip instead of venue_postal_code
      e.latitude,
      e.longitude,
      e.poster_image_url,
      CASE WHEN e.ticket_urls IS NOT NULL AND array_length(e.ticket_urls, 1) > 0 THEN e.ticket_urls[1] ELSE NULL END as ticket_url, -- Extract first URL from array
      NULL::TEXT as ticket_provider, -- Column doesn't exist
      NULL::TEXT as ticket_provider_url, -- Column doesn't exist
      e.price_min as ticket_price_min, -- Using price_min from Ticketmaster migration
      e.price_max as ticket_price_max, -- Using price_max from Ticketmaster migration
      e.price_currency as ticket_price_currency, -- Using price_currency from Ticketmaster migration
      e.event_status as ticket_availability, -- Using event_status from Ticketmaster migration
      NULL::TIMESTAMPTZ as ticket_sale_start, -- Column doesn't exist
      NULL::TIMESTAMPTZ as ticket_sale_end, -- Column doesn't exist
      e.age_restriction,
      e.venue_capacity,
      NULL::TEXT as venue_type, -- Column doesn't exist
      NULL::TEXT as venue_phone, -- Column doesn't exist
      NULL::TEXT as venue_website, -- Column doesn't exist
      NULL::TEXT as venue_description, -- Column doesn't exist
      NULL::TEXT as artist_website, -- Column doesn't exist
      NULL::TEXT as artist_spotify_url, -- Column doesn't exist
      NULL::TEXT as artist_instagram_url, -- Column doesn't exist
      NULL::TEXT as artist_twitter_url, -- Column doesn't exist
      NULL::TEXT as artist_facebook_url, -- Column doesn't exist
      NULL::TEXT as artist_youtube_url, -- Column doesn't exist
      NULL::TEXT as artist_soundcloud_url, -- Column doesn't exist
      NULL::TEXT as artist_bandcamp_url, -- Column doesn't exist
      NULL::TEXT as artist_website_url, -- Column doesn't exist
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
        WHERE uje.user_id = p_user_id AND uje.jambase_event_id = e.id  -- Use id (UUID), not jambase_event_id (TEXT)
      ) as user_is_interested,
      (
        SELECT COUNT(*)::INT FROM user_jambase_events uje
        WHERE uje.jambase_event_id = e.id AND uje.user_id != p_user_id  -- Use id (UUID)
      ) as interested_count,
      (
        SELECT COUNT(*)::INT FROM user_jambase_events uje
        WHERE uje.jambase_event_id = e.id  -- Use id (UUID)
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
    se.venue_id::TEXT,  -- Explicit cast to TEXT to match function signature
    se.event_date,
    se.doors_time,
    se.description,
    se.genres,
    se.venue_address,
    se.venue_city,
    se.venue_state,
    se.venue_country,
    se.venue_postal_code, -- This is actually venue_zip in the source
    se.latitude,
    se.longitude,
    se.poster_image_url,
    se.ticket_url,
    se.ticket_provider,
    se.ticket_provider_url,
    se.ticket_price_min,
    se.ticket_price_max,
    se.ticket_price_currency,
    se.ticket_availability,
    se.ticket_sale_start,
    se.ticket_sale_end,
    se.age_restriction,
    se.venue_capacity,
    se.venue_type,
    se.venue_phone,
    se.venue_website,
    se.venue_description,
    se.artist_website,
    se.artist_spotify_url,
    se.artist_instagram_url,
    se.artist_twitter_url,
    se.artist_facebook_url,
    se.artist_youtube_url,
    se.artist_soundcloud_url,
    se.artist_bandcamp_url,
    se.artist_website_url,
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
GRANT EXECUTE ON FUNCTION get_personalized_events_feed(UUID, INT, INT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION calculate_event_relevance_score IS 'Calculate personalized relevance score for an event. Does not reference artist_profile table.';
COMMENT ON FUNCTION get_personalized_events_feed IS 'Returns personalized events feed sorted by relevance score. Does not reference artist_profile table.';

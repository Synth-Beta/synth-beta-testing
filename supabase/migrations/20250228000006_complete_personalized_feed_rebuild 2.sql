-- ============================================================
-- COMPLETE BOTTOM-UP REBUILD OF PERSONALIZED FEED FUNCTIONS
-- ============================================================
-- This migration rebuilds all personalized feed functions from scratch
-- using only actual database schema to fix critical errors:
-- 1. artist_preference_signals table doesn't exist → use music_preference_signals
-- 2. preference_type = 'listen_count' doesn't exist → use 'artist'
-- 3. Ambiguous column references in CTEs → explicit aliasing
-- 4. Type mismatches (venue_id TEXT vs UUID) → correct casting
-- 5. Non-existent columns referenced → map to actual columns or NULL

-- Drop all functions with CASCADE to handle dependencies
DROP FUNCTION IF EXISTS get_personalized_events_feed(UUID, INT, INT, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS calculate_event_relevance_score(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS get_user_genre_profile(UUID) CASCADE;

-- ============================================================
-- STEP 1: Recreate get_user_genre_profile
-- Fixed: Explicit column aliases to prevent ambiguous references
-- ============================================================
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
    -- From music_preference_signals (listening data)
    SELECT 
      mps.preference_value as genre_val,
      mps.preference_score as score_val,
      'listening' as source_val
    FROM music_preference_signals mps
    WHERE mps.user_id = p_user_id 
      AND mps.preference_type = 'genre'
      AND mps.preference_score > 0
    
    UNION ALL
    
    -- From interested events (presence-based: row exists = user is interested)
    SELECT 
      unnest(je.genres) as genre_val,
      3.0 as score_val,
      'liked_events' as source_val
    FROM jambase_events je
    JOIN user_jambase_events uje ON je.id = uje.jambase_event_id
    WHERE uje.user_id = p_user_id
      AND je.genres IS NOT NULL
      AND array_length(je.genres, 1) > 0
  ),
  genre_aggregated AS (
    SELECT 
      gs.genre_val,
      SUM(gs.score_val) as total_score,
      COUNT(DISTINCT gs.source_val) as source_count
    FROM genre_signals gs
    GROUP BY gs.genre_val
  ),
  genre_normalized AS (
    SELECT 
      ga.genre_val,
      ga.total_score,
      ga.source_count,
      ga.total_score / NULLIF(SUM(ga.total_score) OVER(), 0) as normalized_weight
    FROM genre_aggregated ga
  ),
  genre_with_source AS (
    SELECT DISTINCT ON (gn.genre_val)
      gn.genre_val,
      gn.normalized_weight,
      gn.source_count,
      gs.source_val
    FROM genre_normalized gn
    LEFT JOIN genre_signals gs ON gs.genre_val = gn.genre_val
    ORDER BY gn.genre_val, gn.source_count DESC
  )
  SELECT 
    gws.genre_val as genre,
    COALESCE(gws.normalized_weight, 0) as weight,
    CASE 
      WHEN gws.source_count > 1 THEN 'multiple'
      ELSE COALESCE(gws.source_val, 'unknown')
    END as source
  FROM genre_with_source gws
  WHERE gws.normalized_weight > 0
  ORDER BY gws.normalized_weight DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION get_user_genre_profile(UUID) TO authenticated;

COMMENT ON FUNCTION get_user_genre_profile IS 'Get user genre profile with normalized weights. Fixed to use explicit column aliases and music_preference_signals only.';

-- ============================================================
-- STEP 2: Recreate calculate_event_relevance_score
-- Fixed: Use music_preference_signals with preference_type = 'artist'
-- ============================================================
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
  v_artist_score NUMERIC;
  v_total_artist_score NUMERIC;
  v_artist_percentile NUMERIC;
  v_days_until_event NUMERIC;
  v_friends_interested_count NUMERIC;
  v_is_promoted BOOLEAN := false;
  v_promotion_tier TEXT;
  v_active_promotion_id UUID;
BEGIN
  -- Get event details with promotion data
  SELECT 
    e.id,
    e.title,
    e.artist_name,
    e.artist_id,
    e.venue_name,
    e.venue_id,
    e.genres,
    e.event_date,
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

  v_is_promoted := v_event.is_promoted;
  v_promotion_tier := v_event.promotion_tier;
  v_active_promotion_id := v_event.active_promotion_id;

  -- 1. GENRE AFFINITY SCORE (max 45 points) - CORE MATCH STRENGTH
  FOR v_user_genre_profile IN 
    SELECT genre, weight FROM get_user_genre_profile(p_user_id)
  LOOP
    -- Check if event genres match user's preferred genres
    IF v_event.genres && ARRAY[v_user_genre_profile.genre] THEN
      v_genre_weight := v_user_genre_profile.weight;
      v_genre_affinity_score := v_genre_affinity_score + (v_genre_weight * 45);
    END IF;
  END LOOP;

  -- 2. ARTIST FAMILIARITY SCORE (max 20 points)
  -- FIXED: Use music_preference_signals with preference_type = 'artist' (not 'listen_count')
  SELECT COALESCE(SUM(preference_score), 0)::NUMERIC INTO v_artist_score
  FROM music_preference_signals
  WHERE user_id = p_user_id 
    AND preference_type = 'artist'
    AND preference_value = v_event.artist_name;

  IF v_artist_score > 0 THEN
    SELECT COALESCE(SUM(preference_score), 0)::NUMERIC INTO v_total_artist_score
    FROM music_preference_signals
    WHERE user_id = p_user_id 
      AND preference_type = 'artist';
    
    IF v_total_artist_score > 0 THEN
      v_artist_percentile := v_artist_score / v_total_artist_score;
      v_artist_familiarity_score := LEAST(v_artist_percentile * 20, 20);
    END IF;
  END IF;

  -- 3. SONG BEHAVIOR SIGNAL (max 15 points)
  v_song_behavior_score := v_artist_familiarity_score * 0.75;

  -- 4. SOCIAL PROOF SCORE (max 5 points)
  -- Note: user_jambase_events.jambase_event_id is UUID (references jambase_events.id)
  SELECT COUNT(*)::NUMERIC INTO v_friends_interested_count
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

COMMENT ON FUNCTION calculate_event_relevance_score IS 'Calculate personalized relevance score for an event. Fixed to use music_preference_signals with preference_type = ''artist'' instead of non-existent artist_preference_signals table.';

-- ============================================================
-- STEP 3: Recreate get_personalized_events_feed
-- Fixed: Use only actual jambase_events columns, map missing ones to NULL
-- ============================================================
CREATE OR REPLACE FUNCTION get_personalized_events_feed(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_include_past BOOLEAN DEFAULT false,
  p_max_per_artist INT DEFAULT 3  -- Max 3 events per artist by default (configurable for diversity)
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
  price_range TEXT,  -- Standardized price display string (e.g., "$50 - $150")
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
  artist_frequency_rank INT,  -- Rank within artist's events (1 = first, 2 = second, etc.)
  diversity_penalty NUMERIC,  -- Penalty applied for exceeding max_per_artist (0 = no penalty, >0 = penalty)
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
      -- Extract first URL from ticket_urls array
      CASE WHEN e.ticket_urls IS NOT NULL AND array_length(e.ticket_urls, 1) > 0 
           THEN e.ticket_urls[1] ELSE NULL END as ticket_url,
      NULL::TEXT as ticket_provider, -- Column doesn't exist
      NULL::TEXT as ticket_provider_url, -- Column doesn't exist
      e.price_range, -- Standardized price display column
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
      -- User interest check (presence-based: row exists = interested)
      EXISTS(
        SELECT 1 FROM user_jambase_events uje 
        WHERE uje.user_id = p_user_id AND uje.jambase_event_id = e.id
      ) as user_is_interested,
      -- Count of all users interested in this event (excluding current user)
      (
        SELECT COUNT(*)::INT FROM user_jambase_events uje
        WHERE uje.jambase_event_id = e.id AND uje.user_id != p_user_id
      ) as interested_count,
      -- Count of friends interested in this event
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
  ),
  ranked_by_artist AS (
    -- Rank events within each artist by relevance score (for diversity control)
    SELECT 
      se.*,
      ROW_NUMBER() OVER (
        PARTITION BY se.artist_name 
        ORDER BY se.score DESC, se.event_date ASC
      )::INT as artist_frequency_rank
    FROM scored_events se
  ),
  diversity_filtered AS (
    -- Apply artist frequency limit and calculate penalties
    SELECT 
      rba.*,
      CASE 
        WHEN rba.artist_frequency_rank <= p_max_per_artist THEN 0.0  -- No penalty within limit
        WHEN rba.artist_frequency_rank = p_max_per_artist + 1 THEN 0.25  -- 25% penalty for first excess
        WHEN rba.artist_frequency_rank = p_max_per_artist + 2 THEN 0.40  -- 40% penalty for second excess
        ELSE 0.60  -- 60% penalty for any beyond that
      END as diversity_penalty
    FROM ranked_by_artist rba
    WHERE rba.artist_frequency_rank <= p_max_per_artist + 2  -- Allow 2 extra events but with penalty
  ),
  final_scoring AS (
    -- Apply diversity penalties to final relevance scores
    SELECT 
      df.*,
      df.score * (1 - df.diversity_penalty) as adjusted_relevance_score
    FROM diversity_filtered df
  )
  SELECT 
    fs.id,
    fs.jambase_event_id,
    fs.title,
    fs.artist_name,
    fs.artist_id,
    fs.venue_name,
    fs.venue_id::TEXT,  -- Explicit cast to TEXT to match function signature
    fs.event_date,
    fs.doors_time,
    fs.description,
    fs.genres,
    fs.venue_address,
    fs.venue_city,
    fs.venue_state,
    fs.venue_country,
    fs.venue_postal_code,
    fs.latitude,
    fs.longitude,
    fs.poster_image_url,
    fs.ticket_url,
    fs.ticket_provider,
    fs.ticket_provider_url,
    fs.price_range,  -- Standardized price display
    fs.ticket_price_min,
    fs.ticket_price_max,
    fs.ticket_price_currency,
    fs.ticket_availability,
    fs.ticket_sale_start,
    fs.ticket_sale_end,
    fs.age_restriction,
    fs.venue_capacity,
    fs.venue_type,
    fs.venue_phone,
    fs.venue_website,
    fs.venue_description,
    fs.artist_website,
    fs.artist_spotify_url,
    fs.artist_instagram_url,
    fs.artist_twitter_url,
    fs.artist_facebook_url,
    fs.artist_youtube_url,
    fs.artist_soundcloud_url,
    fs.artist_bandcamp_url,
    fs.artist_website_url,
    fs.tour_name,
    fs.created_at,
    fs.updated_at,
    fs.adjusted_relevance_score as relevance_score,
    fs.user_is_interested,
    fs.interested_count,
    fs.friends_interested_count,
    fs.is_promoted,
    fs.promotion_tier,
    fs.active_promotion_id,
    fs.artist_frequency_rank,
    fs.diversity_penalty,
    0.0 as genre_affinity_score, -- Placeholder - would be calculated separately
    0.0 as artist_familiarity_score, -- Placeholder - would be calculated separately
    0.0 as song_behavior_score, -- Placeholder - would be calculated separately
    0.0 as social_proof_score, -- Placeholder - would be calculated separately
    0.0 as recency_score, -- Placeholder - would be calculated separately
    0.0 as promotion_boost -- Placeholder - would be calculated separately
  FROM final_scoring fs
  ORDER BY fs.adjusted_relevance_score DESC, fs.event_date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_personalized_events_feed(UUID, INT, INT, BOOLEAN, INT) TO authenticated;

COMMENT ON FUNCTION get_personalized_events_feed IS 'Returns personalized events feed sorted by relevance score with artist diversity controls. Includes artist frequency limiting (max events per artist) to prevent single artist domination. Fixed to use only actual table columns, correct type casts, and music_preference_signals table.';

-- ============================================================
-- VERIFICATION QUERIES (commented out - can be run manually)
-- ============================================================
-- Verify all functions exist:
-- SELECT proname, proargtypes::regtype[] 
-- FROM pg_proc 
-- WHERE proname IN ('get_user_genre_profile', 'calculate_event_relevance_score', 'get_personalized_events_feed');
--
-- Test function (replace with actual user_id):
-- SELECT * FROM get_personalized_events_feed('00000000-0000-0000-0000-000000000000'::UUID, 10, 0, false, 3);


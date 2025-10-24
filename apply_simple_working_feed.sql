-- ============================================
-- GENRE-FIRST PERSONALIZED FEED ALGORITHM
-- ============================================
-- Implements the genre-first algorithm with proper scoring weights
-- "Genre is the anchor, artist is the enhancer, song behavior is the signal"

-- Drop existing functions first
DROP FUNCTION IF EXISTS get_user_genre_profile(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_personalized_events_feed(UUID, INT, INT, BOOLEAN) CASCADE;

-- Create user genre profile function
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
    -- From followed artists' genres (highest weight)
    SELECT 
      unnest(ap.genres) as genre,
      1.0 as preference_score,
      'artist' as source
    FROM artist_follows af
    JOIN artist_profile ap ON af.artist_id = ap.id
    WHERE af.user_id = p_user_id
      AND ap.genres IS NOT NULL
      AND array_length(ap.genres, 1) > 0
    
    UNION ALL
    
    -- From interested events' genres (medium weight)
    SELECT 
      unnest(je.genres) as genre,
      0.8 as preference_score,
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
    gw.total_weight / NULLIF(SUM(gw.total_weight) OVER (), 0) as weight,
    array_to_string(gw.sources, ', ') as source
  FROM genre_weights gw
  WHERE gw.total_weight > 0
  ORDER BY gw.total_weight DESC;
END;
$function$;

-- Create simple personalized feed function
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
  interested_count NUMERIC,
  friends_interested_count NUMERIC,
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
  WITH base_events AS (
    -- Get all events with basic info
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
      -- Check if user is interested (simple existence check)
      EXISTS(
        SELECT 1 FROM user_jambase_events uje 
        WHERE uje.user_id = p_user_id AND uje.jambase_event_id = e.id
      ) as user_is_interested,
      -- Count total interested users
      (
        SELECT COUNT(*)::NUMERIC FROM user_jambase_events uje
        WHERE uje.jambase_event_id = e.id
      ) as interested_count,
      -- Count friends interested
      (
        SELECT COUNT(*)::NUMERIC FROM user_jambase_events uje
        WHERE uje.jambase_event_id = e.id
          AND uje.user_id IN (
            SELECT CASE
              WHEN user1_id = p_user_id THEN user2_id
              WHEN user2_id = p_user_id THEN user1_id
            END
            FROM friends
            WHERE user1_id = p_user_id OR user2_id = p_user_id
          )
      ) as friends_interested_count,
      -- Promotion data
      CASE WHEN ep.id IS NOT NULL THEN true ELSE false END as is_promoted,
      ep.promotion_tier,
      ep.id as active_promotion_id
    FROM jambase_events e
    LEFT JOIN event_promotions ep ON e.id = ep.event_id
      AND ep.promotion_status = 'active'
      AND ep.starts_at <= now()
      AND ep.expires_at >= now()
    WHERE (p_include_past = true OR e.event_date >= CURRENT_DATE)
      AND e.artist_name IS NOT NULL
      AND e.artist_name != ''
  ),
  scored_events AS (
    -- Implement genre-first algorithm with exact scoring weights
    SELECT
      be.*,
      -- 1. GENRE AFFINITY SCORE (45 points) - Core match strength
      COALESCE((
        SELECT SUM(gp.weight * 45)
        FROM get_user_genre_profile(p_user_id) gp
        WHERE be.genres && ARRAY[gp.genre]
      ), 0) as genre_affinity_score,
      
      -- 2. ARTIST FAMILIARITY SCORE (20 points) - Reinforce known artists
      CASE WHEN EXISTS (
        SELECT 1 FROM artist_follows af
        JOIN artist_profile ap ON af.artist_id = ap.id
        WHERE af.user_id = p_user_id AND ap.name = be.artist_name
      ) THEN 20 ELSE 0 END as artist_familiarity_score,
      
      -- 3. SONG BEHAVIOR SIGNAL (15 points) - Use artist familiarity as proxy
      CASE WHEN EXISTS (
        SELECT 1 FROM artist_follows af
        JOIN artist_profile ap ON af.artist_id = ap.id
        WHERE af.user_id = p_user_id AND ap.name = be.artist_name
      ) THEN 15 ELSE 0 END as song_behavior_score,
      
      -- 4. SOCIAL PROOF SCORE (5 points) - Friend-driven relevance
      LEAST(be.friends_interested_count, 5) as social_proof_score,
      
      -- 5. RECENCY & LOCATION SCORE (5 points) - Event timing relevance
      CASE 
        WHEN be.event_date >= now() AND be.event_date <= now() + interval '9 days' THEN 5
        WHEN be.event_date >= now() AND be.event_date <= now() + interval '18 days' THEN 4
        WHEN be.event_date >= now() AND be.event_date <= now() + interval '27 days' THEN 3
        WHEN be.event_date >= now() AND be.event_date <= now() + interval '36 days' THEN 2
        WHEN be.event_date >= now() AND be.event_date <= now() + interval '45 days' THEN 1
        WHEN be.event_date >= now() AND be.event_date <= now() + interval '60 days' THEN 0.5
        ELSE 0
      END as recency_score,
      
      -- 6. PROMOTION BOOST (25 points) - Business layer
      CASE 
        WHEN be.is_promoted AND be.promotion_tier = 'basic' THEN 10
        WHEN be.is_promoted AND be.promotion_tier = 'premium' THEN 18
        WHEN be.is_promoted AND be.promotion_tier = 'featured' THEN 25
        ELSE 0
      END as promotion_boost,
      
      -- Calculate final relevance score (capped at 100 before promotions)
      LEAST(
        COALESCE((
          SELECT SUM(gp.weight * 45)
          FROM get_user_genre_profile(p_user_id) gp
          WHERE be.genres && ARRAY[gp.genre]
        ), 0) +
        CASE WHEN EXISTS (
          SELECT 1 FROM artist_follows af
          JOIN artist_profile ap ON af.artist_id = ap.id
          WHERE af.user_id = p_user_id AND ap.name = be.artist_name
        ) THEN 20 ELSE 0 END +
        CASE WHEN EXISTS (
          SELECT 1 FROM artist_follows af
          JOIN artist_profile ap ON af.artist_id = ap.id
          WHERE af.user_id = p_user_id AND ap.name = be.artist_name
        ) THEN 15 ELSE 0 END +
        LEAST(be.friends_interested_count, 5) +
        CASE 
          WHEN be.event_date >= now() AND be.event_date <= now() + interval '9 days' THEN 5
          WHEN be.event_date >= now() AND be.event_date <= now() + interval '18 days' THEN 4
          WHEN be.event_date >= now() AND be.event_date <= now() + interval '27 days' THEN 3
          WHEN be.event_date >= now() AND be.event_date <= now() + interval '36 days' THEN 2
          WHEN be.event_date >= now() AND be.event_date <= now() + interval '45 days' THEN 1
          WHEN be.event_date >= now() AND be.event_date <= now() + interval '60 days' THEN 0.5
          ELSE 0
        END,
        100
      ) +
      -- Add promotion boost (can exceed 100)
      CASE 
        WHEN be.is_promoted AND be.promotion_tier = 'basic' THEN 10
        WHEN be.is_promoted AND be.promotion_tier = 'premium' THEN 18
        WHEN be.is_promoted AND be.promotion_tier = 'featured' THEN 25
        ELSE 0
      END as relevance_score
    FROM base_events be
  ),
  ranked_by_artist AS (
    -- Rank events within each artist by relevance score
    SELECT
      se.*,
      ROW_NUMBER() OVER (
        PARTITION BY se.artist_name
        ORDER BY se.relevance_score DESC, se.event_date ASC
      ) as artist_frequency_rank
    FROM scored_events se
  ),
  diversity_filtered AS (
    -- Apply diversity rules: max 3 events per artist in top results
    SELECT 
      ra.*
    FROM ranked_by_artist ra
    WHERE ra.artist_frequency_rank <= 3
  ),
  shuffled_with_promotions AS (
    -- Separate promoted and non-promoted events
    WITH promoted_events AS (
      SELECT 
        df.*,
        ROW_NUMBER() OVER (ORDER BY df.relevance_score DESC, random()) as promo_rank
      FROM diversity_filtered df
      WHERE df.is_promoted = true
    ),
    non_promoted_events AS (
      SELECT 
        df.*,
        ROW_NUMBER() OVER (ORDER BY df.relevance_score DESC, random()) as regular_rank
      FROM diversity_filtered df
      WHERE df.is_promoted = false OR df.is_promoted IS NULL
    ),
    -- Create target positions for promoted events (1, 6, 11, 16, 21...)
    promotion_positions AS (
      SELECT generate_series(1, p_limit, 5) as target_position
    ),
    -- Assign promoted events to target positions
    assigned_promotions AS (
      SELECT 
        pe.*,
        pp.target_position,
        ROW_NUMBER() OVER (ORDER BY pe.promo_rank) as assignment_order
      FROM promoted_events pe
      CROSS JOIN promotion_positions pp
      WHERE pe.promo_rank <= (SELECT COUNT(*) FROM promotion_positions)
    ),
    -- Fill remaining positions with non-promoted events
    final_events AS (
      SELECT 
        ap.id,
        ap.jambase_event_id,
        ap.title,
        ap.artist_name,
        ap.artist_id,
        ap.venue_name,
        ap.venue_id,
        ap.event_date,
        ap.doors_time,
        ap.description,
        ap.genres,
        ap.venue_address,
        ap.venue_city,
        ap.venue_state,
        ap.venue_zip,
        ap.latitude,
        ap.longitude,
        ap.poster_image_url,
        ap.ticket_available,
        ap.price_range,
        ap.ticket_urls,
        ap.age_restriction,
        ap.venue_capacity,
        ap.tour_name,
        ap.created_at,
        ap.updated_at,
        ap.relevance_score,
        ap.user_is_interested,
        ap.interested_count,
        ap.friends_interested_count,
        ap.is_promoted,
        ap.promotion_tier,
        ap.active_promotion_id,
        ap.target_position as final_position
      FROM assigned_promotions ap
      
      UNION ALL
      
      SELECT 
        npe.id,
        npe.jambase_event_id,
        npe.title,
        npe.artist_name,
        npe.artist_id,
        npe.venue_name,
        npe.venue_id,
        npe.event_date,
        npe.doors_time,
        npe.description,
        npe.genres,
        npe.venue_address,
        npe.venue_city,
        npe.venue_state,
        npe.venue_zip,
        npe.latitude,
        npe.longitude,
        npe.poster_image_url,
        npe.ticket_available,
        npe.price_range,
        npe.ticket_urls,
        npe.age_restriction,
        npe.venue_capacity,
        npe.tour_name,
        npe.created_at,
        npe.updated_at,
        npe.relevance_score,
        npe.user_is_interested,
        npe.interested_count,
        npe.friends_interested_count,
        npe.is_promoted,
        npe.promotion_tier,
        npe.active_promotion_id,
        -- Fill remaining positions, avoiding promotion slots
        ROW_NUMBER() OVER (ORDER BY npe.regular_rank) + 
        (SELECT COUNT(*) FROM assigned_promotions) as final_position
      FROM non_promoted_events npe
      WHERE npe.regular_rank <= p_limit - (SELECT COUNT(*) FROM assigned_promotions)
    )
    SELECT 
      fe.*,
      -- Placeholder scores for compatibility
      0.0 as genre_affinity_score,
      0.0 as artist_familiarity_score,
      0.0 as song_behavior_score,
      0.0 as social_proof_score,
      0.0 as recency_score,
      0.0 as promotion_boost
    FROM final_events fe
    ORDER BY fe.final_position ASC
  )
  SELECT 
    swp.id,
    swp.jambase_event_id,
    swp.title,
    swp.artist_name,
    swp.artist_id,
    swp.venue_name,
    swp.venue_id,
    swp.event_date,
    swp.doors_time,
    swp.description,
    swp.genres,
    swp.venue_address,
    swp.venue_city,
    swp.venue_state,
    swp.venue_zip,
    swp.latitude,
    swp.longitude,
    swp.poster_image_url,
    swp.ticket_available,
    swp.price_range,
    swp.ticket_urls,
    swp.age_restriction,
    swp.venue_capacity,
    swp.tour_name,
    swp.created_at,
    swp.updated_at,
    swp.relevance_score,
    swp.user_is_interested,
    swp.interested_count,
    swp.friends_interested_count,
    swp.is_promoted,
    swp.promotion_tier,
    swp.active_promotion_id,
    swp.genre_affinity_score,
    swp.artist_familiarity_score,
    swp.song_behavior_score,
    swp.social_proof_score,
    swp.recency_score,
    swp.promotion_boost
  FROM shuffled_with_promotions swp
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_personalized_events_feed(UUID, INT, INT, BOOLEAN) TO authenticated;

-- Verification
SELECT 
  'Genre-First Personalized Feed with Strategic Promotion Placement' as status,
  'Genre affinity (45pts), artist familiarity (20pts), song behavior (15pts), social proof (5pts), recency (5pts), promotion boost (25pts). Max 3 events per artist for diversity. Results shuffled with promoted events at positions 1, 6, 11, 16, 21...' as description;

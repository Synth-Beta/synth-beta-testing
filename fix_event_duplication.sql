-- ============================================
-- FIX EVENT DUPLICATION IN FEED
-- ============================================
-- This fixes the issue where the same event appears multiple times

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

-- Create personalized feed function with FIXED duplication issue
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
  active_promotion_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH base_events AS (
    -- Get ALL events first, then add promotion data
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
      -- Check if user is interested
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
      -- PROMOTION DATA - Use the columns we added to jambase_events
      e.is_promoted,
      e.promotion_tier,
      e.active_promotion_id
    FROM jambase_events e
    WHERE (p_include_past = true OR e.event_date >= CURRENT_DATE)
      AND e.artist_name IS NOT NULL
      AND e.artist_name != ''
  ),
  scored_events AS (
    -- Implement genre-first algorithm with exact scoring weights
    SELECT
      be.*,
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
  -- SIMPLIFIED: Just shuffle all events and place promoted ones strategically
  final_events AS (
    SELECT 
      df.*,
      ROW_NUMBER() OVER (ORDER BY random()) as random_rank
    FROM diversity_filtered df
  ),
  -- Place promoted events at strategic positions (1, 6, 11, 16, 21...)
  strategic_placement AS (
    WITH promoted_events AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY relevance_score DESC) as promo_rank
      FROM final_events 
      WHERE is_promoted = true
    ),
    non_promoted_events AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY relevance_score DESC, random()) as regular_rank
      FROM final_events 
      WHERE is_promoted = false OR is_promoted IS NULL
    ),
    promotion_positions AS (
      SELECT generate_series(1, p_limit, 5) as target_position
    )
    -- Place promoted events at strategic positions
    SELECT 
      pe.*,
      pp.target_position as final_position
    FROM promoted_events pe
    CROSS JOIN promotion_positions pp
    WHERE pe.promo_rank = pp.target_position / 5 + 1
    
    UNION ALL
    
    -- Fill remaining positions with non-promoted events
    SELECT 
      npe.*,
      ROW_NUMBER() OVER (ORDER BY npe.regular_rank) + 
      (SELECT COUNT(*) FROM promotion_positions) as final_position
    FROM non_promoted_events npe
    WHERE npe.regular_rank <= p_limit - (SELECT COUNT(*) FROM promotion_positions)
  )
  SELECT 
    sp.id,
    sp.jambase_event_id,
    sp.title,
    sp.artist_name,
    sp.artist_id,
    sp.venue_name,
    sp.venue_id,
    sp.event_date,
    sp.doors_time,
    sp.description,
    sp.genres,
    sp.venue_address,
    sp.venue_city,
    sp.venue_state,
    sp.venue_zip,
    sp.latitude,
    sp.longitude,
    sp.poster_image_url,
    sp.ticket_available,
    sp.price_range,
    sp.ticket_urls,
    sp.age_restriction,
    sp.venue_capacity,
    sp.tour_name,
    sp.created_at,
    sp.updated_at,
    sp.relevance_score,
    sp.user_is_interested,
    sp.interested_count,
    sp.friends_interested_count,
    sp.is_promoted,
    sp.promotion_tier,
    sp.active_promotion_id
  FROM strategic_placement sp
  ORDER BY sp.final_position ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_personalized_events_feed(UUID, INT, INT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_genre_profile(UUID) TO authenticated;

-- Test the fixed feed
SELECT 
  'Fixed Feed Test - No Duplicates:' as status;

-- Show first 10 events with no duplicates
SELECT 
  ROW_NUMBER() OVER (ORDER BY relevance_score DESC) as position,
  title,
  artist_name,
  is_promoted,
  promotion_tier,
  relevance_score
FROM get_personalized_events_feed(
  (SELECT id FROM auth.users LIMIT 1)::UUID,
  10,
  0,
  false
)
ORDER BY relevance_score DESC;

-- ============================================
-- SIMPLE PROMOTION FIX - NO BREAKING CHANGES
-- ============================================
-- This fixes promotions without breaking existing functionality

-- Drop the problematic function and recreate it simply
DROP FUNCTION IF EXISTS get_personalized_events_feed(UUID, INT, INT, BOOLEAN) CASCADE;

-- Create a simple working personalized feed function
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
    -- Get all events with basic scoring
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
      -- Use promotion data from jambase_events columns
      e.is_promoted,
      e.promotion_tier,
      e.active_promotion_id
    FROM jambase_events e
    WHERE (p_include_past = true OR e.event_date >= CURRENT_DATE)
      AND e.artist_name IS NOT NULL
      AND e.artist_name != ''
  ),
  scored_events AS (
    -- Simple scoring: artist follows + interest + friends + recency + promotion
    SELECT
      be.*,
      -- Simple relevance score
      (
        -- Artist follows (50 points)
        CASE WHEN EXISTS (
          SELECT 1 FROM artist_follows af
          JOIN artist_profile ap ON af.artist_id = ap.id
          WHERE af.user_id = p_user_id AND ap.name = be.artist_name
        ) THEN 50 ELSE 0 END +
        -- User interest (30 points)
        CASE WHEN be.user_is_interested THEN 30 ELSE 0 END +
        -- Friends interest (10 points)
        LEAST(be.friends_interested_count, 10) +
        -- Recency (10 points)
        CASE 
          WHEN be.event_date >= now() AND be.event_date <= now() + interval '30 days' THEN 10
          WHEN be.event_date >= now() AND be.event_date <= now() + interval '60 days' THEN 5
          ELSE 0
        END +
        -- Promotion boost (can exceed 100)
        CASE 
          WHEN be.is_promoted AND be.promotion_tier = 'basic' THEN 15
          WHEN be.is_promoted AND be.promotion_tier = 'premium' THEN 25
          WHEN be.is_promoted AND be.promotion_tier = 'featured' THEN 35
          ELSE 0
        END
      ) as relevance_score
    FROM base_events be
  ),
  -- Simple diversity: max 3 events per artist
  diversity_filtered AS (
    SELECT 
      se.*,
      ROW_NUMBER() OVER (
        PARTITION BY se.artist_name
        ORDER BY se.relevance_score DESC, se.event_date ASC
      ) as artist_rank
    FROM scored_events se
  )
  SELECT 
    df.id,
    df.jambase_event_id,
    df.title,
    df.artist_name,
    df.artist_id,
    df.venue_name,
    df.venue_id,
    df.event_date,
    df.doors_time,
    df.description,
    df.genres,
    df.venue_address,
    df.venue_city,
    df.venue_state,
    df.venue_zip,
    df.latitude,
    df.longitude,
    df.poster_image_url,
    df.ticket_available,
    df.price_range,
    df.ticket_urls,
    df.age_restriction,
    df.venue_capacity,
    df.tour_name,
    df.created_at,
    df.updated_at,
    df.relevance_score,
    df.user_is_interested,
    df.interested_count,
    df.friends_interested_count,
    df.is_promoted,
    df.promotion_tier,
    df.active_promotion_id
  FROM diversity_filtered df
  WHERE df.artist_rank <= 3
  ORDER BY df.relevance_score DESC, random()
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_personalized_events_feed(UUID, INT, INT, BOOLEAN) TO authenticated;

-- Test the simple feed
SELECT 
  'Simple Feed Test:' as status,
  COUNT(*) as total_events,
  COUNT(CASE WHEN is_promoted = true THEN 1 END) as promoted_events
FROM get_personalized_events_feed(
  (SELECT id FROM auth.users LIMIT 1)::UUID,
  20,
  0,
  false
);

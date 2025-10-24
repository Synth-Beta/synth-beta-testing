-- ============================================
-- UPDATE DIVERSITY FEED WITH PROMOTION BOOST
-- ============================================
-- Updates the diversity feed function to include promotion boost

-- Update the get_personalized_events_feed_with_diversity function to include promotion fields
CREATE OR REPLACE FUNCTION get_personalized_events_feed_with_diversity(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_max_per_artist INT DEFAULT 2,
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
  artist_frequency_rank INT,
  diversity_penalty NUMERIC,
  is_promoted BOOLEAN,
  promotion_tier TEXT,
  active_promotion_id UUID
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
      -- Promotion data from event_promotions table
      CASE WHEN ep.id IS NOT NULL THEN true ELSE false END as is_promoted,
      ep.promotion_tier,
      ep.id as active_promotion_id,
      calculate_event_relevance_score(p_user_id, e.id) as base_relevance_score,
      EXISTS(
        SELECT 1 FROM user_jambase_events uje 
        WHERE uje.user_id = p_user_id AND uje.jambase_event_id = e.id
      ) as user_is_interested,
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
    LEFT JOIN event_promotions ep ON e.id = ep.event_id 
      AND ep.promotion_status = 'active'
      AND ep.starts_at <= now()
      AND ep.expires_at >= now()
    WHERE (p_include_past = true OR e.event_date >= CURRENT_DATE)
      AND e.artist_name IS NOT NULL
      AND e.artist_name != ''
  ),
  ranked_by_artist AS (
    -- Rank events within each artist by relevance score
    SELECT 
      se.*,
      ROW_NUMBER() OVER (
        PARTITION BY se.artist_name 
        ORDER BY se.base_relevance_score DESC, se.event_date ASC
      ) as artist_frequency_rank
    FROM scored_events se
  ),
  diversity_filtered AS (
    -- Apply artist frequency limit and calculate penalties
    SELECT 
      rba.*,
      CASE 
        WHEN rba.artist_frequency_rank <= p_max_per_artist THEN 0.0  -- No penalty
        WHEN rba.artist_frequency_rank = p_max_per_artist + 1 THEN 0.3  -- 30% penalty for first excess
        WHEN rba.artist_frequency_rank = p_max_per_artist + 2 THEN 0.5  -- 50% penalty for second excess
        ELSE 0.7  -- 70% penalty for any beyond that
      END as diversity_penalty
    FROM ranked_by_artist rba
    WHERE rba.artist_frequency_rank <= p_max_per_artist + 2  -- Allow 2 extra events but heavily penalized
  ),
  final_scoring AS (
    -- Apply diversity penalties to final scores
    SELECT 
      df.*,
      df.base_relevance_score * (1 - df.diversity_penalty) as adjusted_relevance_score
    FROM diversity_filtered df
  )
  SELECT 
    fs.id as event_id,
    fs.jambase_event_id,
    fs.title,
    fs.artist_name,
    fs.artist_id,
    fs.venue_name,
    fs.venue_id,
    fs.event_date,
    fs.doors_time,
    fs.description,
    fs.genres,
    fs.venue_address,
    fs.venue_city,
    fs.venue_state,
    fs.venue_zip,
    fs.latitude,
    fs.longitude,
    fs.ticket_available,
    fs.price_range,
    fs.ticket_urls,
    fs.setlist,
    fs.setlist_enriched,
    fs.setlist_song_count,
    fs.setlist_fm_id,
    fs.setlist_fm_url,
    fs.setlist_source,
    fs.setlist_last_updated,
    fs.tour_name,
    fs.created_at,
    fs.updated_at,
    fs.adjusted_relevance_score as relevance_score,
    fs.user_is_interested,
    fs.interested_count,
    fs.friends_interested_count,
    fs.artist_frequency_rank,
    fs.diversity_penalty,
    fs.is_promoted,
    fs.promotion_tier,
    fs.active_promotion_id
  FROM final_scoring fs
  ORDER BY fs.adjusted_relevance_score DESC, fs.event_date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_personalized_events_feed_with_diversity(UUID, INT, INT, INT, BOOLEAN) TO authenticated;

-- Verification
SELECT 
  'Diversity Feed Updated with Promotions' as status,
  'Promotion fields now included in diversity feed function' as description;

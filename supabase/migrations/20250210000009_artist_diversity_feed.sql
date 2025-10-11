-- ============================================================
-- MIGRATION 9: Artist Diversity Feed - Prevent Single Artist Domination
-- Implements frequency limiting and diversity controls for event feed
-- ============================================================

-- Drop existing functions if they exist (with all possible signatures)
DROP FUNCTION IF EXISTS get_personalized_events_feed_with_diversity(UUID, INT, INT, INT, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS get_personalized_events_feed_with_diversity CASCADE;
DROP FUNCTION IF EXISTS get_fully_diversified_feed CASCADE;
DROP FUNCTION IF EXISTS get_genre_diversified_feed CASCADE;
DROP FUNCTION IF EXISTS get_venue_diversified_feed CASCADE;

-- ============================================================
-- Function: Personalized Feed with Artist Diversity Controls
-- ============================================================
CREATE OR REPLACE FUNCTION get_personalized_events_feed_with_diversity(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_max_per_artist INT DEFAULT 2,  -- Max 2 events per artist by default
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
  interested_count BIGINT,
  friends_interested_count BIGINT,
  artist_frequency_rank BIGINT,
  diversity_penalty NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH scored_events AS (
    -- Get all events with relevance scores
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
      calculate_event_relevance_score(p_user_id, e.id) as base_relevance_score,
      -- Add user interest data
      EXISTS(
        SELECT 1 FROM user_jambase_events uje 
        WHERE uje.jambase_event_id = e.id AND uje.user_id = p_user_id
      ) as user_is_interested,
      -- Interested count
      (SELECT COUNT(*) FROM user_jambase_events uje WHERE uje.jambase_event_id = e.id) as interested_count,
      -- Friends interested count
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
      ) as friends_interested_count
    FROM jambase_events e
    WHERE (p_include_past OR e.event_date > NOW())
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
    fs.diversity_penalty
  FROM final_scoring fs
  ORDER BY fs.adjusted_relevance_score DESC, fs.event_date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- ============================================================
-- Function: Genre Diversity Enforcement
-- ============================================================
CREATE OR REPLACE FUNCTION get_genre_diversified_feed(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_max_per_genre INT DEFAULT 6,  -- Max 6 events per genre
  p_genre_variety_bonus NUMERIC DEFAULT 0.1  -- 10% bonus for genre variety
)
RETURNS TABLE(
  event_id UUID,
  relevance_score NUMERIC,
  genre_diversity_bonus NUMERIC,
  genre_rank INT
) AS $$
BEGIN
  RETURN QUERY
  WITH events_with_genres AS (
    SELECT 
      e.id,
      e.artist_name,
      e.genres,
      calculate_event_relevance_score(p_user_id, e.id) as base_score
    FROM jambase_events e
    WHERE e.event_date > NOW()
      AND e.genres IS NOT NULL
      AND array_length(e.genres, 1) > 0
  ),
  genre_expanded AS (
    -- Expand each event to have one row per genre
    SELECT 
      id,
      artist_name,
      unnest(genres) as genre,
      base_score
    FROM events_with_genres
  ),
  genre_ranked AS (
    -- Rank events within each genre
    SELECT 
      *,
      ROW_NUMBER() OVER (
        PARTITION BY genre 
        ORDER BY base_score DESC
      ) as genre_rank
    FROM genre_expanded
  ),
  genre_filtered AS (
    -- Apply genre frequency limits
    SELECT *
    FROM genre_ranked
    WHERE genre_rank <= p_max_per_genre
  ),
  events_with_genre_counts AS (
    -- Count how many different genres each event spans
    SELECT 
      id,
      artist_name,
      base_score,
      COUNT(DISTINCT genre) as genre_count,
      MAX(genre_rank) as max_genre_rank,
      -- Calculate genre diversity bonus
      CASE 
        WHEN COUNT(DISTINCT genre) = 1 THEN 0
        WHEN COUNT(DISTINCT genre) = 2 THEN p_genre_variety_bonus * 0.5
        WHEN COUNT(DISTINCT genre) >= 3 THEN p_genre_variety_bonus
        ELSE 0
      END as diversity_bonus
    FROM genre_filtered
    GROUP BY id, artist_name, base_score
  )
  SELECT 
    id as event_id,
    base_score + diversity_bonus as relevance_score,
    diversity_bonus as genre_diversity_bonus,
    max_genre_rank as genre_rank
  FROM events_with_genre_counts
  ORDER BY relevance_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Function: Venue Type Diversity Enforcement
-- ============================================================
CREATE OR REPLACE FUNCTION get_venue_diversified_feed(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_max_per_venue_type INT DEFAULT 4  -- Max 4 events per venue type
)
RETURNS TABLE(
  event_id UUID,
  relevance_score NUMERIC,
  venue_type TEXT,
  venue_type_rank INT
) AS $$
BEGIN
  RETURN QUERY
  WITH events_with_venue_types AS (
    SELECT 
      e.id,
      e.venue_name,
      e.artist_name,
      -- Categorize venue types
      CASE 
        WHEN e.venue_name ILIKE '%stadium%' OR e.venue_name ILIKE '%arena%' THEN 'stadium'
        WHEN e.venue_name ILIKE '%theater%' OR e.venue_name ILIKE '%hall%' THEN 'theater'
        WHEN e.venue_name ILIKE '%club%' OR e.venue_name ILIKE '%bar%' THEN 'club'
        WHEN e.venue_name ILIKE '%festival%' OR e.venue_name ILIKE '%fair%' THEN 'festival'
        WHEN e.venue_name ILIKE '%park%' OR e.venue_name ILIKE '%outdoor%' THEN 'outdoor'
        ELSE 'other'
      END as venue_type,
      calculate_event_relevance_score(p_user_id, e.id) as base_score
    FROM jambase_events e
    WHERE e.event_date > NOW()
      AND e.venue_name IS NOT NULL
  ),
  venue_type_ranked AS (
    SELECT 
      *,
      ROW_NUMBER() OVER (
        PARTITION BY venue_type 
        ORDER BY base_score DESC
      ) as venue_type_rank
    FROM events_with_venue_types
  ),
  venue_type_filtered AS (
    SELECT *
    FROM venue_type_ranked
    WHERE venue_type_rank <= p_max_per_venue_type
  )
  SELECT 
    id as event_id,
    base_score as relevance_score,
    venue_type,
    venue_type_rank
  FROM venue_type_filtered
  ORDER BY base_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Function: Complete Diversity-Aware Feed (Master Function)
-- ============================================================
CREATE OR REPLACE FUNCTION get_fully_diversified_feed(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_max_per_artist INT DEFAULT 2,     -- Max 2 events per artist
  p_max_per_genre INT DEFAULT 6,      -- Max 6 events per genre  
  p_max_per_venue_type INT DEFAULT 4, -- Max 4 events per venue type
  p_diversity_weight NUMERIC DEFAULT 0.15  -- 15% weight for diversity
)
RETURNS TABLE(
  event_id UUID,
  final_relevance_score NUMERIC,
  diversity_penalties JSONB,
  recommendation_explanation TEXT,
  artist_frequency_rank INT,
  genre_diversity_bonus NUMERIC,
  venue_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH base_scored AS (
    -- Get base relevance scores
    SELECT 
      e.id,
      e.artist_name,
      e.genres,
      e.venue_name,
      calculate_event_relevance_score(p_user_id, e.id) as base_score
    FROM jambase_events e
    WHERE e.event_date > NOW()
      AND e.artist_name IS NOT NULL
      AND e.artist_name != ''
  ),
  artist_diversity AS (
    -- Apply artist frequency limits
    SELECT 
      *,
      ROW_NUMBER() OVER (
        PARTITION BY artist_name 
        ORDER BY base_score DESC
      ) as artist_rank,
      CASE 
        WHEN ROW_NUMBER() OVER (
          PARTITION BY artist_name 
          ORDER BY base_score DESC
        ) > p_max_per_artist THEN 0.4  -- 40% penalty for excess
        ELSE 0
      END as artist_penalty
    FROM base_scored
  ),
  genre_diversity AS (
    -- Apply genre frequency limits
    SELECT 
      ad.*,
      CASE 
        WHEN ad.genres IS NOT NULL THEN
          CASE 
            WHEN COUNT(*) OVER (
              PARTITION BY unnest(ad.genres)
            ) > p_max_per_genre THEN 0.25  -- 25% penalty for genre excess
            ELSE 0
          END
        ELSE 0
      END as genre_penalty,
      -- Calculate genre diversity bonus
      CASE 
        WHEN ad.genres IS NOT NULL AND array_length(ad.genres, 1) > 1 THEN
          p_diversity_weight * (array_length(ad.genres, 1) - 1) / array_length(ad.genres, 1)
        ELSE 0
      END as genre_diversity_bonus
    FROM artist_diversity ad
  ),
  venue_diversity AS (
    -- Apply venue type frequency limits
    SELECT 
      gd.*,
      CASE 
        WHEN gd.venue_name ILIKE '%stadium%' OR gd.venue_name ILIKE '%arena%' THEN 'stadium'
        WHEN gd.venue_name ILIKE '%theater%' OR gd.venue_name ILIKE '%hall%' THEN 'theater'
        WHEN gd.venue_name ILIKE '%club%' OR gd.venue_name ILIKE '%bar%' THEN 'club'
        WHEN gd.venue_name ILIKE '%festival%' OR gd.venue_name ILIKE '%fair%' THEN 'festival'
        WHEN gd.venue_name ILIKE '%park%' OR gd.venue_name ILIKE '%outdoor%' THEN 'outdoor'
        ELSE 'other'
      END as venue_type,
      CASE 
        WHEN COUNT(*) OVER (
          PARTITION BY CASE 
            WHEN gd.venue_name ILIKE '%stadium%' OR gd.venue_name ILIKE '%arena%' THEN 'stadium'
            WHEN gd.venue_name ILIKE '%theater%' OR gd.venue_name ILIKE '%hall%' THEN 'theater'
            WHEN gd.venue_name ILIKE '%club%' OR gd.venue_name ILIKE '%bar%' THEN 'club'
            WHEN gd.venue_name ILIKE '%festival%' OR gd.venue_name ILIKE '%fair%' THEN 'festival'
            WHEN gd.venue_name ILIKE '%park%' OR gd.venue_name ILIKE '%outdoor%' THEN 'outdoor'
            ELSE 'other'
          END
        ) > p_max_per_venue_type THEN 0.2  -- 20% penalty for venue excess
        ELSE 0
      END as venue_penalty
    FROM genre_diversity gd
  ),
  final_scoring AS (
    SELECT 
      vd.id,
      vd.artist_name,
      vd.base_score,
      vd.artist_rank,
      vd.artist_penalty,
      vd.genre_penalty,
      vd.venue_penalty,
      vd.genre_diversity_bonus,
      vd.venue_type,
      -- Calculate final score with all penalties and bonuses
      (vd.base_score * (1 - GREATEST(vd.artist_penalty, vd.genre_penalty, vd.venue_penalty))) + vd.genre_diversity_bonus as final_score,
      jsonb_build_object(
        'artist_penalty', vd.artist_penalty,
        'genre_penalty', vd.genre_penalty,
        'venue_penalty', vd.venue_penalty,
        'genre_diversity_bonus', vd.genre_diversity_bonus
      ) as diversity_penalties
    FROM venue_diversity vd
  )
  SELECT 
    fs.id as event_id,
    fs.final_score as final_relevance_score,
    fs.diversity_penalties,
    CASE 
      WHEN fs.artist_penalty > 0 THEN 'Limited to show variety'
      WHEN fs.genre_penalty > 0 THEN 'Genre diversity maintained'
      WHEN fs.venue_penalty > 0 THEN 'Venue variety ensured'
      WHEN fs.final_score > 40 THEN 'Perfect match for you'
      WHEN fs.final_score > 20 THEN 'Great recommendation'
      ELSE 'Recommended for discovery'
    END as recommendation_explanation,
    fs.artist_rank as artist_frequency_rank,
    fs.genre_diversity_bonus,
    fs.venue_type
  FROM final_scoring fs
  WHERE fs.final_score > 0  -- Filter out heavily penalized events
  ORDER BY fs.final_score DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Add helpful comments
-- ============================================================
COMMENT ON FUNCTION get_personalized_events_feed_with_diversity IS 'Personalized feed with artist frequency limiting to prevent single artist domination';
COMMENT ON FUNCTION get_genre_diversified_feed IS 'Enforces genre diversity in event recommendations';
COMMENT ON FUNCTION get_venue_diversified_feed IS 'Ensures venue type variety in recommendations';
COMMENT ON FUNCTION get_fully_diversified_feed IS 'Master function combining artist, genre, and venue diversity controls';

-- ============================================================
-- Create indexes for better performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_jambase_events_artist_name ON jambase_events(artist_name) WHERE artist_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jambase_events_genres ON jambase_events USING GIN(genres) WHERE genres IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jambase_events_venue_name ON jambase_events(venue_name) WHERE venue_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jambase_events_event_date ON jambase_events(event_date);

-- ============================================================
-- Test the new functions (optional - remove in production)
-- ============================================================
-- Example usage:
-- SELECT * FROM get_fully_diversified_feed('your-user-id-here', 20, 0, 2, 6, 4, 0.15);
-- SELECT * FROM get_personalized_events_feed_with_diversity('your-user-id-here', 20, 0, 2);

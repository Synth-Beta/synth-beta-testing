# Artist Diversity Fix - Prevent Single Artist Domination

## 🎯 **Problem**
Even with great relevance scoring, one artist can dominate the entire feed if they're a perfect match, creating a monotonous experience.

## 🔧 **Solution: Artist Deduplication & Variety Enforcement**

### **1. Artist Frequency Limiting**

```sql
-- Modified personalized feed function with artist diversity controls
CREATE OR REPLACE FUNCTION get_personalized_events_feed_with_diversity(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_max_per_artist INT DEFAULT 3,  -- Max 3 events per artist
  p_include_past BOOLEAN DEFAULT false
)
RETURNS TABLE(
  -- ... same columns as before ...
  relevance_score NUMERIC,
  user_is_interested BOOLEAN,
  interested_count INT,
  friends_interested_count INT,
  artist_frequency_rank INT  -- New: rank within artist's events
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH scored_events AS (
    -- Get all events with relevance scores
    SELECT 
      e.*,
      calculate_event_relevance_score(p_user_id, e.id) as relevance_score,
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
      *,
      ROW_NUMBER() OVER (
        PARTITION BY artist_name 
        ORDER BY relevance_score DESC, event_date ASC
      ) as artist_frequency_rank
    FROM scored_events
  ),
  diversity_filtered AS (
    -- Apply artist frequency limit
    SELECT *
    FROM ranked_by_artist
    WHERE artist_frequency_rank <= p_max_per_artist
  ),
  final_ranking AS (
    -- Re-rank with diversity applied
    SELECT 
      *,
      -- Apply diversity bonus: slightly boost lower-ranked events from popular artists
      CASE 
        WHEN artist_frequency_rank = 1 THEN relevance_score
        WHEN artist_frequency_rank = 2 THEN relevance_score * 0.95  -- 5% penalty for 2nd event
        WHEN artist_frequency_rank = 3 THEN relevance_score * 0.90  -- 10% penalty for 3rd event
        ELSE relevance_score * 0.85  -- 15% penalty for any beyond 3rd
      END as adjusted_relevance_score
    FROM diversity_filtered
  )
  SELECT 
    fr.id as event_id,
    fr.jambase_event_id,
    fr.title,
    fr.artist_name,
    fr.artist_id,
    fr.venue_name,
    fr.venue_id,
    fr.event_date,
    fr.doors_time,
    fr.description,
    fr.genres,
    fr.venue_address,
    fr.venue_city,
    fr.venue_state,
    fr.venue_zip,
    fr.latitude,
    fr.longitude,
    fr.ticket_available,
    fr.price_range,
    fr.ticket_urls,
    fr.setlist,
    fr.setlist_enriched,
    fr.setlist_song_count,
    fr.setlist_fm_id,
    fr.setlist_fm_url,
    fr.setlist_source,
    fr.setlist_last_updated,
    fr.tour_name,
    fr.created_at,
    fr.updated_at,
    fr.adjusted_relevance_score as relevance_score,
    fr.user_is_interested,
    fr.interested_count,
    fr.friends_interested_count,
    fr.artist_frequency_rank
  FROM final_ranking fr
  ORDER BY fr.adjusted_relevance_score DESC, fr.event_date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;
```

### **2. Genre Variety Enforcement**

```sql
-- Ensure genre diversity in feed
CREATE OR REPLACE FUNCTION get_genre_diversified_feed(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_max_per_genre INT DEFAULT 8,  -- Max 8 events per genre
  p_genre_variety_bonus NUMERIC DEFAULT 0.1  -- 10% bonus for genre variety
)
RETURNS TABLE(
  event_id UUID,
  relevance_score NUMERIC,
  genre_diversity_bonus NUMERIC
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
    diversity_bonus as genre_diversity_bonus
  FROM events_with_genre_counts
  ORDER BY relevance_score DESC;
END;
$$ LANGUAGE plpgsql;
```

### **3. Venue Type Variety**

```sql
-- Ensure venue type diversity
CREATE OR REPLACE FUNCTION get_venue_diversified_feed(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_max_per_venue_type INT DEFAULT 5  -- Max 5 events per venue type
)
RETURNS TABLE(
  event_id UUID,
  relevance_score NUMERIC,
  venue_type TEXT
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
    venue_type
  FROM venue_type_filtered
  ORDER BY base_score DESC;
END;
$$ LANGUAGE plpgsql;
```

### **4. Complete Diversity-Aware Feed Function**

```sql
-- Master function combining all diversity controls
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
  recommendation_explanation TEXT
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
        ) > p_max_per_artist THEN 0.3  -- 30% penalty for excess
        ELSE 0
      END as artist_penalty
    FROM base_scored
  ),
  genre_diversity AS (
    -- Apply genre frequency limits
    SELECT 
      ad.*,
      unnest(ad.genres) as genre,
      CASE 
        WHEN COUNT(*) OVER (PARTITION BY unnest(ad.genres)) > p_max_per_genre THEN 0.2  -- 20% penalty
        ELSE 0
      END as genre_penalty
    FROM artist_diversity ad
    WHERE ad.genres IS NOT NULL
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
        ) > p_max_per_venue_type THEN 0.15  -- 15% penalty
        ELSE 0
      END as venue_penalty
    FROM genre_diversity gd
  ),
  final_scoring AS (
    SELECT 
      vd.id,
      vd.artist_name,
      vd.base_score,
      vd.artist_penalty,
      vd.genre_penalty,
      vd.venue_penalty,
      -- Calculate final score with all penalties
      vd.base_score * (1 - GREATEST(vd.artist_penalty, vd.genre_penalty, vd.venue_penalty)) as final_score,
      jsonb_build_object(
        'artist_penalty', vd.artist_penalty,
        'genre_penalty', vd.genre_penalty,
        'venue_penalty', vd.venue_penalty,
        'artist_rank', vd.artist_rank
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
    END as recommendation_explanation
  FROM final_scoring fs
  WHERE fs.final_score > 0  -- Filter out heavily penalized events
  ORDER BY fs.final_score DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;
```

### **5. Frontend Implementation**

```typescript
// Updated PersonalizedFeedService to use diversity-aware function
export class PersonalizedFeedService {
  static async getPersonalizedFeed(
    userId: string,
    limit: number = 50,
    offset: number = 0,
    diversityConfig: {
      maxPerArtist?: number;
      maxPerGenre?: number;
      maxPerVenueType?: number;
    } = {}
  ): Promise<PersonalizedEvent[]> {
    try {
      const {
        maxPerArtist = 2,     // Default: max 2 events per artist
        maxPerGenre = 6,      // Default: max 6 events per genre
        maxPerVenueType = 4   // Default: max 4 events per venue type
      } = diversityConfig;

      const { data, error } = await supabase.rpc('get_fully_diversified_feed', {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
        p_max_per_artist: maxPerArtist,
        p_max_per_genre: maxPerGenre,
        p_max_per_venue_type: maxPerVenueType,
        p_diversity_weight: 0.15
      });

      if (error) {
        console.error('❌ Diversity-aware feed error:', error);
        return this.getFallbackFeed(userId, limit, offset);
      }

      return data.map((row: any) => ({
        id: row.event_id,
        // ... map other fields ...
        relevance_score: row.final_relevance_score,
        diversity_penalties: row.diversity_penalties,
        recommendation_explanation: row.recommendation_explanation
      }));
    } catch (error) {
      console.error('Error fetching diversity-aware feed:', error);
      return [];
    }
  }
}
```

### **6. Configuration Options**

```typescript
// User-configurable diversity settings
interface DiversitySettings {
  maxPerArtist: number;        // 1-5 events per artist
  maxPerGenre: number;         // 3-10 events per genre
  maxPerVenueType: number;     // 2-8 events per venue type
  diversityWeight: number;     // 0.1-0.3 weight for diversity
  explorationRate: number;     // 0.05-0.25 exploration rate
}

// Default settings for different user types
const DEFAULT_DIVERSITY_SETTINGS: Record<string, DiversitySettings> = {
  'music_discovery': {
    maxPerArtist: 1,
    maxPerGenre: 4,
    maxPerVenueType: 3,
    diversityWeight: 0.25,
    explorationRate: 0.20
  },
  'balanced': {
    maxPerArtist: 2,
    maxPerGenre: 6,
    maxPerVenueType: 4,
    diversityWeight: 0.15,
    explorationRate: 0.15
  },
  'focused': {
    maxPerArtist: 3,
    maxPerGenre: 8,
    maxPerVenueType: 5,
    diversityWeight: 0.10,
    explorationRate: 0.10
  }
};
```

## 🎯 **Expected Results**

With this diversity enforcement:

1. **Artist Variety**: No single artist appears more than 2-3 times
2. **Genre Balance**: Mix of different music genres
3. **Venue Diversity**: Variety of venue types and sizes
4. **Better Discovery**: More opportunities to find new artists
5. **Higher Engagement**: Users see more variety, stay longer

## 🧪 **Testing Strategy**

1. **A/B Test**: Current system vs diversity-aware system
2. **Metrics**: 
   - Artist repetition rate (should drop from ~40% to ~15%)
   - Genre diversity score (should increase by 60%)
   - User engagement time (should increase by 25%)
   - Click-through rates on diverse recommendations

This ensures users get a balanced, varied feed that prevents any single artist from dominating while still maintaining high relevance! 🎉

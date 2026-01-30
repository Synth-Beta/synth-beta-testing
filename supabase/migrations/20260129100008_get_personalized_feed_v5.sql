-- ============================================================
-- get_personalized_feed_v5: Fetch 100 events (50 recommended, 25 following, 25 trending)
-- with weighted genre sampling and fallback to recommended
-- Distribution per 20: 10 recommended, 5 following, 5 trending (RANDOMIZED)
-- All event types filtered by location when location is provided
-- ============================================================

DROP FUNCTION IF EXISTS public.get_personalized_feed_v5(UUID, TEXT, INT, INT, NUMERIC, NUMERIC, NUMERIC);
DROP FUNCTION IF EXISTS public.get_personalized_feed_v5(UUID, TEXT, INT, INT, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, INT);

CREATE OR REPLACE FUNCTION public.get_personalized_feed_v5(
  p_user_id          UUID,
  p_section          TEXT DEFAULT NULL,
  p_limit            INT DEFAULT 100,
  p_offset           INT DEFAULT 0,
  p_city_lat         NUMERIC DEFAULT NULL,
  p_city_lng         NUMERIC DEFAULT NULL,
  p_radius_miles     NUMERIC DEFAULT 50,
  p_include_past     BOOLEAN DEFAULT FALSE,
  p_city_filter      TEXT DEFAULT NULL,
  p_state_filter     TEXT DEFAULT NULL,
  p_max_days_ahead   INT DEFAULT 90
)
RETURNS TABLE (
  section TEXT,
  id UUID,
  score NUMERIC,
  payload JSONB,
  context JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '45s'
AS $function$
DECLARE
  has_location BOOLEAN := p_city_lat IS NOT NULL AND p_city_lng IS NOT NULL;
  min_ts TIMESTAMPTZ := CASE WHEN p_include_past THEN NOW() - INTERVAL '30 days' ELSE NOW() END;
  max_ts TIMESTAMPTZ := NOW() + (COALESCE(NULLIF(p_max_days_ahead, 0), 90) * INTERVAL '1 day');
  v_genre_scores JSONB;
  v_min_lat NUMERIC;
  v_max_lat NUMERIC;
  v_min_lng NUMERIC;
  v_max_lng NUMERIC;
BEGIN
  -- 50 mile bounding box (only calculated if location provided)
  IF has_location THEN
    v_min_lat := p_city_lat - (50.0 / 69.0);
    v_max_lat := p_city_lat + (50.0 / 69.0);
    v_min_lng := p_city_lng - (50.0 / (69.0 * COS(RADIANS(p_city_lat))));
    v_max_lng := p_city_lng + (50.0 / (69.0 * COS(RADIANS(p_city_lat))));
  END IF;

  -- Get user's genre preference scores
  SELECT COALESCE(genre_preference_scores, '{}') INTO v_genre_scores
  FROM user_preferences WHERE user_id = p_user_id;
  v_genre_scores := COALESCE(v_genre_scores, '{}');

  RETURN QUERY
  WITH 
  -- 25 FOLLOWING events (no location filter - show what user follows anywhere)
  following AS (
    SELECT 'following'::TEXT AS sec, e.id AS eid, e.*, a.name AS aname, v.name AS vname,
           0::NUMERIC AS genre_weight
    FROM events e
    LEFT JOIN artists a ON a.id = e.artist_id
    LEFT JOIN venues v ON v.id = e.venue_id
    WHERE e.event_date BETWEEN min_ts AND max_ts
      AND (
        EXISTS (SELECT 1 FROM artist_follows af WHERE af.user_id = p_user_id AND af.artist_id = e.artist_id)
        OR EXISTS (SELECT 1 FROM user_venue_relationships uvr WHERE uvr.user_id = p_user_id AND uvr.venue_id = e.venue_id)
        OR EXISTS (SELECT 1 FROM user_event_relationships uer WHERE uer.user_id = p_user_id AND uer.event_id = e.id AND uer.relationship_type IN ('going','maybe'))
      )
    ORDER BY RANDOM()
    LIMIT 25
  ),
  
  following_count AS (
    SELECT COUNT(*)::INT AS cnt FROM following
  ),
  
  -- Calculate genre weights for recommended events
  -- REQUIRED location filter: events MUST be within 50mi bounding box
  event_weights AS (
    SELECT 
      e.id AS eid,
      COALESCE(SUM(
        COALESCE((v_genre_scores->>g.genre)::NUMERIC, 0) +
        COALESCE((v_genre_scores->>LOWER(g.genre))::NUMERIC, 0) +
        COALESCE((v_genre_scores->>REPLACE(g.genre, ' ', ''))::NUMERIC, 0)
      ), 0.1) AS total_weight
    FROM events e
    CROSS JOIN LATERAL unnest(e.genres) AS g(genre)
    WHERE e.event_date BETWEEN min_ts AND max_ts
      AND e.id NOT IN (SELECT eid FROM following)
      -- REQUIRED: event must be within user's location radius
      AND e.latitude IS NOT NULL 
      AND e.longitude IS NOT NULL
      AND e.latitude BETWEEN v_min_lat AND v_max_lat 
      AND e.longitude BETWEEN v_min_lng AND v_max_lng
    GROUP BY e.id
    HAVING SUM(
      COALESCE((v_genre_scores->>g.genre)::NUMERIC, 0) +
      COALESCE((v_genre_scores->>LOWER(g.genre))::NUMERIC, 0) +
      COALESCE((v_genre_scores->>REPLACE(g.genre, ' ', ''))::NUMERIC, 0)
    ) > 0
  ),
  
  -- 50 RECOMMENDED + extra to fill missing following (weighted by genre scores)
  recommended AS (
    SELECT 'recommending'::TEXT AS sec, e.id AS eid, e.*, a.name AS aname, v.name AS vname,
           ew.total_weight AS genre_weight
    FROM events e
    INNER JOIN event_weights ew ON ew.eid = e.id
    LEFT JOIN artists a ON a.id = e.artist_id
    LEFT JOIN venues v ON v.id = e.venue_id
    WHERE e.event_date BETWEEN min_ts AND max_ts
      AND e.id NOT IN (SELECT eid FROM following)
      -- REQUIRED: event must be within user's location radius
      AND e.latitude IS NOT NULL 
      AND e.longitude IS NOT NULL
      AND e.latitude BETWEEN v_min_lat AND v_max_lat 
      AND e.longitude BETWEEN v_min_lng AND v_max_lng
    ORDER BY -LN(RANDOM() + 0.0001) / (ew.total_weight + 1)
    LIMIT 50 + (25 - (SELECT cnt FROM following_count))
  ),
  
  -- 25 TRENDING events (REQUIRED location filter)
  trending AS (
    SELECT 'trending'::TEXT AS sec, e.id AS eid, e.*, a.name AS aname, v.name AS vname,
           0::NUMERIC AS genre_weight
    FROM events e
    LEFT JOIN artists a ON a.id = e.artist_id
    LEFT JOIN venues v ON v.id = e.venue_id
    WHERE e.event_date BETWEEN min_ts AND max_ts
      AND e.id NOT IN (SELECT eid FROM following)
      AND e.id NOT IN (SELECT eid FROM recommended)
      -- REQUIRED: event must be within user's location radius
      AND e.latitude IS NOT NULL 
      AND e.longitude IS NOT NULL
      AND e.latitude BETWEEN v_min_lat AND v_max_lat 
      AND e.longitude BETWEEN v_min_lng AND v_max_lng
    ORDER BY RANDOM()
    LIMIT 25
  ),
  
  -- Number each category separately
  rec_numbered AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY RANDOM()) AS rn FROM recommended
  ),
  fol_numbered AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY RANDOM()) AS rn FROM following
  ),
  tre_numbered AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY RANDOM()) AS rn FROM trending
  ),
  
  -- Build pages: each page has 10 rec + 5 fol + 5 tre, then shuffle within page
  all_with_page AS (
    SELECT sec, eid, title, artist_id, venue_id, event_date, doors_time, description, genres,
           latitude, longitude, ticket_urls, ticket_available, price_range, price_min, price_max,
           is_promoted, promotion_tier, media_urls, event_media_url, venue_city, venue_state,
           venue_address, venue_zip, aname, vname, genre_weight,
           ((rn - 1) / 10)::INT AS page_num,
           RANDOM() AS rand_within_page
    FROM rec_numbered
    
    UNION ALL
    
    SELECT sec, eid, title, artist_id, venue_id, event_date, doors_time, description, genres,
           latitude, longitude, ticket_urls, ticket_available, price_range, price_min, price_max,
           is_promoted, promotion_tier, media_urls, event_media_url, venue_city, venue_state,
           venue_address, venue_zip, aname, vname, genre_weight,
           ((rn - 1) / 5)::INT AS page_num,
           RANDOM() AS rand_within_page
    FROM fol_numbered
    
    UNION ALL
    
    SELECT sec, eid, title, artist_id, venue_id, event_date, doors_time, description, genres,
           latitude, longitude, ticket_urls, ticket_available, price_range, price_min, price_max,
           is_promoted, promotion_tier, media_urls, event_media_url, venue_city, venue_state,
           venue_address, venue_zip, aname, vname, genre_weight,
           ((rn - 1) / 5)::INT AS page_num,
           RANDOM() AS rand_within_page
    FROM tre_numbered
  ),
  
  -- Final ordering: sort by page, then random within each page
  final_ordered AS (
    SELECT *,
           ROW_NUMBER() OVER (ORDER BY page_num, rand_within_page) AS final_pos
    FROM all_with_page
  )
  
  SELECT
    f.sec AS section,
    f.eid AS id,
    f.final_pos::NUMERIC AS score,
    jsonb_build_object(
      'title', f.title,
      'artist_name', f.aname,
      'artist_id', f.artist_id,
      'artist_uuid', f.artist_id,
      'venue_name', f.vname,
      'venue_id', f.venue_id,
      'venue_uuid', f.venue_id,
      'venue_city', f.venue_city,
      'venue_state', f.venue_state,
      'venue_address', f.venue_address,
      'venue_zip', f.venue_zip,
      'event_date', f.event_date,
      'doors_time', f.doors_time,
      'description', f.description,
      'genres', f.genres,
      'latitude', f.latitude,
      'longitude', f.longitude,
      'ticket_urls', f.ticket_urls,
      'ticket_available', f.ticket_available,
      'price_range', f.price_range,
      'price_min', f.price_min,
      'price_max', f.price_max,
      'is_promoted', f.is_promoted,
      'promotion_tier', f.promotion_tier,
      'media_urls', f.media_urls,
      'event_media_url', f.event_media_url
    ) AS payload,
    jsonb_build_object(
      'event_type', f.sec,
      'genre_weight', f.genre_weight,
      'page_num', f.page_num,
      'has_location', has_location
    ) AS context
  FROM final_ordered f
  ORDER BY f.final_pos
  OFFSET p_offset
  LIMIT p_limit;
END;
$function$;

COMMENT ON FUNCTION public.get_personalized_feed_v5 IS 'Batch fetch 100 events (50 rec, 25 fol, 25 tre). Each page of 20 has 10 rec + 5 fol + 5 tre, randomly shuffled. Location filter applied when provided.';

GRANT EXECUTE ON FUNCTION public.get_personalized_feed_v5(UUID, TEXT, INT, INT, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, INT) TO authenticated;

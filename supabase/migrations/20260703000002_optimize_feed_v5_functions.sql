-- Function changes for home feed performance fix. Safe to run as a normal
-- transaction (no CONCURRENTLY here) -- these are plain CREATE OR REPLACE
-- FUNCTION statements. Run this AFTER 20260703000001_add_events_geo_date_covering_index.sql
-- so the index already exists when these functions start executing.
--
-- Root causes + full rationale: see the header comment in
-- 20260703000001_add_events_geo_date_covering_index.sql and the project notes.
--
-- ============================================================================
-- get_personalized_feed_v5
-- Diff vs current production version:
--   - SET statement_timeout TO '45s'  ->  '8s'
--   - event_weights ... LIMIT 10000   ->  LIMIT 2500
--   - following_candidates ... LIMIT 500  ->  LIMIT 300
--   - trending_candidates ... LIMIT 500   ->  LIMIT 300
-- Everything else is byte-for-byte identical to the deployed function.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_personalized_feed_v5(p_user_id uuid, p_section text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_city_lat numeric DEFAULT NULL::numeric, p_city_lng numeric DEFAULT NULL::numeric, p_radius_miles numeric DEFAULT 50, p_include_past boolean DEFAULT false, p_city_filter text DEFAULT NULL::text, p_state_filter text DEFAULT NULL::text, p_max_days_ahead integer DEFAULT 90)
 RETURNS TABLE(section text, id uuid, score numeric, payload jsonb, context jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '8s'
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
  -- 50 mile bounding box
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
  -- Candidate FOLLOWING events (limit before random for performance)
  following_candidates AS (
    SELECT e.id AS eid
    FROM events e
    WHERE e.event_date BETWEEN min_ts AND max_ts
      AND (
        EXISTS (SELECT 1 FROM artist_follows af WHERE af.user_id = p_user_id AND af.artist_id = e.artist_id)
        OR EXISTS (SELECT 1 FROM user_venue_relationships uvr WHERE uvr.user_id = p_user_id AND uvr.venue_id = e.venue_id)
        OR EXISTS (
          SELECT 1
          FROM user_event_relationships uer
          WHERE uer.user_id = p_user_id
            AND uer.event_id = e.id
            AND uer.relationship_type IN ('going','maybe')
        )
      )
    ORDER BY e.event_date
    LIMIT 300
  ),

  -- 25 FOLLOWING events, randomized from candidates
  following AS (
    SELECT 'following'::TEXT AS sec, e.id AS eid, e.*, a.name AS aname, v.name AS vname,
           0::NUMERIC AS genre_weight
    FROM events e
    LEFT JOIN artists a ON a.id = e.artist_id
    LEFT JOIN venues v ON v.id = e.venue_id
    INNER JOIN following_candidates fc ON fc.eid = e.id
    ORDER BY RANDOM()
    LIMIT 25
  ),

  following_count AS (
    SELECT COUNT(*)::INT AS cnt FROM following
  ),

  -- Calculate genre weights for recommended events
  -- All nearby events get base weight 1.0; total_weight = 1.0 + SUM(matching_genre_scores)
  -- Location filter only when has_location: otherwise v_*_lat/lng are NULL and BETWEEN would filter out all rows
  event_weights AS (
    SELECT
      e.id AS eid,
      (1.0 + COALESCE((
        SELECT SUM(
          COALESCE((v_genre_scores->>g.genre)::NUMERIC, 0) +
          COALESCE((v_genre_scores->>LOWER(g.genre))::NUMERIC, 0) +
          COALESCE((v_genre_scores->>REPLACE(g.genre, ' ', ''))::NUMERIC, 0)
        )
        FROM unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) AS g(genre)
      ), 0)) AS total_weight
    FROM events e
    WHERE e.event_date BETWEEN min_ts AND max_ts
      AND e.id NOT IN (SELECT eid FROM following)
      AND (NOT has_location OR (
        e.latitude IS NOT NULL AND e.longitude IS NOT NULL
        AND e.latitude BETWEEN v_min_lat AND v_max_lat
        AND e.longitude BETWEEN v_min_lng AND v_max_lng
      ))
    LIMIT 2500
  ),

  -- Choose RECOMMENDED event ids using weighted random over a bounded candidate set
  recommended_ids AS (
    SELECT ew.eid,
           ew.total_weight
    FROM event_weights ew
    ORDER BY -LN(RANDOM() + 0.0001) / (ew.total_weight + 1)
    LIMIT 50 + (25 - (SELECT cnt FROM following_count))
  ),

  -- 50 RECOMMENDED + extra to fill missing following (join heavy tables only after ids chosen)
  recommended AS (
    SELECT 'recommending'::TEXT AS sec,
           e.id AS eid,
           e.*,
           a.name AS aname,
           v.name AS vname,
           ri.total_weight AS genre_weight
    FROM recommended_ids ri
    INNER JOIN events e ON e.id = ri.eid
    LEFT JOIN artists a ON a.id = e.artist_id
    LEFT JOIN venues v ON v.id = e.venue_id
  ),

  -- Candidate TRENDING events (limit before random for performance)
  trending_candidates AS (
    SELECT e.id AS eid
    FROM events e
    WHERE e.event_date BETWEEN min_ts AND max_ts
      AND e.id NOT IN (SELECT eid FROM following)
      AND e.id NOT IN (SELECT eid FROM recommended)
      AND (NOT has_location OR (
        e.latitude IS NOT NULL AND e.longitude IS NOT NULL
        AND e.latitude BETWEEN v_min_lat AND v_max_lat
        AND e.longitude BETWEEN v_min_lng AND v_max_lng
      ))
    ORDER BY e.event_date DESC
    LIMIT 300
  ),

  -- 25 TRENDING events (location filter only when has_location)
  trending AS (
    SELECT 'trending'::TEXT AS sec, e.id AS eid, e.*, a.name AS aname, v.name AS vname,
           0::NUMERIC AS genre_weight
    FROM events e
    LEFT JOIN artists a ON a.id = e.artist_id
    LEFT JOIN venues v ON v.id = e.venue_id
    INNER JOIN trending_candidates tc ON tc.eid = e.id
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
      'page_num', f.page_num
    ) AS context
  FROM final_ordered f
  ORDER BY f.final_pos
  OFFSET p_offset
  LIMIT p_limit;
END;
$function$;

-- ============================================================================
-- get_or_refresh_feed_v5_cached
-- Diff vs current production version:
--   - cache key now rounds p_city_lat/p_city_lng to 1 decimal degree (~7mi grid)
--     instead of hashing the exact float. This is the ONLY change: the bounding
--     box math inside get_personalized_feed_v5 itself still uses the precise
--     lat/lng passed in, so result accuracy is unaffected -- only the cache
--     lookup key changes, so repeat requests from a GPS fix a few miles from
--     the last one now hit the cache instead of recomputing.
-- Everything else is byte-for-byte identical to the deployed function.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_or_refresh_feed_v5_cached(p_user_id uuid, p_section text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_city_lat numeric DEFAULT NULL::numeric, p_city_lng numeric DEFAULT NULL::numeric, p_radius_miles numeric DEFAULT 50, p_include_past boolean DEFAULT false, p_city_filter text DEFAULT NULL::text, p_state_filter text DEFAULT NULL::text, p_max_days_ahead integer DEFAULT 90, p_ttl_seconds integer DEFAULT 600)
 RETURNS TABLE(section text, id uuid, score numeric, payload jsonb, context jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cache_key     TEXT;
  v_cached_events JSONB;
  v_created_at    TIMESTAMPTZ;
  v_ttl_interval  INTERVAL;
BEGIN
  v_cache_key := md5(
    COALESCE(p_user_id::TEXT, '') || '|' ||
    COALESCE(p_section, '') || '|' ||
    COALESCE(p_limit::TEXT, '') || '|' ||
    COALESCE(p_offset::TEXT, '') || '|' ||
    COALESCE(ROUND(p_city_lat, 1)::TEXT, '') || '|' ||
    COALESCE(ROUND(p_city_lng, 1)::TEXT, '') || '|' ||
    COALESCE(p_radius_miles::TEXT, '') || '|' ||
    COALESCE(p_include_past::TEXT, '') || '|' ||
    COALESCE(p_city_filter, '') || '|' ||
    COALESCE(p_state_filter, '') || '|' ||
    COALESCE(p_max_days_ahead::TEXT, '')
  );

  v_ttl_interval := make_interval(secs => GREATEST(p_ttl_seconds, 0));

  SELECT c.events, c.created_at
  INTO v_cached_events, v_created_at
  FROM public.personalized_feed_cache c
  WHERE c.cache_key = v_cache_key;

  IF v_cached_events IS NOT NULL
     AND v_created_at > (NOW() - v_ttl_interval) THEN
    RETURN QUERY
    SELECT
      (e->>'section')::TEXT AS section,
      (e->>'id')::UUID      AS id,
      (e->>'score')::NUMERIC AS score,
      e->'payload'          AS payload,
      e->'context'          AS context
    FROM jsonb_array_elements(v_cached_events) AS e;
    RETURN;
  END IF;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'section', f.section,
               'id', f.id,
               'score', f.score,
               'payload', f.payload,
               'context', f.context
             )
           ),
           '[]'::JSONB
         )
  INTO v_cached_events
  FROM public.get_personalized_feed_v5(
    p_user_id,
    p_section,
    p_limit,
    p_offset,
    p_city_lat,
    p_city_lng,
    p_radius_miles,
    p_include_past,
    p_city_filter,
    p_state_filter,
    p_max_days_ahead
  ) AS f(section, id, score, payload, context);

  INSERT INTO public.personalized_feed_cache (
    cache_key,
    user_id,
    city_lat,
    city_lng,
    radius_miles,
    date_start,
    date_end,
    created_at,
    events
  )
  VALUES (
    v_cache_key,
    p_user_id,
    p_city_lat,
    p_city_lng,
    p_radius_miles,
    NULL,
    NULL,
    NOW(),
    v_cached_events
  )
  ON CONFLICT (cache_key) DO UPDATE
    SET created_at = EXCLUDED.created_at,
        events     = EXCLUDED.events,
        user_id    = EXCLUDED.user_id;

  RETURN QUERY
  SELECT
    (e->>'section')::TEXT   AS section,
    (e->>'id')::UUID        AS id,
    (e->>'score')::NUMERIC  AS score,
    e->'payload'            AS payload,
    e->'context'            AS context
  FROM jsonb_array_elements(v_cached_events) AS e;
END;
$function$;

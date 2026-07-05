-- Feed reads listened-artist scores (Spotify-live-events-style recommendations, part 2 of 2)
--
-- Problem: get_personalized_feed_v5 reads ONLY user_preferences.genre_preference_scores.
-- artist_preference_scores / top_artists are never used, so the "recommended"
-- section is a genre-weighted random draw and your most-listened artists get no
-- special treatment. Part 1 (20260703000003) makes Spotify listening populate
-- artist_preference_scores; this migration makes the feed use them.
--
-- Change to the event_weights CTE (recommended-section candidate weighting):
--   before: total_weight = 1.0 + SUM(matching genre scores)
--   after:  total_weight = 1.0 + SUM(matching genre scores)
--                              + 10.0 * artist_preference_scores[event.artist_id]
--
-- Calibration: after part 1, an artist you play heavily right now scores ~19
-- (short 10 + medium 6 + long 3), so their events weigh ~190+ vs the typical
-- 1-20 for genre-only matches. In the weighted-random draw that means events by
-- your top listened artists are picked almost every time they exist nearby,
-- while genre/review logic still drives everything else -- exactly the
-- "prioritize artists I actually listen to, keep the rest of the logic" ask.
-- Manual artist picks and follows also live in artist_preference_scores, so
-- they get the same boost (smaller, since their weights are lower).
--
-- The context JSONB gains 'artist_weight' next to 'genre_weight' so the UI can
-- later render "Because you listen to X" on cards where artist_weight > 0.
--
-- NOTE: this is the complete, final function body. It also carries the
-- performance changes from 20260703000002 (statement_timeout 8s, candidate
-- LIMITs 300/2500/300), so it is safe to run whether or not you've applied
-- that file -- but DO still run 20260703000002 for the cached-wrapper
-- (cache key rounding) change, and 20260703000001 for the covering index.
-- If you already created idx_events_geo_date_covering from an earlier version
-- of file 0001, see the note in that file about recreating it with artist_id.
--
-- Safe to run as one normal transaction.

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
  v_artist_scores JSONB;
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

  -- Get user's genre + artist preference scores
  SELECT COALESCE(genre_preference_scores, '{}'), COALESCE(artist_preference_scores, '{}')
  INTO v_genre_scores, v_artist_scores
  FROM user_preferences WHERE user_id = p_user_id;
  v_genre_scores := COALESCE(v_genre_scores, '{}');
  v_artist_scores := COALESCE(v_artist_scores, '{}');

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
           0::NUMERIC AS genre_weight,
           0::NUMERIC AS artist_weight
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

  -- Calculate genre + listened-artist weights for recommended events
  -- All nearby events get base weight 1.0;
  -- total_weight = 1.0 + SUM(matching_genre_scores) + 10 * artist_preference_score
  -- Location filter only when has_location: otherwise v_*_lat/lng are NULL and BETWEEN would filter out all rows
  event_weights AS (
    SELECT
      e.id AS eid,
      (1.0
        + COALESCE((
            SELECT SUM(
              COALESCE((v_genre_scores->>g.genre)::NUMERIC, 0) +
              COALESCE((v_genre_scores->>LOWER(g.genre))::NUMERIC, 0) +
              COALESCE((v_genre_scores->>REPLACE(g.genre, ' ', ''))::NUMERIC, 0)
            )
            FROM unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) AS g(genre)
          ), 0)
        + 10.0 * COALESCE((v_artist_scores->>(e.artist_id::TEXT))::NUMERIC, 0)
      ) AS total_weight,
      COALESCE((v_artist_scores->>(e.artist_id::TEXT))::NUMERIC, 0) AS artist_weight
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
           ew.total_weight,
           ew.artist_weight
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
           ri.total_weight AS genre_weight,
           ri.artist_weight AS artist_weight
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
           0::NUMERIC AS genre_weight,
           0::NUMERIC AS artist_weight
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
           venue_address, venue_zip, aname, vname, genre_weight, artist_weight,
           ((rn - 1) / 10)::INT AS page_num,
           RANDOM() AS rand_within_page
    FROM rec_numbered

    UNION ALL

    SELECT sec, eid, title, artist_id, venue_id, event_date, doors_time, description, genres,
           latitude, longitude, ticket_urls, ticket_available, price_range, price_min, price_max,
           is_promoted, promotion_tier, media_urls, event_media_url, venue_city, venue_state,
           venue_address, venue_zip, aname, vname, genre_weight, artist_weight,
           ((rn - 1) / 5)::INT AS page_num,
           RANDOM() AS rand_within_page
    FROM fol_numbered

    UNION ALL

    SELECT sec, eid, title, artist_id, venue_id, event_date, doors_time, description, genres,
           latitude, longitude, ticket_urls, ticket_available, price_range, price_min, price_max,
           is_promoted, promotion_tier, media_urls, event_media_url, venue_city, venue_state,
           venue_address, venue_zip, aname, vname, genre_weight, artist_weight,
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
      'artist_weight', f.artist_weight,
      'page_num', f.page_num
    ) AS context
  FROM final_ordered f
  ORDER BY f.final_pos
  OFFSET p_offset
  LIMIT p_limit;
END;
$function$;

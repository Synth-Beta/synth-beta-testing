-- HOTFIX: feed RPC 500s in production (2026-07-04)
--
-- Root cause: following_candidates (events from artists you follow / venues
-- you follow / events you marked going-maybe) has NEVER had a location
-- filter -- by design, a followed artist's show should surface regardless of
-- distance. For a user with only a handful of follows, that means Postgres
-- has to scan essentially the ENTIRE nationwide date-window (measured: 54,054
-- events in the next 90 days) checking each one against 3 small hashed
-- lookups, just to find the ~61 that match, before it can even apply
-- LIMIT 300. Verified via EXPLAIN ANALYZE against prod: 13.2 SECONDS for this
-- one CTE alone.
--
-- This bottleneck already existed before today -- it just never surfaced,
-- because until the 2026-07-03 performance migration (20260703000002) the
-- function's statement_timeout was 45s, comfortably above 13.2s. Lowering it
-- to 8s (which was the right call for every OTHER cost center -- see that
-- migration) exposed this one, and it's now failing with 500 Internal Server
-- Error on both web and mobile ("canceling statement due to statement
-- timeout" repeating in the Postgres logs).
--
-- Fix: restructure following_candidates from "scan broad by date, filter
-- narrow per-row" to "look up the (tiny) set of followed artist/venue ids and
-- interested event ids FIRST, then fetch only THOSE events via their own
-- indexes (idx_events_artist_id / idx_events_venue_id / events_pkey), THEN
-- apply the date filter on that small result." Same output, same LIMIT 300,
-- same ORDER BY event_date -- just a access path Postgres can actually use
-- efficiently when matches are sparse relative to the table. Verified via
-- EXPLAIN ANALYZE against prod: 210ms, identical 61-row result set. Combined
-- with the rest of the function (diversity cap + blend scoring from
-- 20260703000008), full end-to-end execution measured at 1.54s for a real
-- account with a real nearby-city bounding box -- comfortably under budget.
--
-- Also bumping statement_timeout 8s -> 15s as a safety margin: 1.54s measured
-- was on a partially-warm cache; a fully cold cache (rare, e.g. right after
-- this deploy or a long-idle period) could still run a few seconds slower,
-- and 15s still leaves an 8x-9x improvement over the original 45s+ /
-- 60-second mobile load times this whole effort started from.
--
-- Only following_candidates and the timeout change; the diversity cap and
-- blend scoring from 20260703000008 are otherwise untouched, byte-for-byte.
--
-- Safe to run as one normal transaction (no CONCURRENTLY).

CREATE OR REPLACE FUNCTION public.get_personalized_feed_v5(p_user_id uuid, p_section text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_city_lat numeric DEFAULT NULL::numeric, p_city_lng numeric DEFAULT NULL::numeric, p_radius_miles numeric DEFAULT 50, p_include_past boolean DEFAULT false, p_city_filter text DEFAULT NULL::text, p_state_filter text DEFAULT NULL::text, p_max_days_ahead integer DEFAULT 90)
 RETURNS TABLE(section text, id uuid, score numeric, payload jsonb, context jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
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
  -- Candidate FOLLOWING events: look up the (tiny) sets of followed artist/
  -- venue ids and interested event ids FIRST, fetch only those events via
  -- their own indexes, THEN apply the date filter -- instead of scanning the
  -- whole nationwide date window and filtering per-row (was the 13.2s bottleneck)
  following_candidates AS (
    SELECT eid FROM (
      SELECT e.id AS eid, e.event_date
      FROM events e
      WHERE e.artist_id IN (SELECT artist_id FROM artist_follows WHERE user_id = p_user_id)
        AND e.event_date BETWEEN min_ts AND max_ts

      UNION

      SELECT e.id AS eid, e.event_date
      FROM events e
      WHERE e.venue_id IN (SELECT venue_id FROM user_venue_relationships WHERE user_id = p_user_id)
        AND e.event_date BETWEEN min_ts AND max_ts

      UNION

      SELECT e.id AS eid, e.event_date
      FROM events e
      JOIN user_event_relationships uer ON uer.event_id = e.id
      WHERE uer.user_id = p_user_id
        AND uer.relationship_type IN ('going','maybe')
        AND e.event_date BETWEEN min_ts AND max_ts
    ) combined
    ORDER BY event_date
    LIMIT 300
  ),

  -- FOLLOWING candidates joined + randomized, before the artist cap
  following_raw AS (
    SELECT 'following'::TEXT AS sec, e.id AS eid, e.*, a.name AS aname, v.name AS vname,
           0::NUMERIC AS genre_weight,
           0::NUMERIC AS artist_weight,
           RANDOM() AS sample_key
    FROM events e
    LEFT JOIN artists a ON a.id = e.artist_id
    LEFT JOIN venues v ON v.id = e.venue_id
    INNER JOIN following_candidates fc ON fc.eid = e.id
  ),

  -- Cap 1 event per artist (NULL-artist events never compete with each other)
  following_ranked AS (
    SELECT fr.*,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(fr.artist_id::TEXT, 'e-' || fr.eid::TEXT)
             ORDER BY fr.sample_key
           ) AS artist_rn
    FROM following_raw fr
  ),

  -- 25 FOLLOWING events, one per artist, randomized from candidates
  following AS (
    SELECT fr.*
    FROM following_ranked fr
    WHERE fr.artist_rn = 1
    ORDER BY fr.sample_key
    LIMIT 25
  ),

  following_count AS (
    SELECT COUNT(*)::INT AS cnt FROM following
  ),

  -- Calculate genre + listened-artist weights for recommended events
  -- All nearby events get base weight 1.0;
  -- total_weight = 1.0 + 6*ln(1 + genre_sum) + 16*ln(1 + artist_preference_score)
  -- Both terms log-compressed and calibrated against live score distributions
  -- so a heavily-listened/reviewed/followed artist reliably outranks pure
  -- genre matches without either signal dominating outright -- see
  -- 20260703000008 for the full calibration rationale and prod-verified percentiles.
  -- Location filter only when has_location: otherwise v_*_lat/lng are NULL and BETWEEN would filter out all rows
  event_weights AS (
    SELECT
      e.id AS eid,
      e.artist_id AS artist_id,
      (1.0
        + 6.0 * LN(1.0 + GREATEST(COALESCE((
            SELECT SUM(COALESCE((v_genre_scores->>k.variant)::NUMERIC, 0))
            FROM unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) AS g(genre)
            CROSS JOIN LATERAL (
              -- DISTINCT so a single-word genre (where raw = spaces-stripped)
              -- isn't summed twice for hitting the same score key two ways
              SELECT DISTINCT v AS variant
              FROM unnest(ARRAY[g.genre, LOWER(g.genre), REPLACE(g.genre, ' ', '')]) AS v
            ) k
          ), 0), 0))
        + 16.0 * LN(1.0 + GREATEST(COALESCE((v_artist_scores->>(e.artist_id::TEXT))::NUMERIC, 0), 0))
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

  -- Weighted-random sample key per candidate, excluding artists already used by FOLLOWING
  recommended_sampled AS (
    SELECT ew.eid, ew.artist_id, ew.total_weight, ew.artist_weight,
           -LN(RANDOM() + 0.0001) / (ew.total_weight + 1) AS sample_key
    FROM event_weights ew
    WHERE ew.artist_id IS NULL
       OR ew.artist_id NOT IN (SELECT artist_id FROM following WHERE artist_id IS NOT NULL)
  ),

  -- Cap 1 event per artist (best weighted-random draw wins per artist)
  recommended_ranked AS (
    SELECT rs.*,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(rs.artist_id::TEXT, 'e-' || rs.eid::TEXT)
             ORDER BY rs.sample_key
           ) AS artist_rn
    FROM recommended_sampled rs
  ),

  -- Choose RECOMMENDED event ids using weighted random over a bounded, artist-capped candidate set
  recommended_ids AS (
    SELECT rr.eid, rr.artist_id, rr.total_weight, rr.artist_weight
    FROM recommended_ranked rr
    WHERE rr.artist_rn = 1
    ORDER BY rr.sample_key
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

  -- TRENDING candidates joined + randomized, excluding artists already used by FOLLOWING or RECOMMENDED
  trending_raw AS (
    SELECT 'trending'::TEXT AS sec, e.id AS eid, e.*, a.name AS aname, v.name AS vname,
           0::NUMERIC AS genre_weight,
           0::NUMERIC AS artist_weight,
           RANDOM() AS sample_key
    FROM events e
    LEFT JOIN artists a ON a.id = e.artist_id
    LEFT JOIN venues v ON v.id = e.venue_id
    INNER JOIN trending_candidates tc ON tc.eid = e.id
    WHERE e.artist_id IS NULL
       OR e.artist_id NOT IN (
            SELECT artist_id FROM following WHERE artist_id IS NOT NULL
            UNION
            SELECT artist_id FROM recommended WHERE artist_id IS NOT NULL
          )
  ),

  -- Cap 1 event per artist
  trending_ranked AS (
    SELECT tr.*,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(tr.artist_id::TEXT, 'e-' || tr.eid::TEXT)
             ORDER BY tr.sample_key
           ) AS artist_rn
    FROM trending_raw tr
  ),

  -- 25 TRENDING events, one per artist (location filter only when has_location)
  trending AS (
    SELECT tr.*
    FROM trending_ranked tr
    WHERE tr.artist_rn = 1
    ORDER BY tr.sample_key
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

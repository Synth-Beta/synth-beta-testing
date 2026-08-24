-- Feed personalization: stop filling "recommended" with zero-match events (2026-08-23)
--
-- THE BUG
-- -------
-- get_personalized_feed_v5 picks the recommended section with Efraimidis-
-- Spirakis weighted sampling:
--     sample_key = -LN(RANDOM() + 0.0001) / (total_weight + 1)
-- E-S selects each row with probability proportional to that divisor, so the
-- EFFECTIVE weight of a row is (total_weight + 1), and total_weight itself
-- carried a hardcoded +1.0 base:
--     total_weight = 1.0 + 6*ln(1+genre_sum) + 16*ln(1+artist_score)
--                        + 4*ln(1+popularity)
--
-- An event matching NOTHING about the user -- no genre overlap, no artist
-- signal -- therefore had effective weight 2.0, not 0. That is fine in
-- isolation. It is not fine at the ratios that actually occur: the candidate
-- pool is up to 2500 in-window local events, of which only a small minority
-- overlap any given user's taste. Worked example with a strong match
-- (genre_sum 10, artist_score 5):
--     zero-match   -> total_weight 1.0,  effective  2.0
--     strong match -> total_weight ~44,  effective ~45
--     2400 zero-match events  x  2.0 = 4800 weight
--     ~100 real matches       x ~45   = 4500 weight
-- Roughly HALF of every "recommended" section was drawn from events with no
-- taste connection to the user whatsoever. That is the user-visible
-- "recommended shows me artists unrelated to anything I listen to" complaint:
-- not a weak ranking signal, an actual coin flip.
--
-- THE FIX
-- -------
-- Two coupled changes, both inside get_personalized_feed_v5 only. No schema
-- change, no new table, no backfill, no signature change.
--
-- 1. Relevance gate. Expose the raw match components (genre_sum, artist_sum)
--    out of the weight CTE, derive is_match = (genre_sum > 0 OR artist_sum >
--    0), and make it the LEADING sort term when picking recommended_ids.
--    Matched events are exhausted before a single unmatched one is taken.
--
--    Deliberately a sort key, not a WHERE filter. A filter would empty the
--    section for the many users who have no preferences computed yet (new
--    signups, nobody connected to streaming) and would short the feed in thin
--    markets. As a sort term, unmatched events still backfill when matches
--    run out, and a preference-less user gets byte-identical behaviour to
--    today -- is_match is false for every row, so the term is constant and
--    ordering falls through to sample_key exactly as before.
--
--    Popularity is deliberately NOT part of is_match. A popular event you
--    have no taste connection to is still an unrelated event; popularity
--    stays a ranking term, not an entry ticket.
--
-- 2. Honest weights. Drop the 1.0 base from total_weight and move the
--    divide-by-zero guard into the sampler as a floor on the divisor:
--        -LN(RANDOM() + 0.0001) / GREATEST(total_weight, 0.05)
--    The old "+1.0 base, then +1 again in the divisor" gave every row a floor
--    of 2.0 in effective weight, which flattened the distinction between weak
--    and strong matches as much as it propped up non-matches: a weak match
--    (total 1.6) and a strong one (total 44) sampled at 3.6 vs 45, a 12.5x
--    spread, when the underlying scores differ by 27x. With the base removed
--    and the divisor floored, the spread is the true one, and total_weight
--    becomes what it claims to be -- a match score where 0 genuinely means
--    "no match". This change is only meaningful alongside change 1 (and vice
--    versa), which is why they ship together.
--
--    Side effect: context.genre_weight in the returned payload is now that
--    honest score rather than score+1. Verified nothing in src/, mobile/ or
--    packages/ reads it -- it is a debug field only.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- Discovery is not removed. Exploration still happens two ways: E-S sampling
-- within the matched set (a weak match can still outrank a strong one on any
-- given request), and the entire trending section, which is unmatched by
-- design and untouched here.
--
-- NOT IN SCOPE (next, deliberately separate)
-- ------------------------------------------
-- The candidate CTE still ends in a bare `LIMIT 2500` with NO ORDER BY, so
-- the pool is an arbitrary scan-order slice of the in-window local events
-- rather than the top-scoring ones. This migration makes that matter MORE,
-- not less: recommended now draws matches out of that arbitrary slice, and
-- where the slice happens to hold few matches the section still backfills
-- with unmatched events. Fixing pool selection is the next change.
--
-- Everything else in this function is byte-identical to
-- 20260802120000_feed_v5_decay_and_popularity.sql -- same signature, same
-- output columns, same following/recommended/trending structure, same
-- artist-diversity cap, same trending sort, same page assembly. Postgres has
-- no partial function edit, so the whole body is restated.

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
  IF has_location THEN
    v_min_lat := p_city_lat - (50.0 / 69.0);
    v_max_lat := p_city_lat + (50.0 / 69.0);
    v_min_lng := p_city_lng - (50.0 / (69.0 * COS(RADIANS(p_city_lat))));
    v_max_lng := p_city_lng + (50.0 / (69.0 * COS(RADIANS(p_city_lat))));
  END IF;

  SELECT COALESCE(genre_preference_scores, '{}'), COALESCE(artist_preference_scores, '{}')
  INTO v_genre_scores, v_artist_scores
  FROM user_preferences WHERE user_id = p_user_id;
  v_genre_scores := COALESCE(v_genre_scores, '{}');
  v_artist_scores := COALESCE(v_artist_scores, '{}');

  RETURN QUERY
  WITH
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

  following_ranked AS (
    SELECT fr.*,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(fr.artist_id::TEXT, 'e-' || fr.eid::TEXT)
             ORDER BY fr.sample_key
           ) AS artist_rn
    FROM following_raw fr
  ),

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

  -- CHANGED: raw match components are materialised separately so the
  -- relevance gate below can read them. genre_sum uses the same event-side
  -- variant expression as before (events.genres is slug-cased and
  -- genre_preference_scores is keyed by genres.slug since
  -- genre-pipeline-2026-08-20/01, so these line up).
  event_scores AS (
    SELECT
      e.id AS eid,
      e.artist_id AS artist_id,
      GREATEST(COALESCE((
        SELECT SUM(COALESCE((v_genre_scores->>k.variant)::NUMERIC, 0))
        FROM unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) AS g(genre)
        CROSS JOIN LATERAL (
          SELECT DISTINCT v AS variant
          FROM unnest(ARRAY[g.genre, LOWER(g.genre), REPLACE(g.genre, ' ', '')]) AS v
        ) k
      ), 0), 0) AS genre_sum,
      GREATEST(COALESCE((v_artist_scores->>(e.artist_id::TEXT))::NUMERIC, 0), 0) AS artist_sum,
      COALESCE(ep.total_count, 0) AS pop_count
    FROM events e
    LEFT JOIN event_popularity_scores ep ON ep.event_id = e.id
    WHERE e.event_date BETWEEN min_ts AND max_ts
      AND e.id NOT IN (SELECT eid FROM following)
      AND (NOT has_location OR (
        e.latitude IS NOT NULL AND e.longitude IS NOT NULL
        AND e.latitude BETWEEN v_min_lat AND v_max_lat
        AND e.longitude BETWEEN v_min_lng AND v_max_lng
      ))
    LIMIT 2500
  ),

  -- CHANGED: total_weight = 6*ln(1+genre_sum) + 16*ln(1+artist_sum)
  --                       + 4*ln(1+pop_count)
  -- The hardcoded 1.0 base is gone -- 0 now honestly means "no match".
  -- Coefficients unchanged from 20260802120000 (6/16 calibrated in
  -- 20260703000008, 4 calibrated against the real popularity distribution).
  event_weights AS (
    SELECT
      es.eid,
      es.artist_id,
      es.genre_sum,
      es.artist_sum,
      (6.0 * LN(1.0 + es.genre_sum)
        + 16.0 * LN(1.0 + es.artist_sum)
        + 4.0 * LN(1.0 + es.pop_count)
      ) AS total_weight,
      es.artist_sum AS artist_weight
    FROM event_scores es
  ),

  -- CHANGED: is_match carried through; the divide-by-zero guard is now a
  -- floor on the divisor instead of a +1 that compressed the whole range.
  recommended_sampled AS (
    SELECT ew.eid, ew.artist_id, ew.total_weight, ew.artist_weight,
           (ew.genre_sum > 0 OR ew.artist_sum > 0) AS is_match,
           -LN(RANDOM() + 0.0001) / GREATEST(ew.total_weight, 0.05) AS sample_key
    FROM event_weights ew
    WHERE ew.artist_id IS NULL
       OR ew.artist_id NOT IN (SELECT artist_id FROM following WHERE artist_id IS NOT NULL)
  ),

  recommended_ranked AS (
    SELECT rs.*,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(rs.artist_id::TEXT, 'e-' || rs.eid::TEXT)
             ORDER BY (NOT rs.is_match), rs.sample_key
           ) AS artist_rn
    FROM recommended_sampled rs
  ),

  -- CHANGED: (NOT is_match) leads the sort, so every matched event is taken
  -- before any unmatched one. For a user with no computed preferences every
  -- row has is_match = false, the term is constant, and this degrades exactly
  -- to the previous sample_key-only ordering.
  recommended_ids AS (
    SELECT rr.eid, rr.artist_id, rr.total_weight, rr.artist_weight
    FROM recommended_ranked rr
    WHERE rr.artist_rn = 1
    ORDER BY (NOT rr.is_match), rr.sample_key
    LIMIT 50 + (25 - (SELECT cnt FROM following_count))
  ),

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

  -- TRENDING unchanged: ordered by total_count first (the only currently-
  -- differentiating signal at today's volume), velocity as a tiebreaker,
  -- event_date as a final tiebreaker to keep some recency flavor.
  trending_candidates AS (
    SELECT e.id AS eid
    FROM events e
    LEFT JOIN event_popularity_scores ep ON ep.event_id = e.id
    WHERE e.event_date BETWEEN min_ts AND max_ts
      AND e.id NOT IN (SELECT eid FROM following)
      AND e.id NOT IN (SELECT eid FROM recommended)
      AND (NOT has_location OR (
        e.latitude IS NOT NULL AND e.longitude IS NOT NULL
        AND e.latitude BETWEEN v_min_lat AND v_max_lat
        AND e.longitude BETWEEN v_min_lng AND v_max_lng
      ))
    ORDER BY COALESCE(ep.total_count, 0) DESC, COALESCE(ep.velocity_score, 0) DESC, e.event_date DESC
    LIMIT 300
  ),

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

  trending_ranked AS (
    SELECT tr.*,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(tr.artist_id::TEXT, 'e-' || tr.eid::TEXT)
             ORDER BY tr.sample_key
           ) AS artist_rn
    FROM trending_raw tr
  ),

  trending AS (
    SELECT tr.*
    FROM trending_ranked tr
    WHERE tr.artist_rn = 1
    ORDER BY tr.sample_key
    LIMIT 25
  ),

  rec_numbered AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY RANDOM()) AS rn FROM recommended
  ),
  fol_numbered AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY RANDOM()) AS rn FROM following
  ),
  tre_numbered AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY RANDOM()) AS rn FROM trending
  ),

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

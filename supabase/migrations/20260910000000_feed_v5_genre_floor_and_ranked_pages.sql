-- =============================================================================
-- Feed v5: relative genre floor + stop shuffling away the ranking
-- =============================================================================
-- REVIEW THIS, THEN APPLY IT YOURSELF. Nothing here is auto-applied.
--
-- Generated from the applied 20260831000000_feed_v5_genre_coverage.sql by targeted
-- substitution, after confirming that file is byte-identical to the LIVE definition
-- (pg_get_functiondef, 2026-09-10). Only the expressions marked "CHANGED (this
-- migration)" differ. Postgres has no partial function edit, so the whole body is
-- restated regardless.
--
-- Reported: an EDM / hip-hop listener seeing folk and rock at the TOP of Recommended.
-- Their real scores: hip-hop-rap 131.67, edm 90.82, indie 73.03, pop 64.23 -- versus
-- metal 11.50, rock 5.08, folk 2.16.
--
-- ── PROBLEM 1: any nonzero score counted as taste ────────────────────────────
-- is_match is `genre_sum > 0`, so folk at 1.6% of their top genre was a genuine match
-- and sorted with the real ones. Fixed with a floor RELATIVE to each user's own
-- strongest genre (v_genre_floor_ratio), since absolute thresholds mean different
-- things for a user with 130-point scores and one with 5-point scores.
--
-- ── PROBLEM 2: the ranking was shuffled away before display ──────────────────
-- This is the bigger one, and it is why weak matches appeared at the very TOP.
-- recommended_ids samples by weight and puts matches ahead of non-matches -- then
-- rec_numbered did `ROW_NUMBER() OVER (ORDER BY RANDOM())`, a uniform reshuffle of the
-- selected 50. Since page_num is (rn-1)/10 and the feed opens on page 0, the first ten
-- events were a random draw. No amount of scoring could survive that.
-- Now ordered by total_weight DESC, with the existing rand_within_page still varying
-- order inside each page so refreshes stay fresh.
--
-- Artist signals were already weighted well above genre (16.0 vs 6.0 coefficients), so
-- with the ranking preserved, bucket-list / reviewed / Spotify / Apple Music artists
-- now actually surface first instead of being shuffled into the pile.
--
-- ── AFTER APPLYING ───────────────────────────────────────────────────────────
--   DELETE FROM public.personalized_feed_cache;   -- or this reads as a no-op
-- No refresh_user_preferences_v5 needed: this changes reading, not the stored scores.
-- =============================================================================

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
  -- Genre-coverage tuning (this migration). See header for the rationale.
  -- exponent 1.0 = full linear penalty, 0.0 = feature off. 0.5 is deliberately
  -- moderate: it discounts a partial match without annihilating it.
  v_coverage_exponent NUMERIC := 0.5;
  -- Floor stops a pathologically many-tagged event from going to ~0 on a single
  -- genuine match. 0.15 with exponent 0.5 bottoms the multiplier out at ~0.39.
  v_coverage_floor NUMERIC := 0.15;
  -- Relative genre floor (this migration). A genre only counts as taste if it is at
  -- least this fraction of the user's OWN strongest genre, so the threshold scales with
  -- each user instead of being an absolute number that means different things per person.
  -- 0.10 with a real profile: hip-hop-rap 131.67 keeps edm (69%), indie (55%), pop (49%)
  -- and drops metal (8.7%), rock (3.9%), folk (1.6%). Set to 0 to disable.
  v_genre_floor_ratio NUMERIC := 0.10;
  v_genre_min_score NUMERIC := 0;
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

  -- Scale the floor to this user's strongest genre. Computed once here rather than per
  -- event row. A user with no genre scores keeps a floor of 0, so nothing changes for them.
  SELECT COALESCE(MAX(value::NUMERIC), 0) * v_genre_floor_ratio
  INTO v_genre_min_score
  FROM jsonb_each_text(v_genre_scores);
  v_genre_min_score := COALESCE(v_genre_min_score, 0);

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

  -- CHANGED (this migration): genre_sum is now slug-normalised via
  -- genre_match_slug (so "indie rock" matches the "indie-rock" preference key
  -- it never used to), IDF-weighted via genre_idf.idf_norm (so 'jamband'
  -- outweighs 'rock' by ~2.9x), and damped by tag_count^0.25 (so a 6-broad-tag
  -- event no longer outscores an exact 1-tag match on volume alone).
  --
  -- POWER(numeric, numeric) returns numeric. Do NOT use SQRT() here -- it
  -- returns double precision, which silently makes the whole expression float.
  event_scores AS (
    SELECT
      e.id AS eid,
      e.artist_id AS artist_id,
      GREATEST(COALESCE((
        -- CHANGED (this migration): a genre below the user's relative floor contributes
        -- nothing. Trace scores that are ~1-4% of someone's top genre were enough to make
        -- an event "match", which is how an EDM/hip-hop listener got folk and rock ranked
        -- alongside their real taste.
        SELECT SUM((CASE
                      WHEN COALESCE((v_genre_scores->>gi.genre_slug)::NUMERIC, 0) >= v_genre_min_score
                      THEN COALESCE((v_genre_scores->>gi.genre_slug)::NUMERIC, 0)
                      ELSE 0
                    END) * gi.idf_norm)
               / POWER(GREATEST(COALESCE(array_length(e.genres, 1), 1), 1)::NUMERIC, 0.25)
               -- CHANGED (this migration): scale by how much of the event's genre
               -- identity the user actually matches. A flat SUM let ONE shared tag
               -- carry a whole event: ["christian","folk","indie"] matched a user
               -- with an `indie` score and nothing else, because nothing in the
               -- formula could express "indie yes, christian no". Coverage is the
               -- matched share of the event's total IDF mass, so an event that is
               -- 1/3 the user scores a third of what a fully-matching one does.
               * POWER(
                   GREATEST(
                     COALESCE(
                       SUM(gi.idf_norm) FILTER (
                         -- CHANGED: same floor, so coverage and genre_sum agree on what
                         -- counts as a match. Otherwise a sub-floor tag would still inflate
                         -- the matched share while contributing no score.
                         WHERE COALESCE((v_genre_scores->>gi.genre_slug)::NUMERIC, 0) >= v_genre_min_score
                       ) / NULLIF(SUM(gi.idf_norm), 0),
                       0
                     ),
                     v_coverage_floor
                   ),
                   v_coverage_exponent
                 )
        FROM unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) AS g(genre)
        JOIN public.genre_idf gi ON gi.genre_slug = public.genre_match_slug(g.genre)
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

  -- Unchanged from 20260823000000: no base constant, so total_weight = 0
  -- honestly means "no match". Coefficients unchanged.
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
    -- CHANGED (this migration): order by score, NOT uniformly at random.
    -- recommended_ids does careful weighted sampling and orders matches ahead of
    -- non-matches, and this line then threw all of it away: ROW_NUMBER() OVER (ORDER BY
    -- RANDOM()) reshuffled the whole set, so page 0 -- the first ten events anyone sees --
    -- was a uniform random draw from the top 50. A weak match landed first as often as the
    -- best one. genre_weight here carries total_weight (see the `recommended` CTE).
    -- rand_within_page in all_with_page still varies the order inside each page of ten,
    -- so the feed stays fresh between refreshes without burying the best matches.
    SELECT *, ROW_NUMBER() OVER (ORDER BY genre_weight DESC, RANDOM()) AS rn FROM recommended
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

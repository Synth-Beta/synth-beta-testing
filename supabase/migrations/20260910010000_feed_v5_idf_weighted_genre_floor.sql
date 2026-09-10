-- =============================================================================
-- Feed v5: floor genres on IDF-WEIGHTED contribution, not raw score
-- =============================================================================
-- REVIEW THIS, THEN APPLY IT YOURSELF. Nothing here is auto-applied.
--
-- Supersedes 20260910000000. Same body, ONE idea changed. Safe to apply whether or not
-- 20260910000000 went in first (CREATE OR REPLACE, and the two are not additive).
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- The relative floor in 20260910000000 compares a genre's RAW score against 10% of the
-- user's top raw score. That punishes precision. A real profile:
--
--   hip-hop-rap 131.67 | edm 90.82 | indie 73.03 | pop 64.23 | rap 37.26 |
--   rage-rap 33.92 | hip-hop 23.86 | metal 11.50 | emo-rap 7.79 | rock 5.08 |
--   melodic-rap 3.85 | west-coast-hip-hop 2.64 | folk 2.16
--
-- A raw 10% floor (13.17) drops folk and rock -- correct -- but ALSO drops emo-rap,
-- melodic-rap and west-coast-hip-hop, which are the most SPECIFIC things known about this
-- user's taste. Those are exactly the tags that separate one hip-hop act from another, and
-- they are inherently low-scoring: a narrow subgenre gets fewer signals than its parent by
-- definition. Cutting them is how you end up recommending "hip-hop artists I have no clue
-- about" -- with only the broad parent tag surviving, every hip-hop act scores alike and
-- the order inside the genre is arbitrary.
--
-- Note this cannot be fixed by collapsing the subgenres into a canonical parent instead.
-- get_personalized_feed_v5 looks up genre_match_slug(event tag) directly and does NOT run
-- resolve_genre_to_canonical on the read side, so folding 'west-coast-hip-hop' into
-- 'hip-hop-rap' in the score map would leave events tagged 'west-coast-hip-hop' matching
-- nothing at all. The keys have to stay split.
--
-- ── THE CHANGE ───────────────────────────────────────────────────────────────
-- Floor on what a genre actually CONTRIBUTES -- score * genre_idf.idf_norm -- which is the
-- quantity genre_sum sums anyway. A rare, specific tag carries a high idf_norm and clears
-- the floor on a small raw score; a broad, common tag has to earn it. Both the floor and
-- the two comparisons move together, so genre_sum and the coverage FILTER still agree on
-- what "matched" means.
--
-- v_genre_floor_ratio stays the single tunable: 0 disables the floor entirely, higher is
-- stricter. It now means "at least this fraction of your strongest genre's contribution".
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
  -- Applied to score * idf_norm (see the floor query below), so a narrow, rare subgenre
  -- clears it on a much smaller raw score than a broad one needs. Set to 0 to disable.
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

  -- Scale the floor to this user's strongest genre CONTRIBUTION (score * idf_norm), not
  -- their strongest raw score. Computed once here rather than per event row. A genre with
  -- no genre_idf row keeps idf_norm 1 so it is neither favoured nor erased. A user with no
  -- genre scores keeps a floor of 0, so nothing changes for them.
  SELECT COALESCE(MAX(kv.value::NUMERIC * COALESCE(gi.idf_norm, 1)), 0) * v_genre_floor_ratio
  INTO v_genre_min_score
  FROM jsonb_each_text(v_genre_scores) AS kv
  LEFT JOIN public.genre_idf gi ON gi.genre_slug = kv.key;
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
                      WHEN COALESCE((v_genre_scores->>gi.genre_slug)::NUMERIC, 0) * gi.idf_norm >= v_genre_min_score
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
                         WHERE COALESCE((v_genre_scores->>gi.genre_slug)::NUMERIC, 0) * gi.idf_norm >= v_genre_min_score
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

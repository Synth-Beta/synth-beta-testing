-- =============================================================================
-- Feed v5: genre COVERAGE — stop one shared tag carrying a whole event
-- =============================================================================
-- REVIEW THIS, THEN APPLY IT YOURSELF. Nothing here is auto-applied.
-- Supersedes the genre_sum expression from 20260824000000_feed_v5_genre_idf.sql.
-- Everything else in get_personalized_feed_v5 is byte-identical to that file --
-- this migration was generated from it by substituting one CTE expression, not
-- retyped, so the following/recommended/trending structure, the relevance gate,
-- the artist-diversity cap, the 6.0/16.0/4.0 coefficients and the page assembly
-- are all unchanged. Postgres has no partial function edit, so the whole body is
-- restated regardless.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Reported live: a Christian-folk artist (Andrew Peterson, tags
-- ["christian","folk","indie"]) kept appearing in Recommended for a user with no
-- Christian-music affinity at all. Confirmed not to be filler -- that user has 64
-- genre keys and 73 artist keys, so `is_match` was genuinely TRUE.
--
-- Root cause: genre_sum was a FLAT SUM over matched tags. One overlapping tag was
-- enough to score the whole event, and there is no way in the formula to express
-- "indie yes, christian no":
--
--     SUM(score[slug] * idf_norm) / tag_count^0.25
--
-- An `indie` score alone carried the event. `christian` contributed nothing
-- negative because nothing in the model represents negative evidence. (Related,
-- and still open: the signal_type enum defines removal signals -- artist_unfollow,
-- event_interest_removed -- but ZERO rows exist for any of them and nothing in the
-- app ever logs one. Disliking something is currently unrepresentable.)
--
-- ── THE FIX ──────────────────────────────────────────────────────────────────
-- Scale genre_sum by the matched share of the event's total IDF mass:
--
--     coverage = SUM(idf_norm) WHERE user_score > 0
--              / SUM(idf_norm) over ALL of the event's tags
--
--     genre_sum = <old expression> * POWER(GREATEST(coverage, floor), exponent)
--
-- Andrew Peterson for that user: matched mass = idf(indie) only, total mass =
-- idf(christian) + idf(folk) + idf(indie), so coverage is roughly 1/3 and the
-- event scores about 0.58x what it used to at exponent 0.5. A genuinely
-- indie event tagged ["indie","indie-rock"] has coverage 1.0 and is untouched.
--
-- Tunable in the DECLARE block:
--   v_coverage_exponent = 0.5   -- 1.0 = full linear penalty, 0.0 = feature off
--   v_coverage_floor    = 0.15  -- multiplier bottoms out at ~0.39, not 0
--
-- ── THE KNOWN RISK, STATED PLAINLY ───────────────────────────────────────────
-- Coverage rewards SPARSELY TAGGED events: a 1-tag event that matches scores
-- coverage 1.0 automatically. That is the same failure mode that got SQRT damping
-- rejected in 20260824000000, where "tag sparsity tracks which artists nobody
-- enriched, not user taste" and obscure under-tagged acts floated to the top.
--
-- Two things bound it here. First, coverage only ever REDUCES a partial match --
-- it never boosts a sparse event in absolute terms, so a 1-tag event scores
-- exactly what it scored before. Second, the existing tag_count^0.25 damping is
-- retained, so a 6-broad-tag event still cannot win on volume alone. The residual
-- risk is relative: a thinly-tagged "indie" event now outranks a well-tagged
-- partially-matching one. Where that thin tagging is under-enrichment rather than
-- genuine purity, this will surface the wrong event. That is a data-coverage
-- problem (8,997 upcoming events carry no tags at all), not a formula problem,
-- but it is real and it is why the exponent is 0.5 rather than 1.0.
--
-- Shipping without the usual percentile dry-run at the user's explicit request.
-- STEP 3 below is the post-apply check that would otherwise have been the
-- pre-apply one -- run it.
-- =============================================================================

-- ── STEP 1: replace the function ────────────────────────────────────────────

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
        SELECT SUM(COALESCE((v_genre_scores->>gi.genre_slug)::NUMERIC, 0) * gi.idf_norm)
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
                         WHERE COALESCE((v_genre_scores->>gi.genre_slug)::NUMERIC, 0) > 0
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

-- ── STEP 2: MANDATORY cache invalidation ────────────────────────────────────
-- personalized_feed_cache.cache_key is md5(params) with NO model version in it,
-- so replacing the function invalidates NOTHING and the fix will look like a
-- complete no-op until these are cleared. This is a known trap from the
-- 2026-08-24 work -- do not skip it.
--
-- Note: the cache also holds the only record of each user's last lat/lng, so
-- clearing it breaks location-dependent diagnostics until real traffic
-- repopulates. That is expected and self-heals.
DELETE FROM public.personalized_feed_cache;
DELETE FROM public.feed_cache_refresh_queue;


-- ── STEP 3: verify against the reported case ────────────────────────────────
-- Read-only. Replace <YOUR_UUID> with the affected user id.
-- Shows the coverage arithmetic per tag for the Andrew Peterson events: your
-- score, the tag's IDF, and which tags count as matched. Expect `christian` at
-- score 0 and therefore excluded from matched mass.
WITH me AS (SELECT '<YOUR_UUID>'::uuid AS uid)
SELECT
  e.title,
  g.genre,
  gi.idf_norm,
  COALESCE((up.genre_preference_scores->>gi.genre_slug)::numeric, 0) AS your_score,
  COALESCE((up.genre_preference_scores->>gi.genre_slug)::numeric, 0) > 0 AS counts_as_matched
FROM public.events e
CROSS JOIN me
JOIN public.user_preferences up ON up.user_id = me.uid
CROSS JOIN LATERAL unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) AS g(genre)
JOIN public.genre_idf gi ON gi.genre_slug = public.genre_match_slug(g.genre)
WHERE e.title ILIKE '%Andrew Peterson%'
ORDER BY e.title, your_score DESC;

-- Aggregate coverage per event: what multiplier each event now gets.
WITH me AS (SELECT '<YOUR_UUID>'::uuid AS uid)
SELECT
  e.title,
  e.genres,
  ROUND(COALESCE(
    SUM(gi.idf_norm) FILTER (
      WHERE COALESCE((up.genre_preference_scores->>gi.genre_slug)::numeric, 0) > 0
    ) / NULLIF(SUM(gi.idf_norm), 0), 0), 3) AS coverage,
  ROUND(POWER(GREATEST(COALESCE(
    SUM(gi.idf_norm) FILTER (
      WHERE COALESCE((up.genre_preference_scores->>gi.genre_slug)::numeric, 0) > 0
    ) / NULLIF(SUM(gi.idf_norm), 0), 0), 0.15), 0.5), 3) AS score_multiplier
FROM public.events e
CROSS JOIN me
JOIN public.user_preferences up ON up.user_id = me.uid
CROSS JOIN LATERAL unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) AS g(genre)
JOIN public.genre_idf gi ON gi.genre_slug = public.genre_match_slug(g.genre)
WHERE e.event_date > now()
GROUP BY e.id, e.title, e.genres
ORDER BY coverage ASC
LIMIT 40;

-- Sanity check on the sparse-tag risk: are single-tag events now dominating?
-- Compare the tag-count distribution of what the feed returns before/after.
-- If 1-tag events jump sharply as a share of Recommended, lower
-- v_coverage_exponent (0.25) or raise v_coverage_floor.
WITH me AS (SELECT '<YOUR_UUID>'::uuid AS uid)
SELECT
  COALESCE(array_length(e.genres, 1), 0) AS tag_count,
  count(*) AS events_returned
FROM me, LATERAL public.get_personalized_feed_v5(me.uid, 'recommending', 50, 0) f
JOIN public.events e ON e.id = f.id
GROUP BY 1 ORDER BY 1;

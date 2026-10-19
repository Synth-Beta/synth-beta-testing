-- =============================================================================
-- Feed v5: artist exclusions, hide already-engaged events, review boost
-- =============================================================================
-- REVIEW THIS, THEN APPLY IT YOURSELF. Nothing here is auto-applied.
--
-- Supersedes 20261016120000. Same body except the changes marked
-- CHANGED (exclusions-reviews). The cache clear is at the bottom of this file,
-- so this is the only script to run.
--
-- -- WHAT ---------------------------------------------------------------------
-- 1. New table user_artist_exclusions: "don't recommend this artist to me".
--    Excluded artists are dropped from every section (following, recommending,
--    trending). Inserting/deleting a row clears that user's personalized_feed_cache
--    rows so the change shows up on the next load instead of after the TTL.
-- 2. Events the user already marked interested / going / maybe are no longer
--    returned. The feed is for discovery; those shows live on the profile/calendar.
--    (Following previously force-included going/maybe events; that branch is gone.)
-- 3. Reviews boost placement. Public, non-draft reviews are aggregated per artist and
--    per venue. Only above-average sentiment boosts (avg rating > 2.5 of 5), scaled by
--    LN(1 + review_count) so volume helps with diminishing returns:
--        review_boost = LN(1 + n) * GREATEST((avg - 2.5) / 2.5, 0)      -- 0 .. ~LN(1+n)
--    Recommending: total_weight += 5.0 * artist_boost + 3.0 * venue_boost
--    Trending:     ordered by total_count + 3.0 * artist_boost + 2.0 * venue_boost
--    The payload now carries artist/venue review_count + avg_rating for the cards.
-- =============================================================================

-- -- 0. Review engagement RPC ----------------------------------------------------
-- The web client calls get_review_engagement and was getting 404. The copy in
-- apps/admin queries public.user_reviews, which this project does not have.
-- This version reads public.reviews and the entities/engagements like check.

CREATE OR REPLACE FUNCTION public.get_review_engagement(
  review_id_param uuid,
  user_id_param uuid DEFAULT NULL
)
RETURNS TABLE (
  likes_count integer,
  comments_count integer,
  shares_count integer,
  is_liked_by_user boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(r.likes_count, 0)::integer,
    COALESCE(r.comments_count, 0)::integer,
    COALESCE(r.shares_count, 0)::integer,
    CASE
      WHEN user_id_param IS NULL THEN FALSE
      ELSE EXISTS (
        SELECT 1
        FROM public.entities e
        JOIN public.engagements g ON g.entity_id = e.id
        WHERE e.entity_type = 'review'
          AND e.entity_uuid = review_id_param
          AND g.engagement_type = 'like'
          AND g.user_id = user_id_param
      )
    END
  FROM public.reviews r
  WHERE r.id = review_id_param;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_review_engagement(uuid, uuid) TO authenticated, anon;

-- -- 1. Exclusions table --------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_artist_exclusions (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'home_feed',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, artist_id)
);

CREATE INDEX IF NOT EXISTS user_artist_exclusions_artist_idx
  ON public.user_artist_exclusions (artist_id);

ALTER TABLE public.user_artist_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own artist exclusions" ON public.user_artist_exclusions;
CREATE POLICY "Users read own artist exclusions"
  ON public.user_artist_exclusions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users add own artist exclusions" ON public.user_artist_exclusions;
CREATE POLICY "Users add own artist exclusions"
  ON public.user_artist_exclusions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users remove own artist exclusions" ON public.user_artist_exclusions;
CREATE POLICY "Users remove own artist exclusions"
  ON public.user_artist_exclusions FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.clear_feed_cache_on_artist_exclusion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.personalized_feed_cache
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_clear_feed_cache_on_artist_exclusion ON public.user_artist_exclusions;
CREATE TRIGGER trg_clear_feed_cache_on_artist_exclusion
  AFTER INSERT OR DELETE ON public.user_artist_exclusions
  FOR EACH ROW EXECUTE FUNCTION public.clear_feed_cache_on_artist_exclusion();

-- -- 2/3. Feed function -----------------------------------------------------------

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
  v_coverage_exponent NUMERIC := 0.5;
  v_coverage_floor NUMERIC := 0.15;
  v_genre_floor_ratio NUMERIC := 0.10;
  v_genre_min_score NUMERIC := 0;
  v_follow_max_miles NUMERIC := 250;
  v_follow_max_out_of_area INT := 3;
  v_radius NUMERIC := LEAST(COALESCE(NULLIF(p_radius_miles, 0), 50), 250);
  -- CHANGED (exclusions-reviews)
  v_excluded_artists UUID[];
  v_engaged_events UUID[];
  v_artist_review_weight NUMERIC := 5.0;
  v_venue_review_weight NUMERIC := 3.0;
  v_trending_artist_review_weight NUMERIC := 3.0;
  v_trending_venue_review_weight NUMERIC := 2.0;
BEGIN
  IF has_location THEN
    v_min_lat := p_city_lat - (v_radius / 69.0);
    v_max_lat := p_city_lat + (v_radius / 69.0);
    v_min_lng := p_city_lng - (v_radius / (69.0 * COS(RADIANS(p_city_lat))));
    v_max_lng := p_city_lng + (v_radius / (69.0 * COS(RADIANS(p_city_lat))));
  END IF;

  SELECT COALESCE(genre_preference_scores, '{}'), COALESCE(artist_preference_scores, '{}')
  INTO v_genre_scores, v_artist_scores
  FROM user_preferences WHERE user_id = p_user_id;
  v_genre_scores := COALESCE(v_genre_scores, '{}');
  v_artist_scores := COALESCE(v_artist_scores, '{}');

  SELECT COALESCE(MAX(kv.value::NUMERIC * COALESCE(gi.idf_norm, 1)), 0) * v_genre_floor_ratio
  INTO v_genre_min_score
  FROM jsonb_each_text(v_genre_scores) AS kv
  LEFT JOIN public.genre_idf gi ON gi.genre_slug = kv.key;
  v_genre_min_score := COALESCE(v_genre_min_score, 0);

  -- CHANGED (exclusions-reviews): resolved once; `<> ALL('{}')` is TRUE, so empty
  -- arrays exclude nothing.
  SELECT COALESCE(array_agg(x.artist_id), '{}')
  INTO v_excluded_artists
  FROM public.user_artist_exclusions x
  WHERE x.user_id = p_user_id;

  SELECT COALESCE(array_agg(DISTINCT uer.event_id), '{}')
  INTO v_engaged_events
  FROM public.user_event_relationships uer
  WHERE uer.user_id = p_user_id
    AND uer.relationship_type IN ('interested', 'going', 'maybe');

  RETURN QUERY
  WITH
  -- CHANGED (exclusions-reviews): review sentiment per artist / venue.
  artist_reviews AS (
    SELECT r.artist_id AS rid,
           COUNT(*)::INT AS n,
           AVG(COALESCE(r.artist_performance_rating, r.rating))::NUMERIC AS avg_rating
    FROM public.reviews r
    WHERE r.artist_id IS NOT NULL
      AND COALESCE(r.is_public, TRUE)
      AND NOT COALESCE(r.is_draft, FALSE)
      AND COALESCE(r.artist_performance_rating, r.rating) IS NOT NULL
    GROUP BY r.artist_id
  ),
  venue_reviews AS (
    SELECT r.venue_id AS rid,
           COUNT(*)::INT AS n,
           AVG(COALESCE(r.venue_rating, r.rating))::NUMERIC AS avg_rating
    FROM public.reviews r
    WHERE r.venue_id IS NOT NULL
      AND COALESCE(r.is_public, TRUE)
      AND NOT COALESCE(r.is_draft, FALSE)
      AND COALESCE(r.venue_rating, r.rating) IS NOT NULL
    GROUP BY r.venue_id
  ),
  artist_review_boost AS (
    SELECT ar.rid, ar.n, ar.avg_rating,
           LN(1.0 + ar.n) * GREATEST((ar.avg_rating - 2.5) / 2.5, 0) AS boost
    FROM artist_reviews ar
  ),
  venue_review_boost AS (
    SELECT vr.rid, vr.n, vr.avg_rating,
           LN(1.0 + vr.n) * GREATEST((vr.avg_rating - 2.5) / 2.5, 0) AS boost
    FROM venue_reviews vr
  ),

  -- CHANGED (exclusions-reviews): no more going/maybe branch; engaged events and
  -- excluded artists are filtered out here.
  following_union AS (
    SELECT e.id AS eid
    FROM events e
    WHERE e.artist_id IN (SELECT artist_id FROM artist_follows WHERE user_id = p_user_id)
      AND e.event_date BETWEEN min_ts AND max_ts

    UNION

    SELECT e.id AS eid
    FROM events e
    WHERE e.venue_id IN (SELECT venue_id FROM user_venue_relationships WHERE user_id = p_user_id)
      AND e.event_date BETWEEN min_ts AND max_ts
  ),

  following_candidates AS (
    SELECT fu.eid,
           CASE WHEN has_location AND e.latitude IS NOT NULL AND e.longitude IS NOT NULL
                THEN (69.0 * SQRT(
                        POWER((e.latitude - p_city_lat)::FLOAT8, 2)
                      + POWER((e.longitude - p_city_lng)::FLOAT8 * COS(RADIANS(p_city_lat)), 2)
                     ))::NUMERIC
           END AS dist_mi
    FROM following_union fu
    JOIN events e ON e.id = fu.eid
    WHERE e.id <> ALL (v_engaged_events)
      AND (e.artist_id IS NULL OR e.artist_id <> ALL (v_excluded_artists))
  ),

  following_tiered AS (
    SELECT fc.eid, fc.dist_mi,
           COALESCE(NOT has_location OR fc.dist_mi <= v_radius, FALSE) AS is_local
    FROM following_candidates fc
    WHERE NOT has_location
       OR fc.dist_mi IS NULL
       OR fc.dist_mi <= v_follow_max_miles
  ),

  following_raw AS (
    SELECT 'following'::TEXT AS sec, e.id AS eid, e.*, a.name AS aname, v.name AS vname,
           0::NUMERIC AS genre_weight,
           0::NUMERIC AS artist_weight,
           RANDOM() AS sample_key,
           ft.dist_mi, ft.is_local
    FROM events e
    LEFT JOIN artists a ON a.id = e.artist_id
    LEFT JOIN venues v ON v.id = e.venue_id
    INNER JOIN following_tiered ft ON ft.eid = e.id
  ),

  following_ranked AS (
    SELECT fr.*,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(fr.artist_id::TEXT, 'e-' || fr.eid::TEXT)
             ORDER BY fr.is_local DESC, fr.dist_mi NULLS LAST, fr.sample_key
           ) AS artist_rn
    FROM following_raw fr
  ),

  following_tier_numbered AS (
    SELECT fr.*,
           ROW_NUMBER() OVER (
             PARTITION BY fr.is_local
             ORDER BY fr.dist_mi NULLS LAST, fr.sample_key
           ) AS tier_rn
    FROM following_ranked fr
    WHERE fr.artist_rn = 1
  ),

  following AS (
    SELECT ftn.*
    FROM following_tier_numbered ftn
    WHERE ftn.is_local OR ftn.tier_rn <= v_follow_max_out_of_area
    ORDER BY ftn.is_local DESC,
             CASE WHEN ftn.is_local THEN ftn.sample_key END,
             ftn.dist_mi NULLS LAST
    LIMIT 25
  ),

  following_count AS (
    SELECT COUNT(*)::INT AS cnt FROM following
  ),

  event_scores AS (
    SELECT
      e.id AS eid,
      e.artist_id AS artist_id,
      GREATEST(COALESCE((
        SELECT SUM((CASE
                      WHEN COALESCE((v_genre_scores->>gi.genre_slug)::NUMERIC, 0) * gi.idf_norm >= v_genre_min_score
                      THEN COALESCE((v_genre_scores->>gi.genre_slug)::NUMERIC, 0)
                      ELSE 0
                    END) * gi.idf_norm)
               / POWER(GREATEST(COALESCE(array_length(e.genres, 1), 1), 1)::NUMERIC, 0.25)
               * POWER(
                   GREATEST(
                     COALESCE(
                       SUM(gi.idf_norm) FILTER (
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
      COALESCE(ep.total_count, 0) AS pop_count,
      -- CHANGED (exclusions-reviews)
      COALESCE(arb.boost, 0) AS artist_review_boost,
      COALESCE(vrb.boost, 0) AS venue_review_boost
    FROM events e
    LEFT JOIN event_popularity_scores ep ON ep.event_id = e.id
    LEFT JOIN artist_review_boost arb ON arb.rid = e.artist_id
    LEFT JOIN venue_review_boost vrb ON vrb.rid = e.venue_id
    WHERE e.event_date BETWEEN min_ts AND max_ts
      AND e.id NOT IN (SELECT eid FROM following)
      -- CHANGED (exclusions-reviews)
      AND e.id <> ALL (v_engaged_events)
      AND (e.artist_id IS NULL OR e.artist_id <> ALL (v_excluded_artists))
      AND (NOT has_location OR (
        e.latitude IS NOT NULL AND e.longitude IS NOT NULL
        AND e.latitude BETWEEN v_min_lat AND v_max_lat
        AND e.longitude BETWEEN v_min_lng AND v_max_lng
      ))
    LIMIT 2500
  ),

  event_weights AS (
    SELECT
      es.eid,
      es.artist_id,
      es.genre_sum,
      es.artist_sum,
      (6.0 * LN(1.0 + es.genre_sum)
        + 16.0 * LN(1.0 + es.artist_sum)
        + 4.0 * LN(1.0 + es.pop_count)
        -- CHANGED (exclusions-reviews)
        + v_artist_review_weight * es.artist_review_boost
        + v_venue_review_weight * es.venue_review_boost
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
    SELECT e.id AS eid,
           ROW_NUMBER() OVER (
             -- CHANGED (exclusions-reviews): well-reviewed artists/venues climb.
             ORDER BY COALESCE(ep.total_count, 0)
                        + v_trending_artist_review_weight * COALESCE(arb.boost, 0)
                        + v_trending_venue_review_weight * COALESCE(vrb.boost, 0) DESC,
                      COALESCE(ep.velocity_score, 0) DESC,
                      RANDOM()
           ) AS pop_rn
    FROM events e
    LEFT JOIN event_popularity_scores ep ON ep.event_id = e.id
    LEFT JOIN artist_review_boost arb ON arb.rid = e.artist_id
    LEFT JOIN venue_review_boost vrb ON vrb.rid = e.venue_id
    WHERE e.event_date BETWEEN min_ts AND max_ts
      AND e.id NOT IN (SELECT eid FROM following)
      AND e.id NOT IN (SELECT eid FROM recommended)
      -- CHANGED (exclusions-reviews)
      AND e.id <> ALL (v_engaged_events)
      AND (e.artist_id IS NULL OR e.artist_id <> ALL (v_excluded_artists))
      AND (NOT has_location OR (
        e.latitude IS NOT NULL AND e.longitude IS NOT NULL
        AND e.latitude BETWEEN v_min_lat AND v_max_lat
        AND e.longitude BETWEEN v_min_lng AND v_max_lng
      ))
    ORDER BY pop_rn
    LIMIT 300
  ),

  trending_raw AS (
    SELECT 'trending'::TEXT AS sec, e.id AS eid, e.*, a.name AS aname, v.name AS vname,
           0::NUMERIC AS genre_weight,
           0::NUMERIC AS artist_weight,
           tc.pop_rn::FLOAT8 AS sample_key
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
    SELECT *, ROW_NUMBER() OVER (ORDER BY genre_weight DESC, RANDOM()) AS rn FROM recommended
  ),
  fol_numbered AS (
    SELECT *, ROW_NUMBER() OVER (
      ORDER BY is_local DESC, CASE WHEN is_local THEN sample_key END, dist_mi NULLS LAST
    ) AS rn FROM following
  ),
  tre_numbered AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY sample_key) AS rn FROM trending
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
      'event_media_url', f.event_media_url,
      -- CHANGED (exclusions-reviews)
      'artist_review_count', COALESCE(arb.n, 0),
      'artist_avg_rating', ROUND(arb.avg_rating, 1),
      'venue_review_count', COALESCE(vrb.n, 0),
      'venue_avg_rating', ROUND(vrb.avg_rating, 1)
    ) AS payload,
    jsonb_build_object(
      'event_type', f.sec,
      'genre_weight', f.genre_weight,
      'artist_weight', f.artist_weight,
      'page_num', f.page_num
    ) AS context
  FROM final_ordered f
  LEFT JOIN artist_review_boost arb ON arb.rid = f.artist_id
  LEFT JOIN venue_review_boost vrb ON vrb.rid = f.venue_id
  ORDER BY f.final_pos
  OFFSET p_offset
  LIMIT p_limit;
END;
$function$;

-- Cached feeds ignore the new ranking until their TTL. This table is derived.
DELETE FROM public.personalized_feed_cache;
DELETE FROM public.feed_cache_refresh_queue;

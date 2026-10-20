-- =============================================================================
-- Feed v5: just-announced folded into the normal groups + small Pick5 trending lift
-- =============================================================================
-- Replaces get_personalized_feed_v5 from 20261019120000_feed_v5_exclusions_reviews.sql
-- (live). Same body except the blocks marked CHANGED (announced-in-groups).
--
-- WHY: the apps wove a separate "just announced" shelf (get_just_announced_events)
-- into the feed with its own badge, so genre-only matches looked like "your artist
-- just announced". Same rules as 20261017130000 / notify_just_announced, but inside
-- the normal feed instead of a shelf. "New" = JamBase first listed it in the last
-- 10 days (events.announced_at = event.datePublished, plus the created_at guard).
--
--                                                   Alerts   Feed
--   Followed / bucket-list artist, new show nearby    yes    pinned at the top (max 6,
--                                                            newest first), badged
--                                                            (context.just_announced)
--   Matches taste (listening/artist scores, genres)   no     in Recommending, weight x1.5
--                                                            so stronger matches rise; no badge
--   New nearby, no taste match                        no     nothing special (Trending as usual)
--
-- Pick5 partner artists get a small lift inside Trending only (no fixed slots).
--
-- Run this in the Supabase SQL editor. The cache clear at the bottom is part of it.
-- ROLLBACK: re-run the function block of 20261019120000_feed_v5_exclusions_reviews.sql.
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
  -- CHANGED (announced-in-groups)
  v_fresh_since TIMESTAMPTZ := NOW() - INTERVAL '10 days';
  v_fresh_synced_since TIMESTAMPTZ := NOW() - INTERVAL '11 days';
  v_pin_artists UUID[];
  v_max_pinned INT := 6;
  v_fresh_match_multiplier NUMERIC := 1.5;
  -- Keep in step with src/components/home/thread/pick5.ts (PICK5_BANDS).
  v_pick5_artist_names TEXT[] := ARRAY['goose', 'billy strings', 'widespread panic', 'phish'];
  v_pick5_trending_boost NUMERIC := 5.0;
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

  -- CHANGED (announced-in-groups): artists whose new shows get pinned. Same fan set
  -- as notify_just_announced (follows + bucket list).
  SELECT COALESCE(array_agg(DISTINCT x.artist_id), '{}')
  INTO v_pin_artists
  FROM (
    SELECT f.artist_id FROM public.artist_follows f WHERE f.user_id = p_user_id
    UNION
    SELECT en.entity_uuid
    FROM public.bucket_list b
    JOIN public.entities en ON en.id = b.entity_id AND en.entity_type = 'artist'
    WHERE b.user_id = p_user_id
  ) x
  WHERE x.artist_id IS NOT NULL;

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
             -- CHANGED (announced-in-groups): a followed artist's new local show wins
             -- the one-per-artist slot over their older dates.
             ORDER BY fr.is_local DESC,
                      (fr.announced_at > v_fresh_since AND fr.created_at > v_fresh_synced_since) DESC NULLS LAST,
                      fr.dist_mi NULLS LAST, fr.sample_key
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

  -- CHANGED (announced-in-groups): new local shows by bucket-list artists that aren't
  -- followed (followed ones are already in `following`). One per artist, soonest show.
  fresh_bucket_ranked AS (
    SELECT 'recommending'::TEXT AS sec, e.id AS eid, e.*, a.name AS aname, v.name AS vname,
           0::NUMERIC AS genre_weight,
           0::NUMERIC AS artist_weight,
           ROW_NUMBER() OVER (PARTITION BY e.artist_id ORDER BY e.event_date) AS artist_rn
    FROM events e
    LEFT JOIN artists a ON a.id = e.artist_id
    LEFT JOIN venues v ON v.id = e.venue_id
    WHERE e.announced_at > v_fresh_since
      AND e.created_at > v_fresh_synced_since
      AND e.event_date BETWEEN min_ts AND max_ts
      AND e.artist_id = ANY (v_pin_artists)
      AND e.artist_id NOT IN (SELECT artist_id FROM following WHERE artist_id IS NOT NULL)
      AND e.id <> ALL (v_engaged_events)
      AND e.artist_id <> ALL (v_excluded_artists)
      AND (NOT has_location OR (
        e.latitude IS NOT NULL AND e.longitude IS NOT NULL
        AND e.latitude BETWEEN v_min_lat AND v_max_lat
        AND e.longitude BETWEEN v_min_lng AND v_max_lng
      ))
  ),

  fresh_bucket AS (
    SELECT * FROM fresh_bucket_ranked WHERE artist_rn = 1
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
      COALESCE(vrb.boost, 0) AS venue_review_boost,
      -- CHANGED (announced-in-groups)
      COALESCE(e.announced_at > v_fresh_since AND e.created_at > v_fresh_synced_since, FALSE) AS is_fresh
    FROM events e
    LEFT JOIN event_popularity_scores ep ON ep.event_id = e.id
    LEFT JOIN artist_review_boost arb ON arb.rid = e.artist_id
    LEFT JOIN venue_review_boost vrb ON vrb.rid = e.venue_id
    WHERE e.event_date BETWEEN min_ts AND max_ts
      AND e.id NOT IN (SELECT eid FROM following)
      -- CHANGED (announced-in-groups)
      AND e.id NOT IN (SELECT eid FROM fresh_bucket)
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
      )
      -- CHANGED (announced-in-groups): a new show that matches taste rises in
      -- proportion to how strong the match is. No match, no lift.
      * CASE WHEN es.is_fresh AND (es.genre_sum > 0 OR es.artist_sum > 0)
             THEN v_fresh_match_multiplier ELSE 1 END
      AS total_weight,
      es.artist_sum AS artist_weight
    FROM event_scores es
  ),

  recommended_sampled AS (
    SELECT ew.eid, ew.artist_id, ew.total_weight, ew.artist_weight,
           (ew.genre_sum > 0 OR ew.artist_sum > 0) AS is_match,
           -LN(RANDOM() + 0.0001) / GREATEST(ew.total_weight, 0.05) AS sample_key
    FROM event_weights ew
    WHERE ew.artist_id IS NULL
       OR ew.artist_id NOT IN (
            SELECT artist_id FROM following WHERE artist_id IS NOT NULL
            -- CHANGED (announced-in-groups)
            UNION
            SELECT artist_id FROM fresh_bucket WHERE artist_id IS NOT NULL
          )
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
                        + v_trending_venue_review_weight * COALESCE(vrb.boost, 0)
                        -- CHANGED (announced-in-groups): Pick5 partner lift.
                        + CASE WHEN lower(trim(ta.name)) = ANY (v_pick5_artist_names)
                               THEN v_pick5_trending_boost ELSE 0 END DESC,
                      COALESCE(ep.velocity_score, 0) DESC,
                      RANDOM()
           ) AS pop_rn
    FROM events e
    LEFT JOIN artists ta ON ta.id = e.artist_id
    LEFT JOIN event_popularity_scores ep ON ep.event_id = e.id
    LEFT JOIN artist_review_boost arb ON arb.rid = e.artist_id
    LEFT JOIN venue_review_boost vrb ON vrb.rid = e.venue_id
    WHERE e.event_date BETWEEN min_ts AND max_ts
      AND e.id NOT IN (SELECT eid FROM following)
      AND e.id NOT IN (SELECT eid FROM recommended)
      -- CHANGED (announced-in-groups)
      AND e.id NOT IN (SELECT eid FROM fresh_bucket)
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
            -- CHANGED (announced-in-groups)
            UNION
            SELECT artist_id FROM fresh_bucket WHERE artist_id IS NOT NULL
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
           announced_at,
           FALSE AS pin_candidate,
           ((rn - 1) / 10)::INT AS page_num,
           RANDOM() AS rand_within_page
    FROM rec_numbered

    UNION ALL

    SELECT sec, eid, title, artist_id, venue_id, event_date, doors_time, description, genres,
           latitude, longitude, ticket_urls, ticket_available, price_range, price_min, price_max,
           is_promoted, promotion_tier, media_urls, event_media_url, venue_city, venue_state,
           venue_address, venue_zip, aname, vname, genre_weight, artist_weight,
           announced_at,
           COALESCE(is_local AND announced_at > v_fresh_since AND created_at > v_fresh_synced_since
                    AND artist_id = ANY (v_pin_artists), FALSE) AS pin_candidate,
           ((rn - 1) / 5)::INT AS page_num,
           RANDOM() AS rand_within_page
    FROM fol_numbered

    UNION ALL

    SELECT sec, eid, title, artist_id, venue_id, event_date, doors_time, description, genres,
           latitude, longitude, ticket_urls, ticket_available, price_range, price_min, price_max,
           is_promoted, promotion_tier, media_urls, event_media_url, venue_city, venue_state,
           venue_address, venue_zip, aname, vname, genre_weight, artist_weight,
           announced_at,
           FALSE AS pin_candidate,
           ((rn - 1) / 5)::INT AS page_num,
           RANDOM() AS rand_within_page
    FROM tre_numbered

    -- CHANGED (announced-in-groups)
    UNION ALL

    SELECT sec, eid, title, artist_id, venue_id, event_date, doors_time, description, genres,
           latitude, longitude, ticket_urls, ticket_available, price_range, price_min, price_max,
           is_promoted, promotion_tier, media_urls, event_media_url, venue_city, venue_state,
           venue_address, venue_zip, aname, vname, genre_weight, artist_weight,
           announced_at,
           TRUE AS pin_candidate,
           0 AS page_num,
           RANDOM() AS rand_within_page
    FROM fresh_bucket
  ),

  -- CHANGED (announced-in-groups): up to v_max_pinned new shows from the user's own
  -- artists open the feed, newest announcement first. Extras stay in their normal page.
  pin_ranked AS (
    SELECT awp.*,
           awp.pin_candidate AND ROW_NUMBER() OVER (
             PARTITION BY awp.pin_candidate ORDER BY awp.announced_at DESC NULLS LAST, awp.event_date
           ) <= v_max_pinned AS is_pinned
    FROM all_with_page awp
  ),

  final_ordered AS (
    SELECT *,
           ROW_NUMBER() OVER (
             ORDER BY is_pinned DESC,
                      CASE WHEN is_pinned THEN announced_at END DESC NULLS LAST,
                      page_num, rand_within_page
           ) AS final_pos
    FROM pin_ranked
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
      -- CHANGED (announced-in-groups)
      'announced_at', f.announced_at,
      -- CHANGED (exclusions-reviews)
      'artist_review_count', COALESCE(arb.n, 0),
      'artist_avg_rating', ROUND(arb.avg_rating, 1),
      'venue_review_count', COALESCE(vrb.n, 0),
      'venue_avg_rating', ROUND(vrb.avg_rating, 1)
    ) AS payload,
    jsonb_build_object(
      'event_type', f.sec,
      -- CHANGED (announced-in-groups)
      'just_announced', f.is_pinned,
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

-- Feed personalization: genre specificity (IDF) + slug normalisation (2026-08-24)
--
-- Follows 20260823000000_feed_v5_relevance_gate.sql, which stopped the
-- recommended section from being filled with zero-match events. That fix
-- worked (9/10 sampled users went to 0% unrelated) but exposed the next
-- problem: with the noise gone, what remains is matched on GENRE ALONE, and
-- genre was being matched badly in two separate ways.
--
-- MEASURED FIRST (live, 2026-08-24, 86k upcoming events; see the DIAGNOSTIC
-- and PREVIEW files alongside this one for the exact queries and outputs).
--
-- PROBLEM 1 -- artist matching cannot carry the feed, so genre has to
-- ------------------------------------------------------------------
-- Sampled the 15 heaviest-signal users: median 8 scored artists each, of which
-- 0-2 have a show inside the 90-day local window. Exact-artist matching is
-- structurally capped at roughly 1 of 50-75 recommended slots, which is
-- exactly the artist_matched_rows observed. The 16.0 artist coefficient has
-- almost nothing to fire on. Genre is doing effectively all the work, so genre
-- being coarse is not a minor calibration issue -- it is the whole ranking.
--
-- PROBLEM 2 -- tags are not consistently slugged, so some never match at all
-- -------------------------------------------------------------------------
-- events.genres contains BOTH slug and non-slug forms as distinct tags:
--     indie-rock  1339   vs  indie rock  655
--     hip-hop-rap 5713   vs  hip hop     413
--     rock       19597   vs  Rock        358
-- The live variant expression tried [genre, LOWER(genre), REPLACE(genre,' ','')],
-- so "indie rock" was tested as "indie rock", "indie rock", "indierock" --
-- never "indie-rock", the form user_preferences.genre_preference_scores is
-- keyed by since genre-pipeline-2026-08-20/01. Those events were invisible to
-- genre personalisation entirely. ("Rock" worked, because LOWER covers case
-- but not separators.) genre_match_slug() already exists from that migration;
-- it was deliberately left out of this function then to keep the blast radius
-- small. Adopting it here is the whole fix for problem 2.
--
-- PROBLEM 3 -- every tag counts equally, so breadth beats accuracy
-- ---------------------------------------------------------------
-- Genre score was a flat SUM over the event's tags. 'rock' covers 22.7% of
-- upcoming events (IDF 1.48); 'jamband' covers 1.4% (IDF 4.25). They counted
-- the same. Worse, an event with 6 broad tags outscored an event with 1 exact
-- tag purely by having more terms in the sum.
--
-- Measured on the heaviest jam-band user in prod, the CURRENT top of their
-- recommended pool was:
--     Jeff Rosenstock  (folk,indie,indie-rock,pop,punk,rock)   78.0
--     MINA             (italian,pop,rock,jazz,blues)           77.0
--     Judah & The Lion (bluegrass,folk,indie,pop,rock)         74.9
--     Beth Orton       (country-music,folk,indie,...,rock)     73.6
-- None of those are jam bands. They won on tag count. Under the new scoring
-- the top becomes Little Feat, Tedeschi Trucks Band, North Mississippi
-- Allstars, Dogs In A Pile, Melvin Seals & JGB -- and Rosenstock/Orton fall to
-- roughly a third of the leaders' score. This is the "recommended shows me
-- artists unrelated to what I listen to" complaint, reproduced and closed.
--
-- THE FIX
-- -------
--   genre_sum = SUM( user_score[genre_match_slug(tag)] * idf_norm[tag] )
--               / tag_count ^ 0.25
--
-- idf_norm: IDF divided by the OCCURRENCE-weighted mean IDF -- not the mean
-- over distinct genres, which the long tail of ultra-rare tags would drag up,
-- shrinking every common genre and silently decalibrating the 6.0 coefficient.
-- Occurrence-weighting puts a typical tag on a typical event at idf_norm ~ 1.0,
-- so overall genre_sum magnitude stays in the same range as before and the
-- 6.0/16.0/4.0 coefficients from 20260703000008 and 20260802120000 are left
-- alone deliberately. No silent recalibration.
--
-- tag_count ^ 0.25, NOT sqrt: chosen from the measured comparison, not taste.
-- sqrt damping ranked pure single-tag events above everything, which sounds
-- like a purity preference but is actually a data-quality artifact -- tag
-- sparsity tracks which artists nobody enriched, not what the user likes. It
-- promoted obscure under-tagged acts over well-tagged relevant ones. ^0.25
-- keeps the multi-tag inflation fix (a 6-broad-tag event still loses decisively
-- to an exact match) without inverting the ranking in favour of thin metadata.
-- Q2 showed multi-tag inflation is mild anyway -- only ~3.9k of 86k upcoming
-- events carry 5+ tags -- so gentle damping is sufficient.
--
-- KNOWN, NOT FIXED HERE
-- ---------------------
--   * 8,997 upcoming events carry ZERO genre tags and can never match on
--     genre. They can only reach the feed via the popularity term or as
--     unmatched backfill. That is an enrichment problem, not a ranker one.
--   * The candidate CTE still ends in a bare LIMIT 2500 with no ORDER BY, so
--     the pool is an arbitrary scan-order slice. Unchanged from the previous
--     migration's note; still the next structural fix.
--   * One user (349bda34) has 48 scored artists of which only 6 resolve to a
--     real artists.id -- 42 dead keys, likely unresolved streaming-provider
--     artist ids written straight into entity_id. Isolated to that user in the
--     sample; tracked separately.
--
-- Everything in get_personalized_feed_v5 other than the genre_sum expression
-- is byte-identical to 20260823000000 -- same signature, same output columns,
-- same relevance gate, same following/recommended/trending structure, same
-- artist-diversity cap, same trending sort, same page assembly. Postgres has
-- no partial function edit, so the whole body is restated.

-- ── Part A: genre IDF ──────────────────────────────────────────────────────

-- 180-day window rather than the feed's 90: a wider window gives a more stable
-- frequency estimate and stops IDF from lurching when a big touring block
-- lands. Genre distribution moves slowly, so a daily refresh is plenty.
DROP MATERIALIZED VIEW IF EXISTS public.genre_idf;

CREATE MATERIALIZED VIEW public.genre_idf AS
WITH upcoming AS (
  SELECT e.id, e.genres
  FROM public.events e
  WHERE e.event_date BETWEEN now() AND now() + INTERVAL '180 days'
),
tot AS (
  SELECT GREATEST(COUNT(*), 1)::NUMERIC AS n FROM upcoming
),
freq AS (
  SELECT public.genre_match_slug(g.genre) AS genre_slug,
         COUNT(*)::NUMERIC AS event_count
  FROM upcoming u
  CROSS JOIN LATERAL unnest(COALESCE(u.genres, ARRAY[]::TEXT[])) AS g(genre)
  WHERE public.genre_match_slug(g.genre) IS NOT NULL
  GROUP BY 1
)
SELECT
  f.genre_slug,
  f.event_count::INT AS event_count,
  LN((SELECT n FROM tot) / f.event_count) AS idf_raw,
  -- Divide by the occurrence-weighted mean IDF so a typical tag lands at ~1.0.
  LN((SELECT n FROM tot) / f.event_count)
    / NULLIF(
        SUM(LN((SELECT n FROM tot) / f.event_count) * f.event_count) OVER ()
        / NULLIF(SUM(f.event_count) OVER (), 0),
      0) AS idf_norm
FROM freq f;

-- UNIQUE index is required for REFRESH ... CONCURRENTLY, and doubles as the
-- lookup index the feed function needs.
CREATE UNIQUE INDEX genre_idf_slug_uidx ON public.genre_idf (genre_slug);

GRANT SELECT ON public.genre_idf TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_genre_idf()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.genre_idf;
END;
$function$;

-- Daily at 08:10 UTC, offset from the existing feed-cache and popularity jobs
-- so they do not contend.
SELECT cron.unschedule('genre-idf-refresh')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'genre-idf-refresh');

SELECT cron.schedule(
  'genre-idf-refresh',
  '10 8 * * *',
  $$SELECT public.refresh_genre_idf();$$
);

-- ── Part B: get_personalized_feed_v5 ───────────────────────────────────────

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

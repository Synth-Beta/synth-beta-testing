-- Feed personalization: time decay + real popularity signal (2026-08-02)
--
-- Two gaps identified and verified against live prod data (read-only dry-runs
-- before writing this file, same methodology as 20260703000008):
--
-- A) NO TIME DECAY. refresh_user_preferences_v5 computed genre/artist/venue
--    preference scores as a flat sum(signal_weight) over ALL of
--    user_preference_signals, with zero reference to occurred_at -- a
--    permanent running total. user_preference_signals has no unique
--    constraint (PK on id only), so every repeated signal (a view, a search)
--    just keeps accumulating forever.
--    Bonus finding: the signal_type enum defines removal signals
--    (artist_unfollow, event_interest_removed, etc.) but ZERO rows exist for
--    any of them in prod and nothing in the app ever logs one -- so
--    unfollowing an artist today never reduces their accumulated score.
--    Decay partially self-heals this even without fixing that gap.
--
-- B) NO POPULARITY SIGNAL. events has zero count columns. The "trending"
--    section of get_personalized_feed_v5 was ORDER BY event_date DESC +
--    RANDOM() -- recently-added events, shuffled. Not actually trending.
--
-- Half-lives (Part A) were chosen from the REAL signal_type distribution in
-- prod, not guessed. First pass used 45 days for interest/event_interest and
-- produced a bad result verified via dry-run: event_interest averages 294
-- days old in this data and retained just 1.1% of its weight -- erasing
-- nearly a year of interest signal overnight instead of gently discounting
-- it. Widened that tier to 90 days: event_interest now retains 10.2%,
-- interest retains 33.6% -- meaningful discount, not erasure. Verified per-
-- user impact: 12/15 sampled users kept the same #1 genre after decay (lower
-- absolute score, same rank -- expected, ranking is relative), 3/15 flipped
-- to a more recently-signaled genre, and the heaviest user in prod (Jam Band,
-- raw sum 225.5) stayed #1 at a decayed 53.2 -- durable taste survives decay,
-- stale taste doesn't dominate it.
--
-- Popularity (Part B) was ALSO cut down from the original design after a
-- dry-run against real data: relationship_type in user_event_relationships
-- has ONLY ever been 'interested' in prod (no going/maybe rows exist), app-
-- wide weekly volume is 1-11 marks, and the single most-interested-in event
-- of all time has a total of 6. A 48h-recent-vs-48h-prior velocity window
-- (the original "40 saves yesterday vs 200 over 6 months" design) verified
-- to ZERO for every single event today -- there is no day with that kind of
-- volume yet. Shipping that as the primary trending sort would have been a
-- formula that always evaluates to 0, doing nothing.
-- What ships instead: a magnitude term (LN(1+total_count)) that IS real
-- signal today (differentiates the 6-interested event from the 125 one-
-- interested events), plus the velocity infrastructure (table, refresh
-- function, cron) built with a wider 14-day/14-day window so it can start
-- contributing real signal as interaction volume grows, without needing
-- another migration -- but it is not expected to move rankings much yet at
-- today's volume, and "trending" is ordered by total_count first with
-- velocity as a tiebreaker, not the other way around.
--
-- Nothing else about either function changes: same signatures, same output
-- columns, same 3-section following/recommended/trending structure, same
-- artist-diversity cap and calibration approach from 20260703000008.

-- ── Part A: decay helper + refresh_user_preferences_v5 ──────────────────────

CREATE OR REPLACE FUNCTION public.decay_weight(p_signal_type text, p_signal_weight numeric, p_occurred_at timestamptz)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_signal_weight * exp(
    -ln(2) * extract(epoch from (now() - p_occurred_at)) / 86400.0 /
    (CASE
      WHEN p_signal_type IN ('view','artist_search','event_search','venue_search','genre_search','streaming_profile_synced') THEN 14
      WHEN p_signal_type IN ('interest','event_interest','save','bucket_list') THEN 90
      WHEN p_signal_type IN ('genre_manual_preference','artist_manual_preference','venue_manual_preference') THEN 180
      WHEN p_signal_type IN ('follow','artist_follow','venue_follow') THEN 365
      WHEN p_signal_type LIKE 'review%' OR p_signal_type LIKE 'event_review%'
        OR p_signal_type IN ('event_attendance','attendance','artist_review','venue_review') THEN 730
      WHEN p_signal_type IN ('streaming_top_track_short','streaming_top_artist_short') THEN 30
      WHEN p_signal_type IN ('streaming_top_track_medium','streaming_top_artist_medium') THEN 120
      WHEN p_signal_type IN ('streaming_top_track_long','streaming_top_artist_long','streaming_recent_play','streaming_setlist_add') THEN 365
      WHEN p_signal_type IN ('spotify_genre','apple_music_genre') THEN 180
      ELSE 90
    END)
  );
$$;

CREATE OR REPLACE FUNCTION public.refresh_user_preferences_v5(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  WITH users_to_refresh AS (
    SELECT DISTINCT ups.user_id AS uid
    FROM public.user_preference_signals ups
    WHERE p_user_id IS NULL OR ups.user_id = p_user_id
  ),
  sig_stats AS (
    SELECT
      ups.user_id,
      max(ups.occurred_at) AS last_signal_at,
      count(*)::integer AS signal_count
    FROM public.user_preference_signals ups
    JOIN users_to_refresh u ON u.uid = ups.user_id
    GROUP BY ups.user_id
  ),
  -- Resolve each signal's genre to canonical name (genres.name) so "pop"/"Pop"/"jamband"/"Jam Band" collapse
  genre_by_user AS (
    SELECT
      ups.user_id,
      COALESCE(public.resolve_genre_to_canonical(ups.genre), ups.genre) AS canonical_genre,
      sum(public.decay_weight(ups.signal_type::text, ups.signal_weight, ups.occurred_at))::numeric AS score
    FROM public.user_preference_signals ups
    JOIN users_to_refresh u ON u.uid = ups.user_id
    WHERE ups.genre IS NOT NULL
    GROUP BY ups.user_id, COALESCE(public.resolve_genre_to_canonical(ups.genre), ups.genre)
  ),
  genre_agg AS (
    SELECT
      user_id,
      jsonb_object_agg(canonical_genre, score) AS scores,
      (SELECT array_agg(g.canonical_genre ORDER BY g.score DESC) FROM (
        SELECT canonical_genre, score FROM genre_by_user g2 WHERE g2.user_id = genre_by_user.user_id ORDER BY score DESC LIMIT 20
      ) g) AS top_list
    FROM genre_by_user
    GROUP BY user_id
  ),
  artist_by_user AS (
    SELECT user_id, entity_id, sum(public.decay_weight(ups.signal_type::text, ups.signal_weight, ups.occurred_at))::numeric AS score
    FROM public.user_preference_signals ups
    JOIN users_to_refresh u ON u.uid = ups.user_id
    WHERE ups.entity_type = 'artist' AND ups.entity_id IS NOT NULL
    GROUP BY ups.user_id, ups.entity_id
  ),
  artist_agg AS (
    SELECT
      user_id,
      jsonb_object_agg(entity_id::text, score) AS scores,
      (SELECT array_agg(a.entity_id ORDER BY a.score DESC) FROM (
        SELECT entity_id, score FROM artist_by_user a2 WHERE a2.user_id = artist_by_user.user_id ORDER BY score DESC LIMIT 50
      ) a) AS top_list
    FROM artist_by_user
    GROUP BY user_id
  ),
  venue_by_user AS (
    SELECT user_id, entity_id, sum(public.decay_weight(ups.signal_type::text, ups.signal_weight, ups.occurred_at))::numeric AS score
    FROM public.user_preference_signals ups
    JOIN users_to_refresh u ON u.uid = ups.user_id
    WHERE ups.entity_type = 'venue' AND ups.entity_id IS NOT NULL
    GROUP BY ups.user_id, ups.entity_id
  ),
  venue_agg AS (
    SELECT
      user_id,
      jsonb_object_agg(entity_id::text, score) AS scores,
      (SELECT array_agg(v.entity_id ORDER BY v.score DESC) FROM (
        SELECT entity_id, score FROM venue_by_user v2 WHERE v2.user_id = venue_by_user.user_id ORDER BY score DESC LIMIT 50
      ) v) AS top_list
    FROM venue_by_user
    GROUP BY user_id
  ),
  combined AS (
    SELECT
      u.uid AS user_id,
      ss.last_signal_at,
      ss.signal_count,
      COALESCE(ga.scores, '{}'::jsonb) AS genre_preference_scores,
      COALESCE(ga.top_list, '{}'::text[]) AS top_genres,
      COALESCE(aa.scores, '{}'::jsonb) AS artist_preference_scores,
      COALESCE(aa.top_list, '{}'::uuid[]) AS top_artists,
      COALESCE(va.scores, '{}'::jsonb) AS venue_preference_scores,
      COALESCE(va.top_list, '{}'::uuid[]) AS top_venues
    FROM users_to_refresh u
    LEFT JOIN sig_stats ss ON ss.user_id = u.uid
    LEFT JOIN genre_agg ga ON ga.user_id = u.uid
    LEFT JOIN artist_agg aa ON aa.user_id = u.uid
    LEFT JOIN venue_agg va ON va.user_id = u.uid
  )
  INSERT INTO public.user_preferences (
    user_id, genre_preference_scores, artist_preference_scores, venue_preference_scores,
    top_genres, top_artists, top_venues, last_signal_at, signal_count, last_computed_at, updated_at
  )
  SELECT
    c.user_id, c.genre_preference_scores, c.artist_preference_scores, c.venue_preference_scores,
    c.top_genres, c.top_artists, c.top_venues, c.last_signal_at, COALESCE(c.signal_count, 0), now(), now()
  FROM combined c
  ON CONFLICT (user_id) DO UPDATE SET
    genre_preference_scores = EXCLUDED.genre_preference_scores,
    artist_preference_scores = EXCLUDED.artist_preference_scores,
    venue_preference_scores = EXCLUDED.venue_preference_scores,
    top_genres = EXCLUDED.top_genres,
    top_artists = EXCLUDED.top_artists,
    top_venues = EXCLUDED.top_venues,
    last_signal_at = EXCLUDED.last_signal_at,
    signal_count = EXCLUDED.signal_count,
    last_computed_at = now(),
    updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- ── Part B: event popularity (magnitude now, velocity future-proofed) ───────

CREATE TABLE IF NOT EXISTS public.event_popularity_scores (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  total_count integer NOT NULL DEFAULT 0,
  recent_count integer NOT NULL DEFAULT 0,
  prior_count integer NOT NULL DEFAULT 0,
  velocity_score numeric NOT NULL DEFAULT 0,
  last_computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_event_relationships_event_type_created_idx
  ON public.user_event_relationships (event_id, relationship_type, created_at);

-- Bounded to events the feed could actually surface (get_personalized_feed_v5
-- defaults to p_include_past 30 days back / p_max_days_ahead 90 forward) so
-- this stays cheap regardless of total historical events table size.
CREATE OR REPLACE FUNCTION public.refresh_event_popularity()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  WITH pop AS (
    SELECT
      uer.event_id,
      count(*) AS total_count,
      count(*) FILTER (WHERE uer.created_at > now() - interval '14 days') AS recent_count,
      count(*) FILTER (WHERE uer.created_at BETWEEN now() - interval '28 days' AND now() - interval '14 days') AS prior_count
    FROM public.user_event_relationships uer
    JOIN public.events e ON e.id = uer.event_id
    WHERE uer.relationship_type IN ('interested', 'going', 'maybe')
      AND e.event_date BETWEEN now() - interval '7 days' AND now() + interval '90 days'
    GROUP BY uer.event_id
  )
  INSERT INTO public.event_popularity_scores (event_id, total_count, recent_count, prior_count, velocity_score, last_computed_at)
  SELECT
    p.event_id, p.total_count, p.recent_count, p.prior_count,
    (p.recent_count::numeric / (p.prior_count + 1.0)), now()
  FROM pop p
  ON CONFLICT (event_id) DO UPDATE SET
    total_count = EXCLUDED.total_count,
    recent_count = EXCLUDED.recent_count,
    prior_count = EXCLUDED.prior_count,
    velocity_score = EXCLUDED.velocity_score,
    last_computed_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- Backfill immediately so the table isn't empty until the first cron tick.
SELECT public.refresh_event_popularity();

-- Every 5 minutes, matching the cadence of the existing feed-cache-drain/
-- feed-cache-prewarm jobs already scheduled in cron.job.
SELECT cron.schedule(
  'event-popularity-refresh',
  '*/5 * * * *',
  $$SELECT public.refresh_event_popularity();$$
);

-- ── get_personalized_feed_v5: add popularity term, fix "trending" to mean it ─

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

  -- total_weight = 1.0 + 6*ln(1+genre_sum) + 16*ln(1+artist_score) + 4*ln(1+total_count)
  -- Popularity term calibrated against real prod distribution (max total_count
  -- ever seen = 6, median = 1): coefficient 4.0 gives a max contribution of
  -- ~7.8 and a typical contribution of ~2.8 -- a real but modest tiebreaker
  -- alongside the genre/artist terms, not a dominant one, matching how sparse
  -- interaction volume currently is. See migration header for full rationale.
  event_weights AS (
    SELECT
      e.id AS eid,
      e.artist_id AS artist_id,
      (1.0
        + 6.0 * LN(1.0 + GREATEST(COALESCE((
            SELECT SUM(COALESCE((v_genre_scores->>k.variant)::NUMERIC, 0))
            FROM unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) AS g(genre)
            CROSS JOIN LATERAL (
              SELECT DISTINCT v AS variant
              FROM unnest(ARRAY[g.genre, LOWER(g.genre), REPLACE(g.genre, ' ', '')]) AS v
            ) k
          ), 0), 0))
        + 16.0 * LN(1.0 + GREATEST(COALESCE((v_artist_scores->>(e.artist_id::TEXT))::NUMERIC, 0), 0))
        + 4.0 * LN(1.0 + COALESCE(ep.total_count, 0))
      ) AS total_weight,
      COALESCE((v_artist_scores->>(e.artist_id::TEXT))::NUMERIC, 0) AS artist_weight
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

  recommended_sampled AS (
    SELECT ew.eid, ew.artist_id, ew.total_weight, ew.artist_weight,
           -LN(RANDOM() + 0.0001) / (ew.total_weight + 1) AS sample_key
    FROM event_weights ew
    WHERE ew.artist_id IS NULL
       OR ew.artist_id NOT IN (SELECT artist_id FROM following WHERE artist_id IS NOT NULL)
  ),

  recommended_ranked AS (
    SELECT rs.*,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(rs.artist_id::TEXT, 'e-' || rs.eid::TEXT)
             ORDER BY rs.sample_key
           ) AS artist_rn
    FROM recommended_sampled rs
  ),

  recommended_ids AS (
    SELECT rr.eid, rr.artist_id, rr.total_weight, rr.artist_weight
    FROM recommended_ranked rr
    WHERE rr.artist_rn = 1
    ORDER BY rr.sample_key
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

  -- TRENDING now actually reflects interest: ordered by total_count first
  -- (the only currently-differentiating signal at today's volume), velocity
  -- as a tiebreaker (future-proofed, will matter more as usage grows), then
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

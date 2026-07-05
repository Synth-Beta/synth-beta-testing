-- Feed artist variety + rebalanced blend (2026-07-03)
--
-- Problem reported: the recommended section (and to a lesser degree following/
-- trending) can show the same artist repeatedly -- a tour with many nearby
-- dates, or a heavily-listened artist, dominates the weighted-random draw.
-- User wants: strong variety, no artist crowding out others, and a genuine
-- BLEND of recent listening + reviewed artists + genres + interested events
-- (all of which already feed into artist_preference_scores/genre_preference_scores
-- via 20260703000003/refresh_user_preferences_v5 -- this migration only changes
-- how the feed CONSUMES those scores).
--
-- Three changes to get_personalized_feed_v5:
--
-- A) Compress BOTH the artist and genre terms to logarithmic, calibrated
--    against the ACTUAL live distribution of scores (verified via read-only
--    queries against prod, not assumed):
--      genre_preference_scores (per single genre): median 1.1, p90 10, p99
--        121, max 225.5 -- this accumulates forever with NO decay (every
--        view/interest/manual-pick adds to the same bucket permanently), and
--        an event can match several genres at once, summing further.
--      artist_preference_scores: median 1, p90 9, p99 16.8, max 23.4 --
--        bounded by design (short/medium/long-term streaming decay, see
--        20260703000003).
--    Before: total_weight = 1.0 + genre_sum + 10.0 * artist_score
--    After:  total_weight = 1.0 + 6.0*LN(1 + genre_sum) + 16.0*LN(1 + artist_score)
--    Why: an early draft used a linear genre_sum with only the artist term
--    log-compressed, assuming genre_sum was typically 1-20 (an assumption
--    inherited from this function's own prior comments, unverified). Testing
--    against a real account exposed the problem: a user with a single genre
--    score of 105.58 ("Pop") got a tribute-band show to weight 106+ --
--    comfortably beating their actual top Spotify artist (real artist_weight
--    23.44, the max seen in prod) at 39. Genre accumulation is structurally
--    unbounded while artist scores are not, so ANY calibration that leaves
--    genre linear will eventually let a heavily-used genre dominate every
--    power user's feed regardless of the constant chosen.
--    Log-compressing both puts them on the same footing, and the 6:16
--    coefficient ratio (chosen so 16*LN(1+max_artist=23.4)=~51 exceeds even
--    6*LN(1+max_genre=225)=~33) means a real top-listened artist can now
--    outrank even the single largest genre score ever seen in prod --
--    matching the explicit ask to emphasize Spotify listening -- while
--    typical genre matches (median/p90) still contribute a meaningful assist
--    for genre-based discovery and cold-start users with no streaming data.
--
-- B) Cap each artist to at most ONE event across the whole returned feed.
--    Implemented as ROW_NUMBER() OVER (PARTITION BY artist, ORDER BY the
--    section's own random/weighted-random key), keeping only rn=1, applied
--    BEFORE each section's LIMIT so the cap doesn't distort the weighted
--    sampling (it's still "weighted sampling without replacement" at the
--    artist level, not per-event). NULL artist_id events (festivals/
--    compilations with no single artist) are each their own partition via
--    COALESCE(artist_id::TEXT, 'e-'||id::TEXT), so they never compete with
--    each other for the cap.
--    Cross-section: following's chosen artists are excluded from recommended;
--    following's + recommended's are excluded from trending. Combined with the
--    1-per-section cap, this guarantees every artist appears AT MOST ONCE in
--    the entire returned batch -- not "at most every 3 cards", literally once.
--    (An earlier draft allowed following up to 2/artist with an adjacency-safe
--    ordering trick, but the existing code re-shuffles each section with a
--    fresh ORDER BY RANDOM() right before pagination -- which would have
--    silently defeated that ordering guarantee. The 1-per-artist cap sidesteps
--    the issue entirely and is simpler to verify.)
--
-- C) Fix a pre-existing genre-score double-count bug, surfaced while testing (A).
--    The genre-weight sum matches each event genre against 3 key variants
--    (raw, lowercased, spaces-stripped) to tolerate casing/formatting
--    mismatches against genre_preference_scores' keys. But for any
--    single-word genre (e.g. "Pop"), spaces-stripped == raw, so that
--    variant's lookup hits the SAME key and its score gets summed TWICE.
--    Verified against prod: a user with genre_preference_scores->>'Pop' =
--    105.58 got a genre_sum of 211.16 (105.58 counted twice + tiny gospel
--    contribution) for one event -- a tribute-band show outweighing every
--    real artist-affinity match by 5-10x. This wasn't very visible under the
--    OLD linear 10x artist formula (the artist term still usually won), but
--    under the new log-compressed artist term (change A) an inflated genre
--    score like this could dominate the feed and undo the whole point of
--    this migration. Fix: deduplicate the 3 candidate keys per genre entry
--    (via a LATERAL DISTINCT) before summing, so each matching variant is
--    counted once, not once-per-way-it-happens-to-collide.
--    Separately (NOT fixed here -- out of scope for this function): testing
--    also surfaced that at least one event's genres array contains literal
--    garbage tokens like "[3]", "[4]", "[5]" alongside real genre names.
--    They don't affect scoring (no score key matches them, so they
--    contribute 0), but they indicate an ingestion-side bug writing
--    array-index placeholders into the genres column. Worth a separate
--    look at whatever populates events.genres.
--
-- Nothing else changes: function signature, 3 sections, mutual exclusion,
-- pagination interleave (10 recommended + 5 following + 5 trending per page,
-- shuffled within page), candidate pool sizes (300/2500/300), and the
-- covering index usage (event_weights still only touches id/genres/artist_id/
-- event_date/lat/lng) are all identical to the currently-deployed function.
--
-- Accepted edge cases: sections may return fewer than 25 rows once capped
-- (e.g. a market with only 8 distinct nearby artists) -- the existing
-- interleave already tolerates short sections. A residency town where one
-- artist owns most nearby dates will show that artist once, not repeatedly --
-- by design, per this request.
--
-- Validated via read-only dry-run SELECTs against prod (not persisted) before
-- writing this file: 50/50 distinct artists in a sample recommended batch,
-- and a real power-listener's actual top Spotify artists (John Summit, Don
-- Toliver, FISHER, A$AP Rocky, Joji) surfaced above genre-only matches.
--
-- Safe to run as one normal transaction (no CONCURRENTLY).

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
  -- genre matches without either signal dominating outright -- see migration
  -- header for the full calibration rationale and prod-verified percentiles.
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

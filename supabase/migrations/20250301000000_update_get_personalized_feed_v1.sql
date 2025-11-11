-- Update get_personalized_feed_v1 to ensure all filters work correctly
CREATE OR REPLACE FUNCTION get_personalized_feed_v1(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_city TEXT DEFAULT NULL,
  p_radius_miles INT DEFAULT 50,
  p_date_start TIMESTAMPTZ DEFAULT NOW(),
  p_date_end TIMESTAMPTZ DEFAULT NULL,
  p_genres TEXT[] DEFAULT NULL,
  p_following_only BOOLEAN DEFAULT FALSE,
  p_days_of_week INT[] DEFAULT NULL
)
RETURNS TABLE (
  event_id UUID,
  title TEXT,
  artist_name TEXT,
  artist_id TEXT,
  venue_name TEXT,
  venue_city TEXT,
  venue_state TEXT,
  venue_address TEXT,
  venue_zip TEXT,
  event_date TIMESTAMPTZ,
  genres TEXT[],
  latitude NUMERIC,
  longitude NUMERIC,
  ticket_urls TEXT[],
  ticket_available BOOLEAN,
  price_range TEXT,
  ticket_price_min NUMERIC,
  ticket_price_max NUMERIC,
  relevance_score NUMERIC,
  friend_interest_count INT,
  total_interest_count INT,
  is_promoted BOOLEAN,
  promotion_tier TEXT,
  distance_miles NUMERIC,
  poster_image_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_lat NUMERIC;
  v_user_lon NUMERIC;
BEGIN
  -- Resolve coordinates for the selected city (if provided)
  IF p_city IS NOT NULL THEN
    SELECT center_latitude, center_longitude
    INTO v_user_lat, v_user_lon
    FROM city_centers
    WHERE LOWER(city_name) = LOWER(p_city)
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH user_preferences AS (
    SELECT 
      COALESCE(
        array_agg(DISTINCT preference_value) FILTER (
          WHERE preference_type = 'genre' AND preference_score > 0
        ),
        '{}'::TEXT[]
      ) AS liked_genres,
      COALESCE(
        array_agg(DISTINCT preference_value) FILTER (
          WHERE preference_type = 'artist' AND preference_score > 0
        ),
        '{}'::TEXT[]
      ) AS liked_artists
    FROM music_preference_signals
    WHERE user_id = p_user_id
  ),
  user_friends AS (
    SELECT user1_id, user2_id
    FROM friends
    WHERE user1_id = p_user_id OR user2_id = p_user_id
  ),
  candidate_events AS (
    SELECT
      e.id,
      e.title,
      e.artist_name,
      e.artist_id,
      e.artist_uuid,
      a.matched_artist_uuid,
      e.venue_name,
      e.venue_city,
      e.venue_state,
      e.venue_address,
      e.venue_zip,
      e.event_date,
      e.genres,
      e.latitude,
      e.longitude,
      e.ticket_urls,
      e.ticket_available,
      e.price_range,
      e.price_min,
      e.price_max,
      e.is_promoted,
      e.promotion_tier,
      e.poster_image_url,
      e.created_at,
      e.updated_at,
      CASE
        WHEN v_user_lat IS NOT NULL AND e.latitude IS NOT NULL THEN
          (3959 * acos(
            LEAST(
              1.0,
              GREATEST(
                -1.0,
                cos(radians(v_user_lat)) *
                cos(radians(e.latitude)) *
                cos(radians(e.longitude) - radians(v_user_lon)) +
                sin(radians(v_user_lat)) *
                sin(radians(e.latitude))
              )
            )
          ))
        ELSE NULL
      END AS distance
    FROM jambase_events e
    LEFT JOIN LATERAL (
      SELECT ar.id AS matched_artist_uuid
      FROM artists ar
      WHERE (e.artist_uuid IS NOT NULL AND ar.id = e.artist_uuid)
         OR (e.artist_uuid IS NULL AND e.artist_id IS NOT NULL AND ar.jambase_artist_id::text = e.artist_id::text)
      LIMIT 1
    ) a ON TRUE
    WHERE e.event_date >= COALESCE(p_date_start, NOW())
      AND (p_date_end IS NULL OR e.event_date <= p_date_end)
      AND (p_genres IS NULL OR e.genres && p_genres)
      AND (
        p_days_of_week IS NULL
        OR extract(dow FROM e.event_date)::INT = ANY(p_days_of_week)
      )
      AND (
        v_user_lat IS NULL
        OR e.latitude IS NULL
        OR (
          3959 * acos(
            LEAST(
              1.0,
              GREATEST(
                -1.0,
                cos(radians(v_user_lat)) *
                cos(radians(e.latitude)) *
                cos(radians(e.longitude) - radians(v_user_lon)) +
                sin(radians(v_user_lat)) *
                sin(radians(e.latitude))
              )
            )
          )
        ) <= p_radius_miles
      )
      AND (
        NOT p_following_only
        OR (
          COALESCE(e.artist_uuid, a.matched_artist_uuid) IS NOT NULL
          AND EXISTS (
          SELECT 1
          FROM artist_follows af
          WHERE af.user_id = p_user_id
              AND af.artist_id = COALESCE(e.artist_uuid, a.matched_artist_uuid)
          )
        )
      )
    ORDER BY e.event_date ASC
    LIMIT LEAST(600, GREATEST(p_limit * 3, 150))
  ),
  event_interests AS (
    SELECT
      uj.jambase_event_id AS event_id,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM user_friends uf
          WHERE (uf.user1_id = p_user_id AND uf.user2_id = uj.user_id)
             OR (uf.user2_id = p_user_id AND uf.user1_id = uj.user_id)
        )
      ) AS friend_count,
      COUNT(*) AS total_count
    FROM user_jambase_events uj
    WHERE uj.jambase_event_id IN (SELECT id FROM candidate_events)
    GROUP BY uj.jambase_event_id
  ),
  scored_events AS (
    SELECT
      ce.*,
      COALESCE(ei.friend_count, 0) AS friend_count,
      COALESCE(ei.total_count, 0) AS total_count,
      (
        50.0
        + CASE
            WHEN ce.genres && up.liked_genres THEN
              LEAST(
                30.0,
                30.0 * (
                  cardinality(
                    (SELECT array_agg(g)
                     FROM unnest(ce.genres) g
                     WHERE g = ANY(up.liked_genres))
                  )::NUMERIC / GREATEST(cardinality(up.liked_genres), 1)
                )
              )
            ELSE 0
          END
        + CASE
            WHEN ce.artist_name = ANY(up.liked_artists) THEN 40.0
            ELSE 0
          END
        + LEAST(COALESCE(ei.friend_count, 0) * 10.0, 20.0)
        - CASE
            WHEN ce.distance IS NOT NULL THEN LEAST(ce.distance / 5.0, 20.0)
            ELSE 0
          END
        + CASE ce.promotion_tier
            WHEN 'featured' THEN 30.0
            WHEN 'premium' THEN 20.0
            WHEN 'basic' THEN 10.0
            ELSE 0
          END
        + LEAST(COALESCE(ei.total_count, 0) * 0.5, 15.0)
        + CASE
            WHEN ce.event_date <= (NOW() + INTERVAL '7 days') THEN 10.0
            WHEN ce.event_date <= (NOW() + INTERVAL '30 days') THEN 5.0
            ELSE 0
          END
      ) AS final_score
    FROM candidate_events ce
    CROSS JOIN user_preferences up
    LEFT JOIN event_interests ei ON ei.event_id = ce.id
  )
  SELECT
    se.id,
    se.title,
    se.artist_name,
    se.artist_id,
    se.venue_name,
    se.venue_city,
    se.venue_state,
    se.venue_address,
    se.venue_zip,
    se.event_date,
    se.genres,
    se.latitude,
    se.longitude,
    se.ticket_urls,
    se.ticket_available,
    se.price_range,
    se.price_min AS ticket_price_min,
    se.price_max AS ticket_price_max,
    se.final_score::NUMERIC,
    se.friend_count::INT,
    se.total_count::INT,
    se.is_promoted,
    se.promotion_tier,
    se.distance::NUMERIC,
    se.poster_image_url,
    se.created_at,
    se.updated_at
  FROM scored_events se
  ORDER BY
    se.is_promoted DESC NULLS LAST,
    se.final_score DESC,
    se.event_date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


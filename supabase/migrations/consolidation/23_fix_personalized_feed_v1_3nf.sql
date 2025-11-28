-- Fix get_personalized_feed_v1 function to work with 3NF database schema
-- This updates all table references to use the consolidated 3NF tables

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
  -- Updated: city_centers.normalized_name instead of city_name
  IF p_city IS NOT NULL THEN
    SELECT center_latitude, center_longitude
    INTO v_user_lat, v_user_lon
    FROM city_centers
    WHERE LOWER(normalized_name) = LOWER(TRIM(p_city))
       OR LOWER(normalized_name) = LOWER(TRIM(REPLACE(p_city, ' D.C', '')))
       OR LOWER(normalized_name) = LOWER(TRIM(REPLACE(REPLACE(p_city, '.', ''), ' D.C', '')))
       OR LOWER(normalized_name) = LOWER(TRIM(REPLACE(REPLACE(p_city, '.', ''), ' DC', '')))
       -- Also check aliases array (simplified - check if city name is in aliases)
       OR EXISTS (
         SELECT 1 
         FROM city_centers cc2 
         WHERE cc2.id = city_centers.id 
           AND LOWER(TRIM(p_city)) = ANY(SELECT LOWER(unnest(cc2.aliases)))
       )
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH user_prefs_base AS (
    -- Get user preferences row
    SELECT 
      preferred_genres,
      preferred_artists
    FROM user_preferences
    WHERE user_id = p_user_id
    LIMIT 1
  ),
  user_preferences AS (
    -- Convert preferred_artists (UUID array) to artist names
    SELECT 
      COALESCE(upb.preferred_genres, '{}'::TEXT[]) AS liked_genres,
      COALESCE(
        (
          SELECT array_agg(DISTINCT a.name)
          FROM unnest(COALESCE(upb.preferred_artists, '{}'::UUID[])) AS artist_uuid
          JOIN artists a ON a.id = artist_uuid
          WHERE a.name IS NOT NULL
        ),
        '{}'::TEXT[]
      ) AS liked_artists
    FROM user_prefs_base upb
  ),
  user_friends AS (
    -- Updated: user_relationships instead of friends table
    SELECT 
      CASE 
        WHEN user_id = p_user_id THEN related_user_id
        ELSE user_id
      END AS friend_user_id
    FROM user_relationships
    WHERE (user_id = p_user_id OR related_user_id = p_user_id)
      AND relationship_type = 'friend'
      AND status = 'accepted'
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
      -- Updated: Extract poster_image_url from images JSONB array if available
      CASE
        WHEN e.images IS NOT NULL AND jsonb_array_length(e.images) > 0 THEN
          (e.images->0->>'url')::TEXT
        ELSE NULL
      END AS poster_image_url,
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
    -- Updated: events table instead of jambase_events
    FROM events e
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
            -- Updated: relationships table instead of artist_follows
            SELECT 1
            FROM relationships r
            WHERE r.user_id = p_user_id
              AND r.related_entity_type = 'artist'
              AND r.relationship_type = 'follow'
              AND r.related_entity_id::uuid = COALESCE(e.artist_uuid, a.matched_artist_uuid)
          )
        )
      )
      -- Filter by city if provided
      AND (
        p_city IS NULL
        OR e.venue_city IS NULL
        OR LOWER(e.venue_city) LIKE LOWER(p_city || '%')
        OR LOWER(e.venue_city) LIKE LOWER(REPLACE(p_city, ' D.C', '') || '%')
        OR LOWER(e.venue_city) LIKE LOWER(REPLACE(REPLACE(p_city, '.', ''), ' D.C', '') || '%')
      )
    ORDER BY e.event_date ASC
    LIMIT LEAST(600, GREATEST(p_limit * 3, 150))
  ),
  event_interests AS (
    SELECT
      -- Updated: relationships table instead of user_jambase_events
      -- Match events by UUID (related_entity_id is TEXT, so we convert)
      ce.id AS event_uuid,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM user_friends uf
          WHERE uf.friend_user_id = r.user_id
        )
      ) AS friend_count,
      COUNT(*) AS total_count
    FROM candidate_events ce
    JOIN relationships r ON (
      r.related_entity_type = 'event'
      AND r.relationship_type = 'interest'
      AND r.status = 'accepted'
      AND (
        -- Match by event UUID (related_entity_id should be UUID as text)
        -- Use text comparison first to avoid UUID cast errors
        LOWER(TRIM(r.related_entity_id)) = LOWER(ce.id::text)
        -- Also try UUID cast if it's a valid UUID format
        OR (
          r.related_entity_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          AND r.related_entity_id::uuid = ce.id
        )
      )
    )
    GROUP BY ce.id
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
    CROSS JOIN (SELECT * FROM user_preferences LIMIT 1) up
    LEFT JOIN event_interests ei ON ei.event_uuid = ce.id
  )
  SELECT
    se.id AS event_id,
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
    se.final_score::NUMERIC AS relevance_score,
    se.friend_count::INT AS friend_interest_count,
    se.total_count::INT AS total_interest_count,
    se.is_promoted,
    se.promotion_tier,
    se.distance::NUMERIC AS distance_miles,
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_personalized_feed_v1(UUID, INT, INT, TEXT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[], BOOLEAN, INT[]) TO authenticated;

-- Add comment
COMMENT ON FUNCTION get_personalized_feed_v1 IS 'Personalized feed function updated for 3NF schema. Uses events, user_relationships, relationships, and user_preferences tables.';


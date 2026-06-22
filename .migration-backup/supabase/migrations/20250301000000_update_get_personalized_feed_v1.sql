-- Update get_personalized_feed_v1 to ensure all filters work correctly
CREATE OR REPLACE FUNCTION get_personalized_feed_v1(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_city TEXT DEFAULT NULL,
  p_city_lat NUMERIC DEFAULT NULL,
  p_city_lng NUMERIC DEFAULT NULL,
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
  artist_uuid UUID,
  venue_name TEXT,
  venue_id TEXT,
  venue_uuid UUID,
  venue_city TEXT,
  venue_state TEXT,
  venue_address TEXT,
  venue_zip TEXT,
  event_date TIMESTAMPTZ,
  doors_time TIMESTAMPTZ,
  description TEXT,
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
  v_city_normalized TEXT;
  v_user_lat NUMERIC;
  v_user_lon NUMERIC;
  v_effective_radius NUMERIC := GREATEST(COALESCE(p_radius_miles, 50), 5);
BEGIN
  IF p_city_lat IS NOT NULL AND p_city_lng IS NOT NULL THEN
    v_user_lat := p_city_lat;
    v_user_lon := p_city_lng;
  ELSIF p_city IS NOT NULL THEN
    v_city_normalized := regexp_replace(lower(trim(p_city)), '\s+', ' ', 'g');

    SELECT cc.center_latitude, cc.center_longitude
    INTO v_user_lat, v_user_lon
    FROM city_centers cc
    WHERE regexp_replace(lower(trim(cc.normalized_name)), '\s+', ' ', 'g') = v_city_normalized
       OR (
         cc.aliases IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM unnest(cc.aliases) alias_name
           WHERE regexp_replace(lower(trim(alias_name)), '\s+', ' ', 'g') = v_city_normalized
         )
       )
    ORDER BY cc.population DESC NULLS LAST, cc.event_count DESC NULLS LAST
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH user_pref_raw AS (
    SELECT 
      COALESCE(up.preferred_genres, '{}'::TEXT[]) AS preferred_genres,
      COALESCE(up.preferred_artists, '{}'::UUID[]) AS preferred_artists,
      COALESCE(up.preferred_venues, '{}'::TEXT[]) AS preferred_venues,
      COALESCE(up.genre_preferences, '{}'::JSONB) AS genre_preferences,
      COALESCE(up.music_preference_signals, '{}'::JSONB) AS preference_signals
    FROM user_preferences up
    WHERE up.user_id = p_user_id
    LIMIT 1
  ),
  music_genre_signals AS (
    SELECT ARRAY_AGG(preference_value ORDER BY preference_score DESC) AS genre_array
    FROM music_preference_signals
    WHERE user_id = p_user_id
      AND preference_type = 'genre'
      AND preference_score > 0
  ),
  music_artist_signals AS (
    SELECT ARRAY_AGG(preference_value ORDER BY preference_score DESC) AS artist_array
    FROM music_preference_signals
    WHERE user_id = p_user_id
      AND preference_type = 'artist'
      AND preference_score > 0
  ),
  preference_summary AS (
    SELECT
      COALESCE(
        ARRAY(
          SELECT DISTINCT regexp_replace(lower(trim(val)), '\s+', ' ', 'g')
          FROM (
            SELECT unnest(COALESCE((SELECT preferred_genres FROM user_pref_raw LIMIT 1), '{}'::TEXT[])) AS val
            UNION ALL
            SELECT key
            FROM (
              SELECT jsonb_object_keys(
                COALESCE((SELECT genre_preferences FROM user_pref_raw LIMIT 1), '{}'::JSONB)
              ) AS key
            ) genre_keys
            UNION ALL
            SELECT elem
            FROM (
              SELECT jsonb_array_elements_text(
                CASE 
                  WHEN jsonb_typeof(COALESCE((SELECT genre_preferences FROM user_pref_raw LIMIT 1), '{}'::JSONB)) = 'array'
                  THEN COALESCE((SELECT genre_preferences FROM user_pref_raw LIMIT 1), '[]'::JSONB)
                  ELSE '[]'::JSONB
                END
              ) AS elem
            ) genre_array
            UNION ALL
            SELECT unnest(COALESCE((SELECT genre_array FROM music_genre_signals LIMIT 1), '{}'::TEXT[]))
          ) all_genres
          WHERE val IS NOT NULL AND val <> ''
        ),
        '{}'::TEXT[]
      ) AS liked_genres,
      COALESCE(
        ARRAY(
          SELECT DISTINCT val
          FROM unnest(COALESCE((SELECT preferred_artists FROM user_pref_raw LIMIT 1), '{}'::UUID[])) AS val
        ),
        '{}'::UUID[]
      ) AS liked_artist_ids,
      COALESCE(
        ARRAY(
          SELECT DISTINCT regexp_replace(lower(trim(val)), '\s+', ' ', 'g')
          FROM (
            SELECT unnest(COALESCE((SELECT artist_array FROM music_artist_signals LIMIT 1), '{}'::TEXT[])) AS val
            UNION ALL
            SELECT art.name
            FROM artists art
            WHERE art.id = ANY(COALESCE((SELECT preferred_artists FROM user_pref_raw LIMIT 1), '{}'::UUID[]))
          ) artist_names
          WHERE val IS NOT NULL AND val <> ''
        ),
        '{}'::TEXT[]
      ) AS liked_artist_names
  ),
  following_artists AS (
    SELECT DISTINCT
      CASE 
        WHEN rel.related_entity_id ~* '^[0-9a-fA-F-]{36}$' THEN rel.related_entity_id::UUID
        ELSE NULL
      END AS artist_uuid,
      art.jambase_artist_id AS jambase_artist_id,
      regexp_replace(lower(trim(art.name)), '\s+', ' ', 'g') AS artist_name_norm
    FROM relationships rel
    LEFT JOIN artists art ON art.id = 
      CASE 
        WHEN rel.related_entity_id ~* '^[0-9a-fA-F-]{36}$' THEN rel.related_entity_id::UUID
        ELSE NULL
      END
    WHERE rel.user_id = p_user_id
      AND rel.related_entity_type = 'artist'
      AND rel.relationship_type = 'follow'
  ),
  friend_ids AS (
    SELECT DISTINCT
      CASE WHEN f.user1_id = p_user_id THEN f.user2_id ELSE f.user1_id END AS friend_id
    FROM friends f
    WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
  ),
  candidate_events AS (
    SELECT
      e.id,
      e.title,
      e.artist_name,
      e.artist_id,
      e.artist_uuid,
      e.venue_name,
      e.venue_id,
      e.venue_uuid,
      e.venue_city,
      e.venue_state,
      e.venue_address,
      e.venue_zip,
      e.event_date,
      e.doors_time,
      e.description,
      e.genres,
      e.latitude,
      e.longitude,
      COALESCE(e.ticket_urls, ARRAY[]::TEXT[]) AS ticket_urls,
      e.ticket_available,
      e.price_range,
      e.price_min AS ticket_price_min,
      e.price_max AS ticket_price_max,
      CASE
        WHEN v_user_lat IS NOT NULL 
             AND e.latitude IS NOT NULL 
             AND e.longitude IS NOT NULL THEN
          calculate_distance(
            v_user_lat::FLOAT,
            v_user_lon::FLOAT,
            e.latitude::FLOAT,
            e.longitude::FLOAT
          )
        ELSE NULL
      END AS distance_miles,
      (ARRAY[
        CASE 
          WHEN e.media_urls IS NOT NULL AND array_length(e.media_urls, 1) > 0 
          THEN e.media_urls[1]
          ELSE NULL
        END
      ])[1] AS poster_image_url,
      CASE
        WHEN e.promoted IS TRUE
          AND (e.promotion_start_date IS NULL OR e.promotion_start_date <= NOW())
          AND (e.promotion_end_date IS NULL OR e.promotion_end_date >= NOW())
        THEN TRUE
        WHEN e.is_featured IS TRUE
          AND (e.featured_until IS NULL OR e.featured_until >= NOW())
        THEN TRUE
        ELSE FALSE
      END AS is_promoted,
      e.promotion_tier,
      e.created_at,
      e.updated_at
    FROM events e
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
        OR e.longitude IS NULL
        OR calculate_distance(
            v_user_lat::FLOAT,
            v_user_lon::FLOAT,
            e.latitude::FLOAT,
            e.longitude::FLOAT
          ) <= v_effective_radius
      )
      AND (
        NOT p_following_only
        OR EXISTS (
          SELECT 1
          FROM following_artists fa
          WHERE (fa.artist_uuid IS NOT NULL AND fa.artist_uuid = e.artist_uuid)
             OR (
               fa.jambase_artist_id IS NOT NULL 
               AND e.artist_id IS NOT NULL 
               AND fa.jambase_artist_id::TEXT = e.artist_id::TEXT
             )
             OR (
               fa.artist_name_norm IS NOT NULL
               AND e.artist_name IS NOT NULL
               AND fa.artist_name_norm = regexp_replace(lower(trim(e.artist_name)), '\s+', ' ', 'g')
             )
        )
      )
    ORDER BY e.event_date ASC
    LIMIT LEAST(800, GREATEST(p_limit * 5, 250))
  ),
  event_interests AS (
    SELECT
      uje.jambase_event_id AS event_id,
      COUNT(*) FILTER (
        WHERE uje.user_id IN (SELECT friend_id FROM friend_ids)
      ) AS friend_count,
      COUNT(*) AS total_count
    FROM user_jambase_events uje
    WHERE uje.jambase_event_id IN (SELECT id FROM candidate_events)
    GROUP BY uje.jambase_event_id
  ),
  scored_events AS (
    SELECT
      ce.*,
      COALESCE(ei.friend_count, 0) AS friend_interest_count,
      COALESCE(ei.total_count, 0) AS total_interest_count,
      (
        35.0
        + CASE
            WHEN array_length(ps.liked_genres, 1) > 0
             AND ce.genres IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM unnest(ce.genres) g
               WHERE regexp_replace(lower(trim(g)), '\s+', ' ', 'g') = ANY(ps.liked_genres)
             )
            THEN LEAST(
              30.0,
              30.0 * (
                SELECT COUNT(DISTINCT regexp_replace(lower(trim(g)), '\s+', ' ', 'g'))::NUMERIC
                FROM unnest(ce.genres) g
                WHERE regexp_replace(lower(trim(g)), '\s+', ' ', 'g') = ANY(ps.liked_genres)
              ) / GREATEST(array_length(ps.liked_genres, 1), 1)
            )
            ELSE 0
          END
        + CASE
            WHEN ce.artist_uuid IS NOT NULL AND ce.artist_uuid = ANY(ps.liked_artist_ids) THEN 35.0
            WHEN ce.artist_name IS NOT NULL
              AND regexp_replace(lower(trim(ce.artist_name)), '\s+', ' ', 'g') = ANY(ps.liked_artist_names)
            THEN 25.0
            ELSE 0
          END
        + LEAST(COALESCE(ei.friend_count, 0) * 8.0, 24.0)
        + LEAST(COALESCE(ei.total_count, 0) * 0.5, 12.0)
        + CASE
            WHEN ce.distance_miles IS NOT NULL THEN GREATEST(12.0 - (ce.distance_miles / 5.0), 0)
            ELSE 4.0
          END
        + CASE
            WHEN ce.event_date <= (NOW() + INTERVAL '7 days') THEN 10.0
            WHEN ce.event_date <= (NOW() + INTERVAL '30 days') THEN 6.0
            ELSE 0
          END
        + CASE
            WHEN ce.is_promoted THEN
              CASE ce.promotion_tier
                WHEN 'featured' THEN 18.0
                WHEN 'premium' THEN 12.0
                WHEN 'basic' THEN 6.0
                ELSE 5.0
              END
            ELSE 0
          END
      ) AS relevance_score
    FROM candidate_events ce
    CROSS JOIN preference_summary ps
    LEFT JOIN event_interests ei ON ei.event_id = ce.id
  ),
  ranked_events AS (
    SELECT
      se.*,
      ROW_NUMBER() OVER (
        ORDER BY se.is_promoted DESC, se.relevance_score DESC, se.event_date ASC
      ) AS row_rank
    FROM scored_events se
  )
  SELECT
    re.id AS event_id,
    re.title,
    re.artist_name,
    re.artist_id,
    re.artist_uuid,
    re.venue_name,
    re.venue_id,
    re.venue_uuid,
    re.venue_city,
    re.venue_state,
    re.venue_address,
    re.venue_zip,
    re.event_date,
    re.doors_time,
    re.description,
    re.genres,
    re.latitude,
    re.longitude,
    re.ticket_urls,
    re.ticket_available,
    re.price_range,
    re.ticket_price_min,
    re.ticket_price_max,
    re.relevance_score,
    re.friend_interest_count,
    re.total_interest_count,
    re.is_promoted,
    re.promotion_tier,
    re.distance_miles,
    re.poster_image_url,
    re.created_at,
    re.updated_at
  FROM ranked_events re
  WHERE re.row_rank > p_offset
  ORDER BY re.row_rank
  LIMIT p_limit;
END;
$$;


GRANT EXECUTE ON FUNCTION get_personalized_feed_v1(
  UUID,
  INT,
  INT,
  TEXT,
  NUMERIC,
  NUMERIC,
  INT,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT[],
  BOOLEAN,
  INT[]
) TO authenticated;



-- Drop legacy personalized feed functions to avoid overload conflicts
DROP FUNCTION IF EXISTS public.get_personalized_events_feed(UUID, INT, INT);
DROP FUNCTION IF EXISTS public.get_personalized_events_feed(UUID, INT, INT, BOOLEAN);

-- Create new personalized feed function that relies on the consolidated schema
CREATE OR REPLACE FUNCTION public.get_personalized_feed_v2(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_include_past BOOLEAN DEFAULT FALSE,
  p_city_lat NUMERIC DEFAULT NULL,
  p_city_lng NUMERIC DEFAULT NULL,
  p_radius_miles NUMERIC DEFAULT 50,
  p_genres TEXT[] DEFAULT NULL,
  p_following_only BOOLEAN DEFAULT FALSE
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
  updated_at TIMESTAMPTZ,
  user_is_interested BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  has_location BOOLEAN := p_city_lat IS NOT NULL AND p_city_lng IS NOT NULL;
BEGIN
  RETURN QUERY
  WITH user_pref AS (
    SELECT
      COALESCE(preferred_genres, '{}'::TEXT[]) AS preferred_genres,
      COALESCE(preferred_artists, '{}'::UUID[]) AS preferred_artists,
      COALESCE(preferred_venues, '{}'::TEXT[]) AS preferred_venues,
      COALESCE(genre_preferences, '{}'::JSONB) AS genre_preferences,
      COALESCE(music_preference_signals, '{}'::JSONB) AS music_preference_signals
    FROM user_preferences
    WHERE user_id = p_user_id
    UNION ALL
    SELECT
      '{}'::TEXT[],
      '{}'::UUID[],
      '{}'::TEXT[],
      '{}'::JSONB,
      '{}'::JSONB
    WHERE NOT EXISTS (SELECT 1 FROM user_preferences WHERE user_id = p_user_id)
  ),
  pref_genres AS (
    SELECT DISTINCT lower(trim(g)) AS genre
    FROM user_pref, unnest(preferred_genres) g
    WHERE g IS NOT NULL AND g <> ''
  ),
  pref_genre_weights AS (
    SELECT
      lower(trim(key)) AS genre,
      COALESCE(
        (value->>'weight')::NUMERIC,
        CASE WHEN jsonb_typeof(value) = 'number' THEN (value::TEXT)::NUMERIC ELSE NULL END,
        1::NUMERIC
      ) AS weight
    FROM user_pref, jsonb_each(genre_preferences)
  ),
  all_pref_genres AS (
    SELECT genre, 1::NUMERIC AS weight FROM pref_genres
    UNION ALL
    SELECT genre, weight FROM pref_genre_weights
  ),
  artist_follows AS (
    SELECT
      CASE
        WHEN related_entity_id ~* '^[0-9a-f-]{36}$' THEN related_entity_id::UUID
        ELSE NULL
      END AS artist_uuid,
      lower(trim(related_entity_id)) AS artist_id_text
    FROM relationships
    WHERE user_id = p_user_id
      AND related_entity_type = 'artist'
      AND relationship_type = 'follow'
      AND status = 'accepted'
  ),
  venue_follows AS (
    SELECT lower(trim(related_entity_id)) AS venue_id_text
    FROM relationships
    WHERE user_id = p_user_id
      AND related_entity_type = 'venue'
      AND relationship_type = 'follow'
      AND status = 'accepted'
  ),
  friend_ids AS (
    SELECT
      CASE
        WHEN user_id = p_user_id THEN related_entity_id::UUID
        ELSE user_id
      END AS friend_id
    FROM relationships
    WHERE related_entity_type = 'user'
      AND relationship_type = 'friend'
      AND status = 'accepted'
      AND (user_id = p_user_id OR related_entity_id::UUID = p_user_id)
  ),
  friend_event_interest AS (
    SELECT
      related_entity_id::UUID AS event_id,
      COUNT(*) AS friend_count
    FROM relationships r
    JOIN friend_ids f ON f.friend_id = r.user_id
    WHERE r.related_entity_type = 'event'
      AND r.relationship_type IN ('going','maybe')
    GROUP BY related_entity_id
  ),
  total_event_interest AS (
    SELECT
      related_entity_id::UUID AS event_id,
      COUNT(*) AS total_count
    FROM relationships
    WHERE related_entity_type = 'event'
      AND relationship_type IN ('going','maybe')
    GROUP BY related_entity_id
  ),
  user_event_interest AS (
    SELECT related_entity_id::UUID AS event_id
    FROM relationships
    WHERE user_id = p_user_id
      AND related_entity_type = 'event'
      AND relationship_type IN ('going','maybe')
  ),
  candidate_events AS (
    SELECT
      e.*,
      CASE
        WHEN has_location AND e.latitude IS NOT NULL AND e.longitude IS NOT NULL THEN
          calculate_distance(p_city_lat::FLOAT, p_city_lng::FLOAT, e.latitude::FLOAT, e.longitude::FLOAT)
        ELSE NULL
      END AS distance_miles,
      CASE
        WHEN e.media_urls IS NOT NULL AND array_length(e.media_urls, 1) > 0 THEN e.media_urls[1]
        ELSE NULL
      END AS poster_image_url
    FROM events e
    WHERE (p_include_past OR e.event_date >= NOW())
      AND (p_genres IS NULL OR e.genres && p_genres)
      AND (
        NOT has_location
        OR e.latitude IS NULL
        OR e.longitude IS NULL
        OR calculate_distance(p_city_lat::FLOAT, p_city_lng::FLOAT, e.latitude::FLOAT, e.longitude::FLOAT) <= (p_radius_miles * 1.5)
      )
    ORDER BY e.event_date ASC
    LIMIT LEAST(500, GREATEST(p_limit * 10, 200))
  ),
  scored_events AS (
    SELECT
      ce.*,
      COALESCE(fe.friend_count, 0) AS friend_interest_count,
      COALESCE(te.total_count, 0) AS total_interest_count,
      CASE WHEN uei.event_id IS NOT NULL THEN TRUE ELSE FALSE END AS user_is_interested,
      (
        50
        + COALESCE((
            SELECT SUM(weight)
            FROM all_pref_genres g
            WHERE EXISTS (
              SELECT 1
              FROM unnest(ce.genres) eg
              WHERE lower(trim(eg)) = g.genre
            )
          ), 0) * 2
        + CASE
            WHEN ce.artist_uuid IS NOT NULL AND (
              EXISTS (
                SELECT 1
                FROM user_pref up
                WHERE ce.artist_uuid = ANY(up.preferred_artists)
              )
              OR EXISTS (
                SELECT 1 FROM artist_follows af WHERE af.artist_uuid = ce.artist_uuid
              )
            ) THEN 30
            WHEN ce.artist_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM artist_follows af WHERE af.artist_id_text = lower(trim(ce.artist_id))
            ) THEN 25
            ELSE 0
          END
        + CASE
            WHEN ce.venue_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM venue_follows vf WHERE vf.venue_id_text = lower(trim(ce.venue_id))
            ) THEN 15
            ELSE 0
          END
        + LEAST(COALESCE(fe.friend_count, 0) * 8, 25)
        + CASE
            WHEN ce.promoted THEN
              CASE ce.promotion_tier
                WHEN 'featured' THEN 35
                WHEN 'premium' THEN 25
                WHEN 'basic' THEN 15
                ELSE 10
              END
            ELSE 0
          END
        + CASE
            WHEN ce.event_date <= (NOW() + INTERVAL '7 days') THEN 15
            WHEN ce.event_date <= (NOW() + INTERVAL '30 days') THEN 10
            WHEN ce.event_date <= (NOW() + INTERVAL '90 days') THEN 5
            ELSE 0
          END
        - CASE
            WHEN ce.distance_miles IS NOT NULL THEN LEAST(ce.distance_miles / 8, 15)
            ELSE 0
          END
        + CASE
            WHEN ce.ticket_available THEN 5
            ELSE 0
          END
      )::NUMERIC AS relevance_score,
      (
        CASE
          WHEN ce.artist_uuid IS NOT NULL AND (
            EXISTS (
              SELECT 1
              FROM user_pref up
              WHERE ce.artist_uuid = ANY(up.preferred_artists)
            )
            OR EXISTS (SELECT 1 FROM artist_follows af WHERE af.artist_uuid = ce.artist_uuid)
          ) THEN TRUE
          WHEN ce.artist_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM artist_follows af WHERE af.artist_id_text = lower(trim(ce.artist_id))
          ) THEN TRUE
          WHEN ce.venue_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM venue_follows vf WHERE vf.venue_id_text = lower(trim(ce.venue_id))
          ) THEN TRUE
          WHEN COALESCE(fe.friend_count, 0) > 0 THEN TRUE
          ELSE FALSE
        END
      ) AS has_follow_signal
    FROM candidate_events ce
    LEFT JOIN friend_event_interest fe ON fe.event_id = ce.id
    LEFT JOIN total_event_interest te ON te.event_id = ce.id
    LEFT JOIN user_event_interest uei ON uei.event_id = ce.id
  )
  SELECT
    se.id AS event_id,
    se.title,
    se.artist_name,
    se.artist_id,
    se.artist_uuid,
    se.venue_name,
    se.venue_id,
    se.venue_uuid,
    se.venue_city,
    se.venue_state,
    se.venue_address,
    se.venue_zip,
    se.event_date,
    se.doors_time,
    se.description,
    se.genres,
    se.latitude,
    se.longitude,
    se.ticket_urls,
    se.ticket_available,
    se.price_range,
    se.price_min AS ticket_price_min,
    se.price_max AS ticket_price_max,
    se.relevance_score,
    se.friend_interest_count::INT,
    se.total_interest_count::INT,
    COALESCE(se.promoted, FALSE) AS is_promoted,
    se.promotion_tier,
    se.distance_miles::NUMERIC AS distance_miles,
    se.poster_image_url,
    se.created_at,
    se.updated_at,
    se.user_is_interested
  FROM scored_events se
  WHERE NOT p_following_only OR se.has_follow_signal
  ORDER BY se.relevance_score DESC, se.event_date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_personalized_feed_v2(
  UUID, INT, INT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC, TEXT[], BOOLEAN
) TO authenticated;


-- Fix get_calendar_events to use venue coordinates as fallback
-- Events without lat/long should still show up if their venue has coordinates
-- Uses UNION approach for better index usage (avoids COALESCE in WHERE clause)

DROP FUNCTION IF EXISTS public.get_calendar_events(
  NUMERIC,
  NUMERIC,
  NUMERIC,
  TIMESTAMPTZ,
  TEXT[],
  INT,
  TEXT,
  INT
);

CREATE OR REPLACE FUNCTION public.get_calendar_events(
  p_latitude NUMERIC DEFAULT NULL,
  p_longitude NUMERIC DEFAULT NULL,
  p_radius_miles NUMERIC DEFAULT NULL,
  p_min_date TIMESTAMPTZ DEFAULT NULL,
  p_genres TEXT[] DEFAULT NULL,
  p_limit INT DEFAULT 1500,
  p_umbrella_slug TEXT DEFAULT NULL,
  p_max_depth INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  artist_name TEXT,
  artist_id UUID,
  venue_name TEXT,
  venue_id UUID,
  event_date TIMESTAMPTZ,
  doors_time TIMESTAMPTZ,
  description TEXT,
  genres TEXT[],
  venue_address TEXT,
  venue_city TEXT,
  venue_state TEXT,
  venue_zip TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  ticket_available BOOLEAN,
  price_range TEXT,
  ticket_urls TEXT[],
  setlist JSONB,
  tour_name TEXT,
  event_media_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  distance_miles NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_min_date TIMESTAMPTZ := COALESCE(p_min_date, NOW());
  v_min_lat NUMERIC;
  v_max_lat NUMERIC;
  v_min_lng NUMERIC;
  v_max_lng NUMERIC;
  v_genre_filter BOOLEAN;
BEGIN
  -- Genre filter: umbrella path expansion OR raw array overlap
  v_genre_filter := (
    (p_umbrella_slug IS NOT NULL AND trim(p_umbrella_slug) != '')
    AND EXISTS (SELECT 1 FROM genre_paths LIMIT 1)
  );

  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL AND p_radius_miles IS NOT NULL AND p_radius_miles > 0 THEN
    v_min_lat := p_latitude - (p_radius_miles / 69.0) * 1.1;
    v_max_lat := p_latitude + (p_radius_miles / 69.0) * 1.1;
    v_min_lng := p_longitude - (p_radius_miles / (69.0 * COS(RADIANS(p_latitude)))) * 1.1;
    v_max_lng := p_longitude + (p_radius_miles / (69.0 * COS(RADIANS(p_latitude)))) * 1.1;

    -- Use UNION of two queries for better index usage:
    -- 1. Events with their own coordinates (uses spatial index on events)
    -- 2. Events without coordinates but venue has coordinates (uses spatial index on venues)
    RETURN QUERY
    WITH combined_events AS (
      -- Query 1: Events with their own coordinates (fast - uses events spatial index)
      SELECT
        e.id,
        e.title,
        a.name as artist_name,
        e.artist_id,
        v.name as venue_name,
        e.venue_id,
        e.event_date,
        e.doors_time,
        e.description,
        e.genres,
        e.venue_address,
        e.venue_city,
        e.venue_state,
        e.venue_zip,
        e.latitude,
        e.longitude,
        e.ticket_available,
        e.price_range,
        e.ticket_urls,
        e.setlist,
        e.tour_name,
        e.event_media_url,
        e.created_at,
        e.updated_at,
        calculate_distance(
          p_latitude::FLOAT,
          p_longitude::FLOAT,
          e.latitude::FLOAT,
          e.longitude::FLOAT
        )::NUMERIC as calc_distance
      FROM public.events e
      LEFT JOIN public.artists a ON a.id = e.artist_id
      LEFT JOIN public.venues v ON v.id = e.venue_id
      WHERE e.latitude IS NOT NULL
        AND e.longitude IS NOT NULL
        AND e.latitude BETWEEN v_min_lat AND v_max_lat
        AND e.longitude BETWEEN v_min_lng AND v_max_lng
        AND e.event_date >= v_min_date
        AND (
          (v_genre_filter AND EXISTS (
            SELECT 1 FROM events_genres eg
            WHERE eg.event_id = e.id
              AND eg.genre_id IN (SELECT * FROM get_genres_under_umbrella(p_umbrella_slug, GREATEST(1, LEAST(COALESCE(p_max_depth, 5), 10))))
          ))
          OR
          (NOT v_genre_filter AND (p_genres IS NULL OR e.genres && p_genres))
        )
      
      UNION ALL
      
      -- Query 2: Events without coordinates but venue has coordinates (uses venues spatial index)
      SELECT
        e.id,
        e.title,
        a.name as artist_name,
        e.artist_id,
        v.name as venue_name,
        e.venue_id,
        e.event_date,
        e.doors_time,
        e.description,
        e.genres,
        e.venue_address,
        e.venue_city,
        e.venue_state,
        e.venue_zip,
        v.latitude,
        v.longitude,
        e.ticket_available,
        e.price_range,
        e.ticket_urls,
        e.setlist,
        e.tour_name,
        e.event_media_url,
        e.created_at,
        e.updated_at,
        calculate_distance(
          p_latitude::FLOAT,
          p_longitude::FLOAT,
          v.latitude::FLOAT,
          v.longitude::FLOAT
        )::NUMERIC as calc_distance
      FROM public.events e
      LEFT JOIN public.artists a ON a.id = e.artist_id
      INNER JOIN public.venues v ON v.id = e.venue_id
      WHERE (e.latitude IS NULL OR e.longitude IS NULL)
        AND v.latitude IS NOT NULL
        AND v.longitude IS NOT NULL
        AND v.latitude BETWEEN v_min_lat AND v_max_lat
        AND v.longitude BETWEEN v_min_lng AND v_max_lng
        AND e.event_date >= v_min_date
        AND (
          (v_genre_filter AND EXISTS (
            SELECT 1 FROM events_genres eg
            WHERE eg.event_id = e.id
              AND eg.genre_id IN (SELECT * FROM get_genres_under_umbrella(p_umbrella_slug, GREATEST(1, LEAST(COALESCE(p_max_depth, 5), 10))))
          ))
          OR
          (NOT v_genre_filter AND (p_genres IS NULL OR e.genres && p_genres))
        )
    )
    SELECT
      ce.id, ce.title, ce.artist_name, ce.artist_id, ce.venue_name, ce.venue_id,
      ce.event_date, ce.doors_time, ce.description, ce.genres,
      ce.venue_address, ce.venue_city, ce.venue_state, ce.venue_zip,
      ce.latitude, ce.longitude, ce.ticket_available, ce.price_range, ce.ticket_urls,
      ce.setlist, ce.tour_name, ce.event_media_url, ce.created_at, ce.updated_at,
      ce.calc_distance as distance_miles
    FROM combined_events ce
    WHERE ce.calc_distance <= p_radius_miles
    ORDER BY ce.event_date ASC
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT
      e.id,
      e.title,
      a.name as artist_name,
      e.artist_id,
      v.name as venue_name,
      e.venue_id,
      e.event_date,
      e.doors_time,
      e.description,
      e.genres,
      e.venue_address,
      e.venue_city,
      e.venue_state,
      e.venue_zip,
      COALESCE(e.latitude, v.latitude) as latitude,
      COALESCE(e.longitude, v.longitude) as longitude,
      e.ticket_available,
      e.price_range,
      e.ticket_urls,
      e.setlist,
      e.tour_name,
      e.event_media_url,
      e.created_at,
      e.updated_at,
      NULL::NUMERIC as distance_miles
    FROM public.events e
    LEFT JOIN public.artists a ON a.id = e.artist_id
    LEFT JOIN public.venues v ON v.id = e.venue_id
    WHERE e.event_date >= v_min_date
      AND (
        (v_genre_filter AND EXISTS (
          SELECT 1 FROM events_genres eg
          WHERE eg.event_id = e.id
            AND eg.genre_id IN (SELECT * FROM get_genres_under_umbrella(p_umbrella_slug, GREATEST(1, LEAST(COALESCE(p_max_depth, 5), 10))))
        ))
        OR
        (NOT v_genre_filter AND (p_genres IS NULL OR e.genres && p_genres))
      )
    ORDER BY e.event_date ASC
    LIMIT p_limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_calendar_events(
  NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, TEXT[], INT, TEXT, INT
) TO authenticated;

-- Backward-compatible overload (no umbrella params)
DROP FUNCTION IF EXISTS public.get_calendar_events(
  NUMERIC,
  NUMERIC,
  NUMERIC,
  TIMESTAMPTZ,
  TEXT[],
  INT
);

CREATE OR REPLACE FUNCTION public.get_calendar_events(
  p_latitude NUMERIC DEFAULT NULL,
  p_longitude NUMERIC DEFAULT NULL,
  p_radius_miles NUMERIC DEFAULT NULL,
  p_min_date TIMESTAMPTZ DEFAULT NULL,
  p_genres TEXT[] DEFAULT NULL,
  p_limit INT DEFAULT 1500
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  artist_name TEXT,
  artist_id UUID,
  venue_name TEXT,
  venue_id UUID,
  event_date TIMESTAMPTZ,
  doors_time TIMESTAMPTZ,
  description TEXT,
  genres TEXT[],
  venue_address TEXT,
  venue_city TEXT,
  venue_state TEXT,
  venue_zip TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  ticket_available BOOLEAN,
  price_range TEXT,
  ticket_urls TEXT[],
  setlist JSONB,
  tour_name TEXT,
  event_media_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  distance_miles NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.get_calendar_events(
    p_latitude, p_longitude, p_radius_miles, p_min_date, p_genres, p_limit,
    NULL::TEXT, 5
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_calendar_events(
  NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, TEXT[], INT
) TO authenticated;

COMMENT ON FUNCTION public.get_calendar_events(NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, TEXT[], INT, TEXT, INT) IS
  'Calendar events with venue coordinate fallback. Uses event lat/long if available, otherwise venue lat/long.';

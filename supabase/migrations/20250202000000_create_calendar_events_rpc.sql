-- ============================================================
-- MIGRATION: Create RPC function for calendar events
-- Uses spatial index properly with BETWEEN operator instead
-- of PostgREST query builder which doesn't use the index
-- ============================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.get_calendar_events(
  NUMERIC,
  NUMERIC,
  NUMERIC,
  TIMESTAMPTZ,
  TEXT[],
  INT
);

-- Create RPC function for calendar events that uses spatial index
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
DECLARE
  v_min_date TIMESTAMPTZ := COALESCE(p_min_date, NOW());
  v_min_lat NUMERIC;
  v_max_lat NUMERIC;
  v_min_lng NUMERIC;
  v_max_lng NUMERIC;
BEGIN
  -- If we have location and radius, calculate bounding box
  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL AND p_radius_miles IS NOT NULL AND p_radius_miles > 0 THEN
    -- Calculate bounding box (slightly larger than radius for safety)
    v_min_lat := p_latitude - (p_radius_miles / 69.0) * 1.1;
    v_max_lat := p_latitude + (p_radius_miles / 69.0) * 1.1;
    v_min_lng := p_longitude - (p_radius_miles / (69.0 * COS(RADIANS(p_latitude)))) * 1.1;
    v_max_lng := p_longitude + (p_radius_miles / (69.0 * COS(RADIANS(p_latitude)))) * 1.1;
    
    -- Return events using spatial index with BETWEEN operator
    -- This allows PostgreSQL to use idx_events_latitude_longitude or idx_events_date_location
    -- Two-stage approach: bounding box (uses index) then exact distance filter
    RETURN QUERY
    WITH bounding_box_candidates AS (
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
        -- Use BETWEEN for spatial index (this is what makes it fast!)
        AND e.latitude BETWEEN v_min_lat AND v_max_lat
        AND e.longitude BETWEEN v_min_lng AND v_max_lng
        AND e.event_date >= v_min_date
        AND (p_genres IS NULL OR e.genres && p_genres)
    )
    SELECT
      bbc.id,
      bbc.title,
      bbc.artist_name,
      bbc.artist_id,
      bbc.venue_name,
      bbc.venue_id,
      bbc.event_date,
      bbc.doors_time,
      bbc.description,
      bbc.genres,
      bbc.venue_address,
      bbc.venue_city,
      bbc.venue_state,
      bbc.venue_zip,
      bbc.latitude,
      bbc.longitude,
      bbc.ticket_available,
      bbc.price_range,
      bbc.ticket_urls,
      bbc.setlist,
      bbc.tour_name,
      bbc.event_media_url,
      bbc.created_at,
      bbc.updated_at,
      bbc.calc_distance as distance_miles
    FROM bounding_box_candidates bbc
    WHERE bbc.calc_distance <= p_radius_miles
    ORDER BY bbc.event_date ASC
    LIMIT p_limit;
  ELSE
    -- No location filter - just date and genre filters
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
      NULL::NUMERIC as distance_miles
    FROM public.events e
    LEFT JOIN public.artists a ON a.id = e.artist_id
    LEFT JOIN public.venues v ON v.id = e.venue_id
    WHERE e.event_date >= v_min_date
      AND (p_genres IS NULL OR e.genres && p_genres)
    ORDER BY e.event_date ASC
    LIMIT p_limit;
  END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_calendar_events(
  NUMERIC,
  NUMERIC,
  NUMERIC,
  TIMESTAMPTZ,
  TEXT[],
  INT
) TO authenticated;

-- Comment
COMMENT ON FUNCTION public.get_calendar_events IS 'Gets calendar events with proper spatial index usage. Uses BETWEEN operator to leverage idx_events_latitude_longitude or idx_events_date_location indexes.';


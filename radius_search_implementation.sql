-- Implementation for radius-based event search using zip codes
-- This shows the best practices for geospatial event search

-- 1. First, we need to create a zip code lookup table with coordinates
-- This would typically be a separate table, but we can work with what we have

-- 2. Function to calculate distance between two points (Haversine formula)
CREATE OR REPLACE FUNCTION calculate_distance(
    lat1 FLOAT, 
    lon1 FLOAT, 
    lat2 FLOAT, 
    lon2 FLOAT
) RETURNS FLOAT AS $$
BEGIN
    RETURN (
        3959 * acos(
            cos(radians(lat1)) * 
            cos(radians(lat2)) * 
            cos(radians(lon2) - radians(lon1)) + 
            sin(radians(lat1)) * 
            sin(radians(lat2))
        )
    );
END;
$$ LANGUAGE plpgsql;

-- 3. Function to get events within radius of a zip code
CREATE OR REPLACE FUNCTION get_events_near_zip(
    search_zip TEXT,
    radius_miles FLOAT DEFAULT 25.0
) RETURNS TABLE (
    id UUID,
    title TEXT,
    venue_name TEXT,
    venue_city TEXT,
    venue_state TEXT,
    venue_zip TEXT,
    latitude FLOAT,
    longitude FLOAT,
    event_date TIMESTAMPTZ,
    distance_miles FLOAT
) AS $$
DECLARE
    center_lat FLOAT;
    center_lon FLOAT;
BEGIN
    -- Get the center coordinates for the search zip
    SELECT latitude, longitude INTO center_lat, center_lon
    FROM jambase_events 
    WHERE venue_zip = search_zip 
        AND latitude IS NOT NULL 
        AND longitude IS NOT NULL
    LIMIT 1;
    
    -- If we don't have coordinates for the search zip, return empty
    IF center_lat IS NULL OR center_lon IS NULL THEN
        RETURN;
    END IF;
    
    -- Return events within the radius
    RETURN QUERY
    SELECT 
        e.id,
        e.title,
        e.venue_name,
        e.venue_city,
        e.venue_state,
        e.venue_zip,
        e.latitude,
        e.longitude,
        e.event_date,
        calculate_distance(center_lat, center_lon, e.latitude, e.longitude) as distance_miles
    FROM jambase_events e
    WHERE e.latitude IS NOT NULL 
        AND e.longitude IS NOT NULL
        AND e.event_date >= NOW()
        AND calculate_distance(center_lat, center_lon, e.latitude, e.longitude) <= radius_miles
    ORDER BY distance_miles ASC, e.event_date ASC;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to get events near a city (using city's zip codes)
CREATE OR REPLACE FUNCTION get_events_near_city(
    search_city TEXT,
    search_state TEXT DEFAULT NULL,
    radius_miles FLOAT DEFAULT 25.0
) RETURNS TABLE (
    id UUID,
    title TEXT,
    venue_name TEXT,
    venue_city TEXT,
    venue_state TEXT,
    venue_zip TEXT,
    latitude FLOAT,
    longitude FLOAT,
    event_date TIMESTAMPTZ,
    distance_miles FLOAT
) AS $$
DECLARE
    center_lat FLOAT;
    center_lon FLOAT;
    city_condition TEXT;
BEGIN
    -- Build the city condition
    IF search_state IS NOT NULL THEN
        city_condition := 'venue_city = $1 AND venue_state = $2';
    ELSE
        city_condition := 'venue_city = $1';
    END IF;
    
    -- Get the center coordinates for the city (average of all events in that city)
    EXECUTE format('
        SELECT AVG(latitude), AVG(longitude) 
        FROM jambase_events 
        WHERE %s 
            AND latitude IS NOT NULL 
            AND longitude IS NOT NULL
            AND event_date >= NOW()
    ', city_condition)
    INTO center_lat, center_lon
    USING search_city, search_state;
    
    -- If we don't have coordinates for the city, return empty
    IF center_lat IS NULL OR center_lon IS NULL THEN
        RETURN;
    END IF;
    
    -- Return events within the radius
    RETURN QUERY
    SELECT 
        e.id,
        e.title,
        e.venue_name,
        e.venue_city,
        e.venue_state,
        e.venue_zip,
        e.latitude,
        e.longitude,
        e.event_date,
        calculate_distance(center_lat, center_lon, e.latitude, e.longitude) as distance_miles
    FROM jambase_events e
    WHERE e.latitude IS NOT NULL 
        AND e.longitude IS NOT NULL
        AND e.event_date >= NOW()
        AND calculate_distance(center_lat, center_lon, e.latitude, e.longitude) <= radius_miles
    ORDER BY distance_miles ASC, e.event_date ASC;
END;
$$ LANGUAGE plpgsql;

-- 5. Example usage queries
-- Get events within 25 miles of zip code 20001 (Washington DC)
-- SELECT * FROM get_events_near_zip('20001', 25.0);

-- Get events within 50 miles of New York
-- SELECT * FROM get_events_near_city('New York', 'NY', 50.0);

-- 6. Create an index for better performance
CREATE INDEX IF NOT EXISTS idx_jambase_events_location 
ON jambase_events (latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jambase_events_zip 
ON jambase_events (venue_zip) 
WHERE venue_zip IS NOT NULL AND venue_zip != '';

-- Implementation for radius-based event search using zip codes
-- Run this SQL in your Supabase SQL editor

-- 1. Function to calculate distance between two points (Haversine formula)
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

-- 2. Function to get events within radius of a zip code
CREATE OR REPLACE FUNCTION get_events_near_zip_improved(
    search_zip TEXT,
    radius_miles FLOAT DEFAULT 25.0
) RETURNS TABLE (
    id UUID,
    jambase_event_id TEXT,
    title TEXT,
    artist_name TEXT,
    artist_id TEXT,
    venue_name TEXT,
    venue_id TEXT,
    event_date TIMESTAMPTZ,
    doors_time TEXT,
    description TEXT,
    genres TEXT[],
    venue_address TEXT,
    venue_city TEXT,
    venue_state TEXT,
    venue_zip TEXT,
    latitude FLOAT,
    longitude FLOAT,
    ticket_available BOOLEAN,
    price_range TEXT,
    ticket_urls TEXT[],
    setlist JSONB,
    tour_name TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
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
        e.jambase_event_id,
        e.title,
        e.artist_name,
        e.artist_id,
        e.venue_name,
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
        e.created_at,
        e.updated_at,
        calculate_distance(center_lat, center_lon, e.latitude, e.longitude) as distance_miles
    FROM jambase_events e
    WHERE e.latitude IS NOT NULL 
        AND e.longitude IS NOT NULL
        AND e.event_date >= NOW()
        AND calculate_distance(center_lat, center_lon, e.latitude, e.longitude) <= radius_miles
    ORDER BY distance_miles ASC, e.event_date ASC;
END;
$$ LANGUAGE plpgsql;

-- 3. Function to get events near a city
CREATE OR REPLACE FUNCTION get_events_near_city(
    search_city TEXT,
    search_state TEXT DEFAULT NULL,
    radius_miles FLOAT DEFAULT 25.0
) RETURNS TABLE (
    id UUID,
    jambase_event_id TEXT,
    title TEXT,
    artist_name TEXT,
    artist_id TEXT,
    venue_name TEXT,
    venue_id TEXT,
    event_date TIMESTAMPTZ,
    doors_time TEXT,
    description TEXT,
    genres TEXT[],
    venue_address TEXT,
    venue_city TEXT,
    venue_state TEXT,
    venue_zip TEXT,
    latitude FLOAT,
    longitude FLOAT,
    ticket_available BOOLEAN,
    price_range TEXT,
    ticket_urls TEXT[],
    setlist JSONB,
    tour_name TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
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
        e.jambase_event_id,
        e.title,
        e.artist_name,
        e.artist_id,
        e.venue_name,
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
        e.created_at,
        e.updated_at,
        calculate_distance(center_lat, center_lon, e.latitude, e.longitude) as distance_miles
    FROM jambase_events e
    WHERE e.latitude IS NOT NULL 
        AND e.longitude IS NOT NULL
        AND e.event_date >= NOW()
        AND calculate_distance(center_lat, center_lon, e.latitude, e.longitude) <= radius_miles
    ORDER BY distance_miles ASC, e.event_date ASC;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to get zip codes near a city
CREATE OR REPLACE FUNCTION get_zips_near_city(
    search_city TEXT,
    search_state TEXT DEFAULT NULL,
    radius_miles FLOAT DEFAULT 25.0
) RETURNS TABLE (
    zip_code TEXT,
    city TEXT,
    state TEXT,
    latitude FLOAT,
    longitude FLOAT,
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
    
    -- Get the center coordinates for the city
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
    
    -- Return unique zip codes within the radius
    RETURN QUERY
    SELECT DISTINCT
        e.venue_zip as zip_code,
        e.venue_city as city,
        e.venue_state as state,
        e.latitude,
        e.longitude,
        calculate_distance(center_lat, center_lon, e.latitude, e.longitude) as distance_miles
    FROM jambase_events e
    WHERE e.latitude IS NOT NULL 
        AND e.longitude IS NOT NULL
        AND e.venue_zip IS NOT NULL
        AND e.venue_zip != ''
        AND e.event_date >= NOW()
        AND calculate_distance(center_lat, center_lon, e.latitude, e.longitude) <= radius_miles
    ORDER BY distance_miles ASC;
END;
$$ LANGUAGE plpgsql;

-- 5. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_jambase_events_location 
ON jambase_events (latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jambase_events_zip 
ON jambase_events (venue_zip) 
WHERE venue_zip IS NOT NULL AND venue_zip != '';

CREATE INDEX IF NOT EXISTS idx_jambase_events_city_state 
ON jambase_events (venue_city, venue_state) 
WHERE venue_city IS NOT NULL;

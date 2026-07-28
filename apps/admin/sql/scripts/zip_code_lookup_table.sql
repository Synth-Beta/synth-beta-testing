-- Create a zip code lookup table for better radius search performance
-- This is a best practice for location-based searches

-- 1. Create zip code lookup table
CREATE TABLE IF NOT EXISTS zip_codes (
    zip_code VARCHAR(10) PRIMARY KEY,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Populate zip codes from existing event data
INSERT INTO zip_codes (zip_code, city, state, latitude, longitude)
SELECT DISTINCT
    venue_zip,
    venue_city,
    venue_state,
    AVG(latitude) as avg_lat,
    AVG(longitude) as avg_lon
FROM jambase_events 
WHERE venue_zip IS NOT NULL 
    AND venue_zip != ''
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL
    AND event_date >= NOW()
GROUP BY venue_zip, venue_city, venue_state
ON CONFLICT (zip_code) DO UPDATE SET
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    updated_at = NOW();

-- 3. Add some common zip codes that might be missing
-- You can expand this list with more zip codes as needed
INSERT INTO zip_codes (zip_code, city, state, latitude, longitude) VALUES
('10001', 'New York', 'NY', 40.7505, -73.9934),
('10002', 'New York', 'NY', 40.7171, -73.9780),
('10003', 'New York', 'NY', 40.7323, -73.9886),
('20001', 'Washington', 'DC', 38.9072, -77.0369),
('20002', 'Washington', 'DC', 38.9072, -77.0369),
('90210', 'Beverly Hills', 'CA', 34.0901, -118.4065),
('90211', 'Beverly Hills', 'CA', 34.0901, -118.4065),
('94102', 'San Francisco', 'CA', 37.7749, -122.4194),
('94103', 'San Francisco', 'CA', 37.7749, -122.4194),
('60601', 'Chicago', 'IL', 41.8781, -87.6298),
('60602', 'Chicago', 'IL', 41.8781, -87.6298),
('33101', 'Miami', 'FL', 25.7617, -80.1918),
('33102', 'Miami', 'FL', 25.7617, -80.1918)
ON CONFLICT (zip_code) DO NOTHING;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_zip_codes_location ON zip_codes (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_zip_codes_city_state ON zip_codes (city, state);

-- 5. Function to get events near a zip code (improved version)
CREATE OR REPLACE FUNCTION get_events_near_zip_improved(
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
    center_lat DECIMAL(10, 8);
    center_lon DECIMAL(11, 8);
BEGIN
    -- Get coordinates from zip code lookup table
    SELECT latitude, longitude INTO center_lat, center_lon
    FROM zip_codes 
    WHERE zip_code = search_zip;
    
    -- If zip code not found, return empty
    IF center_lat IS NULL OR center_lon IS NULL THEN
        RETURN;
    END IF;
    
    -- Return events within radius using efficient bounding box + distance filter
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
        calculate_distance(center_lat::FLOAT, center_lon::FLOAT, e.latitude, e.longitude) as distance_miles
    FROM jambase_events e
    WHERE e.latitude IS NOT NULL 
        AND e.longitude IS NOT NULL
        AND e.event_date >= NOW()
        -- Bounding box filter for performance (rough approximation)
        AND e.latitude BETWEEN (center_lat - (radius_miles / 69.0)) AND (center_lat + (radius_miles / 69.0))
        AND e.longitude BETWEEN (center_lon - (radius_miles / (69.0 * COS(RADIANS(center_lat))))) AND (center_lon + (radius_miles / (69.0 * COS(RADIANS(center_lat)))))
        -- Exact distance filter
        AND calculate_distance(center_lat::FLOAT, center_lon::FLOAT, e.latitude, e.longitude) <= radius_miles
    ORDER BY distance_miles ASC, e.event_date ASC;
END;
$$ LANGUAGE plpgsql;

-- 6. Function to get zip codes near a city
CREATE OR REPLACE FUNCTION get_zips_near_city(
    search_city TEXT,
    search_state TEXT DEFAULT NULL,
    radius_miles FLOAT DEFAULT 25.0
) RETURNS TABLE (
    zip_code VARCHAR(10),
    city VARCHAR(100),
    state VARCHAR(2),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    distance_miles FLOAT
) AS $$
DECLARE
    center_lat DECIMAL(10, 8);
    center_lon DECIMAL(11, 8);
BEGIN
    -- Get city center coordinates
    SELECT AVG(latitude), AVG(longitude) INTO center_lat, center_lon
    FROM zip_codes 
    WHERE city = search_city 
        AND (search_state IS NULL OR state = search_state);
    
    IF center_lat IS NULL OR center_lon IS NULL THEN
        RETURN;
    END IF;
    
    -- Return zip codes within radius
    RETURN QUERY
    SELECT 
        z.zip_code,
        z.city,
        z.state,
        z.latitude,
        z.longitude,
        calculate_distance(center_lat::FLOAT, center_lon::FLOAT, z.latitude::FLOAT, z.longitude::FLOAT) as distance_miles
    FROM zip_codes z
    WHERE calculate_distance(center_lat::FLOAT, center_lon::FLOAT, z.latitude::FLOAT, z.longitude::FLOAT) <= radius_miles
    ORDER BY distance_miles ASC;
END;
$$ LANGUAGE plpgsql;

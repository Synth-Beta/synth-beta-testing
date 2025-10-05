-- Analyze location data structure and zip code availability
-- This will help us understand what data we have to work with

-- 1. Check what location columns we have and their data quality
SELECT 
    COUNT(*) as total_events,
    COUNT(venue_city) as has_city,
    COUNT(venue_state) as has_state,
    COUNT(venue_zip) as has_zip,
    COUNT(latitude) as has_latitude,
    COUNT(longitude) as has_longitude,
    COUNT(venue_address) as has_address
FROM jambase_events 
WHERE event_date >= NOW();

-- 2. Sample of events with zip codes
SELECT 
    venue_city,
    venue_state,
    venue_zip,
    latitude,
    longitude,
    venue_address,
    COUNT(*) as event_count
FROM jambase_events 
WHERE venue_zip IS NOT NULL 
    AND venue_zip != ''
    AND event_date >= NOW()
GROUP BY venue_city, venue_state, venue_zip, latitude, longitude, venue_address
ORDER BY event_count DESC
LIMIT 20;

-- 3. Check zip code format variations
SELECT 
    venue_zip,
    LENGTH(venue_zip) as zip_length,
    COUNT(*) as event_count
FROM jambase_events 
WHERE venue_zip IS NOT NULL 
    AND venue_zip != ''
    AND event_date >= NOW()
GROUP BY venue_zip
ORDER BY event_count DESC
LIMIT 30;

-- 4. Check for events with coordinates but no zip
SELECT 
    venue_city,
    venue_state,
    latitude,
    longitude,
    COUNT(*) as event_count
FROM jambase_events 
WHERE (venue_zip IS NULL OR venue_zip = '')
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL
    AND event_date >= NOW()
GROUP BY venue_city, venue_state, latitude, longitude
ORDER BY event_count DESC
LIMIT 20;

-- 5. Check for events with zip but no coordinates
SELECT 
    venue_city,
    venue_state,
    venue_zip,
    COUNT(*) as event_count
FROM jambase_events 
WHERE venue_zip IS NOT NULL 
    AND venue_zip != ''
    AND (latitude IS NULL OR longitude IS NULL)
    AND event_date >= NOW()
GROUP BY venue_city, venue_state, venue_zip
ORDER BY event_count DESC
LIMIT 20;

-- 6. Geographic distribution of events
SELECT 
    venue_state,
    COUNT(DISTINCT venue_city) as unique_cities,
    COUNT(*) as total_events
FROM jambase_events 
WHERE event_date >= NOW()
GROUP BY venue_state
ORDER BY total_events DESC;

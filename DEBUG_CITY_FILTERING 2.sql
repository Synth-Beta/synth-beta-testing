-- Debug coordinate-based city filtering
-- Run these queries to troubleshoot why get_events_by_city_coordinates returns 0 results

-- 1. Check if city exists in city_centers (case-sensitive check)
SELECT city_name, state, center_latitude, center_longitude, event_count
FROM city_centers
WHERE city_name = 'New York' OR city_name = 'Amsterdam'
ORDER BY event_count DESC;

-- 2. Check case-insensitive matches
SELECT city_name, state, center_latitude, center_longitude, event_count
FROM city_centers
WHERE city_name ILIKE '%new york%' OR city_name ILIKE '%amsterdam%'
ORDER BY event_count DESC;

-- 3. Test if city coordinates exist and are valid
SELECT 
  city_name,
  state,
  center_latitude,
  center_longitude,
  CASE 
    WHEN center_latitude IS NULL OR center_longitude IS NULL THEN 'MISSING COORDS'
    WHEN center_latitude BETWEEN -90 AND 90 AND center_longitude BETWEEN -180 AND 180 THEN 'VALID'
    ELSE 'INVALID RANGE'
  END as coord_status,
  event_count
FROM city_centers
WHERE city_name IN ('New York', 'Amsterdam', 'Chicago', 'Los Angeles')
ORDER BY city_name, state;

-- 4. Test if function finds city coordinates (simulate the LOOP query)
SELECT DISTINCT
  cc.city_name,
  cc.state,
  cc.center_latitude as lat,
  cc.center_longitude as lng
FROM city_centers cc
WHERE cc.city_name = ANY(ARRAY['New York'])
  AND (
    NULL IS NULL  -- state_codes IS NULL
    OR cc.state = ANY(ARRAY[]::TEXT[])
  );

-- 5. Manually test events near a city center using exact coordinates
WITH nyc_coords AS (
  SELECT center_latitude as lat, center_longitude as lng
  FROM city_centers
  WHERE city_name = 'New York' AND state = 'NY'
  LIMIT 1
)
SELECT COUNT(*) as events_found
FROM jambase_events je, nyc_coords
WHERE je.latitude IS NOT NULL
  AND je.longitude IS NOT NULL
  AND je.event_date >= NOW()
  AND calculate_distance(nyc_coords.lat::FLOAT, nyc_coords.lng::FLOAT, je.latitude::FLOAT, je.longitude::FLOAT) <= 50;

-- 6. Check if there are any upcoming events with coordinates at all
SELECT COUNT(*) as total_upcoming_events_with_coords
FROM jambase_events
WHERE event_date >= NOW()
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL;

-- 7. Sample some event coordinates to verify they're reasonable
SELECT 
  title,
  venue_city,
  latitude,
  longitude,
  event_date
FROM jambase_events
WHERE event_date >= NOW()
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL
LIMIT 10;

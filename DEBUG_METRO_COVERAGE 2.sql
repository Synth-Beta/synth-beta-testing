-- Debug metro area coverage - why aren't Newark/Jersey City appearing?

-- 1. Check if Newark/Jersey City events exist in database
SELECT 
  display_city,
  venue_state,
  COUNT(*) as event_count,
  AVG(latitude) as avg_lat,
  AVG(longitude) as avg_lng
FROM jambase_events
WHERE event_date >= NOW()
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND (display_city ILIKE '%newark%' 
       OR display_city ILIKE '%jersey city%'
       OR display_city ILIKE '%brooklyn%'
       OR venue_city ILIKE '%newark%'
       OR venue_city ILIKE '%jersey city%'
       OR venue_city ILIKE '%brooklyn%')
GROUP BY display_city, venue_state
ORDER BY event_count DESC;

-- 2. Get NYC center coordinates
SELECT city_name, state, center_latitude, center_longitude
FROM city_centers
WHERE city_name = 'New York' AND state = 'NY';

-- 3. Check distance from NYC center to Newark events manually
WITH nyc_center AS (
  SELECT center_latitude as lat, center_longitude as lng
  FROM city_centers
  WHERE city_name = 'New York' AND state = 'NY'
  LIMIT 1
)
SELECT 
  je.display_city,
  je.venue_city,
  je.venue_state,
  je.latitude,
  je.longitude,
  calculate_distance(nyc.lat::FLOAT, nyc.lng::FLOAT, je.latitude::FLOAT, je.longitude::FLOAT) as distance_miles
FROM jambase_events je, nyc_center nyc
WHERE je.event_date >= NOW()
  AND je.latitude IS NOT NULL
  AND je.longitude IS NOT NULL
  AND (je.display_city ILIKE '%newark%' 
       OR je.display_city ILIKE '%jersey city%'
       OR je.display_city ILIKE '%brooklyn%'
       OR je.venue_city ILIKE '%newark%'
       OR je.venue_city ILIKE '%jersey city%'
       OR je.venue_city ILIKE '%brooklyn%')
ORDER BY distance_miles ASC
LIMIT 20;

-- 4. Test if events within 50 miles of NYC center exist (regardless of city name)
WITH nyc_center AS (
  SELECT center_latitude as lat, center_longitude as lng
  FROM city_centers
  WHERE city_name = 'New York' AND state = 'NY'
  LIMIT 1
)
SELECT 
  je.display_city,
  je.venue_state,
  COUNT(*) as event_count,
  MIN(calculate_distance(nyc.lat::FLOAT, nyc.lng::FLOAT, je.latitude::FLOAT, je.longitude::FLOAT)) as min_dist,
  MAX(calculate_distance(nyc.lat::FLOAT, nyc.lng::FLOAT, je.latitude::FLOAT, je.longitude::FLOAT)) as max_dist
FROM jambase_events je, nyc_center nyc
WHERE je.event_date >= NOW()
  AND je.latitude IS NOT NULL
  AND je.longitude IS NOT NULL
  AND calculate_distance(nyc.lat::FLOAT, nyc.lng::FLOAT, je.latitude::FLOAT, je.longitude::FLOAT) <= 50
GROUP BY je.display_city, je.venue_state
ORDER BY event_count DESC
LIMIT 30;

-- 5. Check what the function's bounding box finds
WITH nyc_center AS (
  SELECT center_latitude as lat, center_longitude as lng
  FROM city_centers
  WHERE city_name = 'New York' AND state = 'NY'
  LIMIT 1
)
SELECT 
  je.display_city,
  je.venue_state,
  COUNT(*) as events_in_bbox,
  calculate_distance(nyc.lat::FLOAT, nyc.lng::FLOAT, AVG(je.latitude)::FLOAT, AVG(je.longitude)::FLOAT) as avg_distance
FROM jambase_events je, nyc_center nyc
WHERE je.event_date >= NOW()
  AND je.latitude IS NOT NULL
  AND je.longitude IS NOT NULL
  -- Bounding box filter (what the function uses first)
  AND je.latitude BETWEEN (nyc.lat - (50.0 / 69.0)) AND (nyc.lat + (50.0 / 69.0))
  AND je.longitude BETWEEN (nyc.lng - (50.0 / (69.0 * COS(RADIANS(nyc.lat))))) 
                        AND (nyc.lng + (50.0 / (69.0 * COS(RADIANS(nyc.lat)))))
GROUP BY je.display_city, je.venue_state
ORDER BY events_in_bbox DESC
LIMIT 30;


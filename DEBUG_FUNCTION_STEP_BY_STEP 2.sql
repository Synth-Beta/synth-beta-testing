-- Step-by-step debugging of the function to see where events are lost

-- Step 1: Check what city centers are found
SELECT DISTINCT
  cc.city_name,
  cc.state,
  cc.center_latitude as lat,
  cc.center_longitude as lng
FROM city_centers cc
WHERE LOWER(TRIM(cc.city_name)) = ANY(SELECT LOWER(TRIM(unnest(ARRAY['New York']))));

-- Step 2: Simulate the LOOP - collect event_ids manually for NYC center
WITH nyc_center AS (
  SELECT center_latitude as lat, center_longitude as lng
  FROM city_centers
  WHERE city_name = 'New York' AND state = 'NY'
  LIMIT 1
)
SELECT COUNT(*) as events_in_bbox
FROM jambase_events je, nyc_center nyc
WHERE je.latitude IS NOT NULL
  AND je.longitude IS NOT NULL
  AND je.event_date >= NOW()
  -- Bounding box
  AND je.latitude BETWEEN (nyc.lat - (50.0 / 69.0)) AND (nyc.lat + (50.0 / 69.0))
  AND je.longitude BETWEEN (nyc.lng - (50.0 / (69.0 * COS(RADIANS(nyc.lat))))) 
                        AND (nyc.lng + (50.0 / (69.0 * COS(RADIANS(nyc.lat)))));

-- Step 3: Check events that pass both bounding box AND distance filter
WITH nyc_center AS (
  SELECT center_latitude as lat, center_longitude as lng
  FROM city_centers
  WHERE city_name = 'New York' AND state = 'NY'
  LIMIT 1
)
SELECT 
  je.venue_city,
  je.display_city,
  je.venue_state,
  COUNT(*) as event_count,
  MIN(calculate_distance(nyc.lat::FLOAT, nyc.lng::FLOAT, je.latitude::FLOAT, je.longitude::FLOAT)) as min_dist,
  MAX(calculate_distance(nyc.lat::FLOAT, nyc.lng::FLOAT, je.latitude::FLOAT, je.longitude::FLOAT)) as max_dist
FROM jambase_events je, nyc_center nyc
WHERE je.latitude IS NOT NULL
  AND je.longitude IS NOT NULL
  AND je.event_date >= NOW()
  -- Bounding box
  AND je.latitude BETWEEN (nyc.lat - (50.0 / 69.0)) AND (nyc.lat + (50.0 / 69.0))
  AND je.longitude BETWEEN (nyc.lng - (50.0 / (69.0 * COS(RADIANS(nyc.lat))))) 
                        AND (nyc.lng + (50.0 / (69.0 * COS(RADIANS(nyc.lat)))))
  -- Distance filter (what the function uses)
  AND calculate_distance(nyc.lat::FLOAT, nyc.lng::FLOAT, je.latitude::FLOAT, je.longitude::FLOAT) <= 50
GROUP BY je.venue_city, je.display_city, je.venue_state
ORDER BY event_count DESC;

-- Step 4: Test the actual function with debug output
-- Check if the issue is in the final RETURN QUERY's distance recalculation
SELECT COUNT(*) as total_from_function
FROM get_events_by_city_coordinates(ARRAY['New York'], NULL, 50, 1000);


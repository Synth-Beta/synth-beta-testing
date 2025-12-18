-- Simple test to see what's happening in the feed
-- This tests each CTE step by step

-- Test 1: Check if event_candidates finds events
WITH has_location AS (
  SELECT (NULL IS NOT NULL AND NULL IS NOT NULL) AS has_loc
)
SELECT 
  COUNT(*) as event_count,
  MIN(event_date) as earliest_event,
  MAX(event_date) as latest_event
FROM events e
CROSS JOIN (SELECT NULL::NUMERIC AS p_city_lat, NULL::NUMERIC AS p_city_lng) AS loc
WHERE e.event_date >= NOW() - INTERVAL '30 days'
  AND e.event_date <= NOW() + INTERVAL '365 days'
  AND (
    loc.p_city_lat IS NULL
    OR e.latitude IS NULL
    OR e.longitude IS NULL
    OR TRUE
  );

-- Test 2: Direct function call with NULL location
SELECT 
  COUNT(*) as result_count,
  COUNT(DISTINCT type) as type_count,
  string_agg(DISTINCT type, ', ') as types_found
FROM get_personalized_feed_v3(
  '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
  50,
  0,
  NULL,  -- No location
  NULL,  -- No location
  50
);

-- Test 3: Get actual results
SELECT 
  type,
  COUNT(*) as count,
  MIN(score) as min_score,
  MAX(score) as max_score,
  AVG(score) as avg_score
FROM get_personalized_feed_v3(
  '349bda34-7878-4c10-9f86-ec5888e55571'::UUID,
  50,
  0,
  NULL,
  NULL,
  50
)
GROUP BY type;


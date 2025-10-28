-- ============================================================
-- VERIFY THAT price_range IS RETURNED FROM get_personalized_events_feed
-- ============================================================

-- Step 1: Check function signature
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'get_personalized_events_feed'
  AND n.nspname = 'public';

-- Step 2: Test function directly (replace with actual user_id)
-- First, get a real user_id
SELECT id, email 
FROM auth.users 
LIMIT 1;

-- Step 3: Call function and check if price_range is in results
-- Replace 'USER_ID_HERE' with actual UUID from Step 2
/*
SELECT 
  event_id,
  title,
  artist_name,
  price_range,
  ticket_price_min,
  ticket_price_max,
  price_range IS NOT NULL as has_price_range
FROM get_personalized_events_feed('USER_ID_HERE'::UUID, 100, 0, false, 3)
LIMIT 10;
*/

-- Step 4: Check if events in database have price_range
SELECT 
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE price_range IS NOT NULL AND TRIM(price_range) != '') as has_price_range,
  COUNT(*) FILTER (WHERE price_range IS NULL OR TRIM(price_range) = '') as missing_price_range
FROM jambase_events
WHERE event_date >= CURRENT_DATE;

-- Step 5: Sample events with prices
SELECT 
  id,
  title,
  artist_name,
  price_range,
  price_min,
  price_max,
  source
FROM jambase_events
WHERE event_date >= CURRENT_DATE
  AND (price_range IS NOT NULL OR price_min IS NOT NULL OR price_max IS NOT NULL)
ORDER BY created_at DESC
LIMIT 10;


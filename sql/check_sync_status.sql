-- Check sync status and recent event updates
-- This helps verify if the sync ran at 2AM today

-- 1. Check most recent event updates
SELECT 
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE last_modified_at >= CURRENT_DATE - INTERVAL '1 day') as updated_today,
  COUNT(*) FILTER (WHERE last_modified_at >= CURRENT_DATE) as updated_since_midnight,
  MAX(last_modified_at) as most_recent_update,
  MAX(updated_at) as most_recent_db_update
FROM public.events
WHERE source = 'jambase';

-- 2. Check events updated in the last 24 hours
SELECT 
  COUNT(*) as events_updated_last_24h,
  MIN(last_modified_at) as oldest_update,
  MAX(last_modified_at) as newest_update
FROM public.events
WHERE source = 'jambase'
  AND last_modified_at >= NOW() - INTERVAL '24 hours';

-- 3. Check events updated today (since midnight)
SELECT 
  COUNT(*) as events_updated_today,
  MIN(last_modified_at) as first_update_today,
  MAX(last_modified_at) as last_update_today
FROM public.events
WHERE source = 'jambase'
  AND last_modified_at >= CURRENT_DATE;

-- 4. Check for events with last_modified_at around 2 AM today
SELECT 
  COUNT(*) as events_around_2am,
  MIN(last_modified_at) as earliest,
  MAX(last_modified_at) as latest
FROM public.events
WHERE source = 'jambase'
  AND last_modified_at >= CURRENT_DATE + INTERVAL '1 hour'  -- 1 AM
  AND last_modified_at < CURRENT_DATE + INTERVAL '3 hours';  -- 3 AM

-- 5. Get sample of most recently updated events
SELECT 
  id,
  title,
  last_modified_at,
  updated_at,
  created_at
FROM public.events
WHERE source = 'jambase'
ORDER BY last_modified_at DESC NULLS LAST
LIMIT 10;




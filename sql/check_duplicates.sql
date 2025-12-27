-- Check for duplicate events, artists, and venues
-- This helps identify if the sync created duplicates

-- 1. Check for duplicate events (by title, artist_id, venue_id, event_date)
SELECT 
  title,
  artist_id,
  venue_id,
  event_date,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as event_ids,
  array_agg(created_at ORDER BY created_at) as created_dates
FROM public.events
WHERE source = 'jambase'
  AND created_at >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY title, artist_id, venue_id, event_date
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- 2. Check for duplicate artists (by name or identifier)
SELECT 
  name,
  identifier,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as artist_ids,
  array_agg(created_at ORDER BY created_at) as created_dates
FROM public.artists
WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
  OR updated_at >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY name, identifier
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- 3. Check for duplicate venues (by name or identifier)
SELECT 
  name,
  identifier,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as venue_ids,
  array_agg(created_at ORDER BY created_at) as created_dates
FROM public.venues
WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
  OR updated_at >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY name, identifier
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- 4. Check events created/updated today
SELECT 
  COUNT(*) as total_events_today,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as created_today,
  COUNT(*) FILTER (WHERE updated_at >= CURRENT_DATE AND created_at < CURRENT_DATE) as updated_today
FROM public.events
WHERE source = 'jambase'
  AND (created_at >= CURRENT_DATE OR updated_at >= CURRENT_DATE);

-- 5. Check artists created/updated today
SELECT 
  COUNT(*) as total_artists_today,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as created_today,
  COUNT(*) FILTER (WHERE updated_at >= CURRENT_DATE AND created_at < CURRENT_DATE) as updated_today
FROM public.artists
WHERE created_at >= CURRENT_DATE OR updated_at >= CURRENT_DATE;

-- 6. Check venues created/updated today
SELECT 
  COUNT(*) as total_venues_today,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as created_today,
  COUNT(*) FILTER (WHERE updated_at >= CURRENT_DATE AND created_at < CURRENT_DATE) as updated_today
FROM public.venues
WHERE created_at >= CURRENT_DATE OR updated_at >= CURRENT_DATE;









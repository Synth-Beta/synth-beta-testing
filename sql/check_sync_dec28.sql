-- Check if sync ran on Dec 28, 2025
-- Check events created/updated today (Dec 28)
SELECT 
  COUNT(*) as total_events_today,
  COUNT(*) FILTER (WHERE created_at >= '2025-12-28'::date) as created_today,
  COUNT(*) FILTER (WHERE updated_at >= '2025-12-28'::date AND created_at < '2025-12-28'::date) as updated_today,
  MAX(created_at) as latest_created,
  MAX(updated_at) as latest_updated
FROM public.events
WHERE source = 'jambase'
  AND (created_at >= '2025-12-28'::date OR updated_at >= '2025-12-28'::date);

-- Check artists created/updated today (Dec 28)
SELECT 
  COUNT(*) as total_artists_today,
  COUNT(*) FILTER (WHERE created_at >= '2025-12-28'::date) as created_today,
  COUNT(*) FILTER (WHERE updated_at >= '2025-12-28'::date AND created_at < '2025-12-28'::date) as updated_today,
  MAX(created_at) as latest_created,
  MAX(updated_at) as latest_updated
FROM public.artists
WHERE created_at >= '2025-12-28'::date OR updated_at >= '2025-12-28'::date;

-- Check venues created/updated today (Dec 28)
SELECT 
  COUNT(*) as total_venues_today,
  COUNT(*) FILTER (WHERE created_at >= '2025-12-28'::date) as created_today,
  COUNT(*) FILTER (WHERE updated_at >= '2025-12-28'::date AND created_at < '2025-12-28'::date) as updated_today,
  MAX(created_at) as latest_created,
  MAX(updated_at) as latest_updated
FROM public.venues
WHERE created_at >= '2025-12-28'::date OR updated_at >= '2025-12-28'::date;

-- Check external_entity_ids entries created today
SELECT 
  entity_type,
  COUNT(*) as entries_created_today,
  COUNT(DISTINCT external_id) as unique_external_ids,
  COUNT(DISTINCT entity_uuid) as unique_entities
FROM public.external_entity_ids
WHERE created_at >= '2025-12-28'::date
  AND source = 'jambase'
GROUP BY entity_type
ORDER BY entity_type;











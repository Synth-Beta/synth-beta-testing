-- Verify no duplicates were created in today's sync
-- Run this in your Supabase SQL editor to check

-- 1. Check for duplicate events by jambase_event_id (via external_entity_ids)
-- This is the primary deduplication mechanism
SELECT 
  eei.external_id as jambase_event_id,
  COUNT(DISTINCT eei.entity_uuid) as duplicate_count,
  array_agg(DISTINCT eei.entity_uuid) as event_uuids
FROM public.external_entity_ids eei
WHERE eei.entity_type = 'event'
  AND eei.source = 'jambase'
  AND eei.created_at >= CURRENT_DATE
GROUP BY eei.external_id
HAVING COUNT(DISTINCT eei.entity_uuid) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- 2. Check for duplicate artists by jambase_artist_id (via external_entity_ids)
SELECT 
  eei.external_id as jambase_artist_id,
  COUNT(DISTINCT eei.entity_uuid) as duplicate_count,
  array_agg(DISTINCT eei.entity_uuid) as artist_uuids
FROM public.external_entity_ids eei
WHERE eei.entity_type = 'artist'
  AND eei.source = 'jambase'
  AND eei.created_at >= CURRENT_DATE
GROUP BY eei.external_id
HAVING COUNT(DISTINCT eei.entity_uuid) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- 3. Check for duplicate venues by jambase_venue_id (via external_entity_ids)
SELECT 
  eei.external_id as jambase_venue_id,
  COUNT(DISTINCT eei.entity_uuid) as duplicate_count,
  array_agg(DISTINCT eei.entity_uuid) as venue_uuids
FROM public.external_entity_ids eei
WHERE eei.entity_type = 'venue'
  AND eei.source = 'jambase'
  AND eei.created_at >= CURRENT_DATE
GROUP BY eei.external_id
HAVING COUNT(DISTINCT eei.entity_uuid) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- 4. Summary: Count unique vs total entities created today
SELECT 
  'Events' as entity_type,
  COUNT(DISTINCT eei.entity_uuid) as unique_entities,
  COUNT(*) as total_external_id_entries,
  COUNT(*) - COUNT(DISTINCT eei.entity_uuid) as potential_duplicates
FROM public.external_entity_ids eei
WHERE eei.entity_type = 'event'
  AND eei.source = 'jambase'
  AND eei.created_at >= CURRENT_DATE

UNION ALL

SELECT 
  'Artists' as entity_type,
  COUNT(DISTINCT eei.entity_uuid) as unique_entities,
  COUNT(*) as total_external_id_entries,
  COUNT(*) - COUNT(DISTINCT eei.entity_uuid) as potential_duplicates
FROM public.external_entity_ids eei
WHERE eei.entity_type = 'artist'
  AND eei.source = 'jambase'
  AND eei.created_at >= CURRENT_DATE

UNION ALL

SELECT 
  'Venues' as entity_type,
  COUNT(DISTINCT eei.entity_uuid) as unique_entities,
  COUNT(*) as total_external_id_entries,
  COUNT(*) - COUNT(DISTINCT eei.entity_uuid) as potential_duplicates
FROM public.external_entity_ids eei
WHERE eei.entity_type = 'venue'
  AND eei.source = 'jambase'
  AND eei.created_at >= CURRENT_DATE;




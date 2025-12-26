-- ============================================
-- INVESTIGATE: Events updated Dec 25 with null venue_id
-- ============================================

-- First, let's see what these events look like
SELECT 
  id,
  venue_id,
  venue_name,
  venue_uuid,
  event_name,
  artist_name,
  event_date,
  created_at,
  updated_at,
  jambase_event_id,
  source
FROM public.events
WHERE DATE(updated_at) = '2025-12-25' 
  AND venue_id IS NULL
ORDER BY updated_at DESC;

-- Check if these events have venue_name that could be matched
SELECT 
  e.id,
  e.venue_id,
  e.venue_name,
  e.venue_uuid,
  e.event_name,
  e.updated_at,
  v.id as matching_venue_id,
  v.name as matching_venue_name,
  v.jambase_venue_id
FROM public.events e
LEFT JOIN public.venues v ON LOWER(TRIM(v.name)) = LOWER(TRIM(e.venue_name))
WHERE DATE(e.updated_at) = '2025-12-25' 
  AND e.venue_id IS NULL
ORDER BY e.updated_at DESC;

-- Check if these events have jambase_event_id and can be matched via jambase_events
SELECT 
  e.id as event_id,
  e.venue_id as event_venue_id,
  e.venue_name as event_venue_name,
  e.jambase_event_id,
  je.venue_id as jambase_venue_id,
  je.venue_name as jambase_venue_name,
  v.id as venue_uuid,
  v.name as venue_name
FROM public.events e
LEFT JOIN public.jambase_events je ON e.jambase_event_id = je.jambase_event_id
LEFT JOIN public.venues v ON v.jambase_venue_id = je.venue_id
WHERE DATE(e.updated_at) = '2025-12-25' 
  AND e.venue_id IS NULL
ORDER BY e.updated_at DESC;

-- Check what triggered the update (look for patterns)
SELECT 
  COUNT(*) as total_events,
  COUNT(DISTINCT source) as distinct_sources,
  COUNT(DISTINCT artist_name) as distinct_artists,
  COUNT(CASE WHEN venue_name IS NOT NULL THEN 1 END) as has_venue_name,
  COUNT(CASE WHEN jambase_event_id IS NOT NULL THEN 1 END) as has_jambase_id,
  COUNT(CASE WHEN venue_uuid IS NOT NULL THEN 1 END) as has_venue_uuid
FROM public.events
WHERE DATE(updated_at) = '2025-12-25' 
  AND venue_id IS NULL;

-- Check if there are venues that should match but don't
SELECT 
  e.id,
  e.venue_name,
  v.id as venue_id,
  v.name as venue_name,
  -- Show similarity for debugging
  LOWER(TRIM(e.venue_name)) as event_venue_normalized,
  LOWER(TRIM(v.name)) as venue_name_normalized,
  CASE 
    WHEN LOWER(TRIM(e.venue_name)) = LOWER(TRIM(v.name)) THEN 'EXACT MATCH'
    WHEN LOWER(TRIM(e.venue_name)) LIKE '%' || LOWER(TRIM(v.name)) || '%' THEN 'PARTIAL MATCH'
    ELSE 'NO MATCH'
  END as match_type
FROM public.events e
CROSS JOIN public.venues v
WHERE DATE(e.updated_at) = '2025-12-25' 
  AND e.venue_id IS NULL
  AND e.venue_name IS NOT NULL
  AND (
    LOWER(TRIM(e.venue_name)) = LOWER(TRIM(v.name))
    OR LOWER(TRIM(e.venue_name)) LIKE '%' || LOWER(TRIM(v.name)) || '%'
    OR LOWER(TRIM(v.name)) LIKE '%' || LOWER(TRIM(e.venue_name)) || '%'
  )
LIMIT 20;


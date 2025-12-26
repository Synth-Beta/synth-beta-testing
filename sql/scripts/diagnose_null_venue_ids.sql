-- ============================================
-- DIAGNOSTIC: Find events with null venue_id
-- ============================================

-- First, let's identify which table these IDs belong to
-- Check events table
SELECT 
  'events' as table_name,
  id,
  venue_id,
  artist_id,
  event_name,
  venue_name,
  event_date,
  created_at
FROM public.events
WHERE id IN (
  '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',
  '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',
  'e1dafc56-ae68-4a65-ad17-5f24c8652000',
  'd1bef15e-e420-4def-8614-ac5e2bfa7094',
  '8a3c9c37-3622-4326-b685-4307697dc37e'
)
ORDER BY created_at DESC;

-- Check if these events have venue_name that could be matched
SELECT 
  e.id,
  e.venue_id,
  e.venue_name,
  e.event_name,
  e.event_date,
  v.id as matching_venue_id,
  v.name as matching_venue_name
FROM public.events e
LEFT JOIN public.venues v ON LOWER(TRIM(v.name)) = LOWER(TRIM(e.venue_name))
WHERE e.id IN (
  '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',
  '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',
  'e1dafc56-ae68-4a65-ad17-5f24c8652000',
  'd1bef15e-e420-4def-8614-ac5e2bfa7094',
  '8a3c9c37-3622-4326-b685-4307697dc37e'
)
ORDER BY e.created_at DESC;

-- Check jambase_events table (if these are jambase event IDs)
SELECT 
  'jambase_events' as table_name,
  id,
  venue_id,
  venue_name,
  event_name,
  event_date,
  created_at
FROM public.jambase_events
WHERE id IN (
  '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',
  '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',
  'e1dafc56-ae68-4a65-ad17-5f24c8652000',
  'd1bef15e-e420-4def-8614-ac5e2bfa7094',
  '8a3c9c37-3622-4326-b685-4307697dc37e'
)
ORDER BY created_at DESC;

-- Check user_reviews table
SELECT 
  'user_reviews' as table_name,
  id,
  venue_id,
  event_id,
  created_at
FROM public.user_reviews
WHERE id IN (
  '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',
  '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',
  'e1dafc56-ae68-4a65-ad17-5f24c8652000',
  'd1bef15e-e420-4def-8614-ac5e2bfa7094',
  '8a3c9c37-3622-4326-b685-4307697dc37e'
)
ORDER BY created_at DESC;

-- Overall statistics: How many records have null venue_id?
SELECT 
  'events' as table_name,
  COUNT(*) as total_records,
  COUNT(venue_id) as records_with_venue_id,
  COUNT(*) - COUNT(venue_id) as records_with_null_venue_id,
  ROUND(100.0 * (COUNT(*) - COUNT(venue_id)) / COUNT(*), 2) as percent_null
FROM public.events
UNION ALL
SELECT 
  'jambase_events' as table_name,
  COUNT(*) as total_records,
  COUNT(venue_id) as records_with_venue_id,
  COUNT(*) - COUNT(venue_id) as records_with_null_venue_id,
  ROUND(100.0 * (COUNT(*) - COUNT(venue_id)) / COUNT(*), 2) as percent_null
FROM public.jambase_events
UNION ALL
SELECT 
  'user_reviews' as table_name,
  COUNT(*) as total_records,
  COUNT(venue_id) as records_with_venue_id,
  COUNT(*) - COUNT(venue_id) as records_with_null_venue_id,
  ROUND(100.0 * (COUNT(*) - COUNT(venue_id)) / COUNT(*), 2) as percent_null
FROM public.user_reviews;


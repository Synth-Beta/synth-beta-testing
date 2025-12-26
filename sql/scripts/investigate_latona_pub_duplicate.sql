-- ============================================
-- INVESTIGATE: Latona Pub duplicate venues
-- ============================================

-- Get the two Latona Pub venues
SELECT 
  id,
  name,
  jambase_venue_id,
  created_at,
  updated_at,
  address,
  city,
  state
FROM public.venues
WHERE LOWER(TRIM(name)) = LOWER(TRIM('Latona Pub'))
ORDER BY created_at;

-- Check all tables that reference venues to see if either Latona Pub is used
-- 1. Events table
SELECT 
  'events' as table_name,
  COUNT(*) as total_references,
  COUNT(CASE WHEN venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4' THEN 1 END) as references_to_venue_1,
  COUNT(CASE WHEN venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001' THEN 1 END) as references_to_venue_2
FROM public.events
WHERE venue_id IN ('725a0c7f-dfd2-43e6-90e5-0c690eb377e4', '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001');

-- 2. user_venues table
SELECT 
  'user_venues' as table_name,
  COUNT(*) as total_references,
  COUNT(CASE WHEN venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4' THEN 1 END) as references_to_venue_1,
  COUNT(CASE WHEN venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001' THEN 1 END) as references_to_venue_2
FROM public.user_venues
WHERE venue_id IN ('725a0c7f-dfd2-43e6-90e5-0c690eb377e4', '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001');

-- 3. user_reviews table
SELECT 
  'user_reviews' as table_name,
  COUNT(*) as total_references,
  COUNT(CASE WHEN venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4' THEN 1 END) as references_to_venue_1,
  COUNT(CASE WHEN venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001' THEN 1 END) as references_to_venue_2
FROM public.user_reviews
WHERE venue_id IN ('725a0c7f-dfd2-43e6-90e5-0c690eb377e4', '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001');

-- 4. user_venue_interactions table
SELECT 
  'user_venue_interactions' as table_name,
  COUNT(*) as total_references,
  COUNT(CASE WHEN venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4' THEN 1 END) as references_to_venue_1,
  COUNT(CASE WHEN venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001' THEN 1 END) as references_to_venue_2
FROM public.user_venue_interactions
WHERE venue_id IN ('725a0c7f-dfd2-43e6-90e5-0c690eb377e4', '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001');

-- 5. jambase_events table (if it has venue_id)
SELECT 
  'jambase_events' as table_name,
  COUNT(*) as total_references,
  COUNT(CASE WHEN venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4' THEN 1 END) as references_to_venue_1,
  COUNT(CASE WHEN venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001' THEN 1 END) as references_to_venue_2
FROM public.jambase_events
WHERE venue_id IN ('725a0c7f-dfd2-43e6-90e5-0c690eb377e4', '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001');

-- 6. Check if either venue has owner_user_id (claimed venues)
SELECT 
  id,
  name,
  owner_user_id,
  verified,
  claimed_at
FROM public.venues
WHERE id IN ('725a0c7f-dfd2-43e6-90e5-0c690eb377e4', '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001');

-- 7. Check num_upcoming_events for both
SELECT 
  id,
  name,
  num_upcoming_events,
  created_at
FROM public.venues
WHERE id IN ('725a0c7f-dfd2-43e6-90e5-0c690eb377e4', '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001');

-- 8. Check for any foreign key constraints
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'venues'
  AND ccu.column_name = 'id';


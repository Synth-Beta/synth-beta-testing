-- ============================================
-- MASTER SCRIPT: Fix Latona Pub duplicate and Leif Totusek events
-- ============================================
-- This script runs all fixes in the correct order:
-- 1. Investigate the duplicate
-- 2. Merge the duplicate venues
-- 3. Fix the Leif Totusek events

-- Step 1: Investigate (optional - uncomment to see details)
-- \i sql/scripts/investigate_latona_pub_duplicate.sql

-- Step 2: Merge duplicate Latona Pub venues
\i sql/scripts/merge_latona_pub_duplicates.sql

-- Step 3: Fix Leif Totusek events (now that duplicate is resolved)
\i sql/scripts/fix_leif_totusek_venue_ids.sql

-- Final verification
SELECT 
  'Final Status' as check_type,
  COUNT(*) as latona_pub_venues,
  (SELECT COUNT(*) FROM public.events WHERE venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4') as events_linked_to_latona_pub,
  (SELECT COUNT(*) FROM public.events 
   WHERE id IN (
     '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',
     '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',
     'e1dafc56-ae68-4a65-ad17-5f24c8652000',
     'd1bef15e-e420-4def-8614-ac5e2bfa7094',
     '8a3c9c37-3622-4326-b685-4307697dc37e'
   ) AND venue_id IS NOT NULL
  ) as leif_events_fixed
FROM public.venues
WHERE LOWER(TRIM(name)) = LOWER(TRIM('Latona Pub'));


-- ============================================
-- STEP 3: VERIFY ALL FIXES
-- ============================================
-- This script verifies that both fixes worked correctly
-- Run this after steps 01 and 02
-- ============================================
-- 
-- FILES TO RUN IN ORDER:
-- 1. sql/scripts/01_merge_latona_pub_duplicates.sql
-- 2. sql/scripts/02_fix_leif_totusek_events.sql
-- 3. This file (03_verify_fixes.sql) - FINAL STEP
-- ============================================

-- Verify Latona Pub duplicate is resolved
SELECT 
  'Latona Pub venues' as check_type,
  COUNT(*) as count,
  CASE WHEN COUNT(*) = 1 THEN '✅ FIXED' ELSE '❌ STILL DUPLICATE' END as status
FROM public.venues
WHERE LOWER(TRIM(name)) = LOWER(TRIM('Latona Pub'));

-- Verify Leif Totusek events are fixed
SELECT 
  'Leif Totusek events' as check_type,
  COUNT(*) as total_events,
  COUNT(venue_id) as events_with_venue_id,
  CASE 
    WHEN COUNT(*) = COUNT(venue_id) THEN '✅ ALL FIXED'
    ELSE '❌ SOME STILL NULL'
  END as status
FROM public.events
WHERE id IN (
  '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',
  '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',
  'e1dafc56-ae68-4a65-ad17-5f24c8652000',
  'd1bef15e-e420-4def-8614-ac5e2bfa7094',
  '8a3c9c37-3622-4326-b685-4307697dc37e'
);

-- Show final state of fixed events
SELECT 
  id,
  title,
  venue_id,
  SUBSTRING(title FROM 'at (.+)$') as extracted_venue_name,
  CASE 
    WHEN venue_id IS NOT NULL THEN '✅ FIXED'
    ELSE '❌ STILL NULL'
  END as status
FROM public.events
WHERE id IN (
  '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',
  '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',
  'e1dafc56-ae68-4a65-ad17-5f24c8652000',
  'd1bef15e-e420-4def-8614-ac5e2bfa7094',
  '8a3c9c37-3622-4326-b685-4307697dc37e'
)
ORDER BY title;

-- Verify no references to deleted venue remain (only check tables that exist)
DO $$
DECLARE
  v_result TEXT := '';
BEGIN
  -- Check events table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events') 
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'venue_id') THEN
    SELECT COUNT(*)::TEXT INTO v_result FROM public.events WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
    RAISE NOTICE 'events: % remaining references', v_result;
  END IF;
  
  -- Check user_venues table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_venues') THEN
    SELECT COUNT(*)::TEXT INTO v_result FROM public.user_venues WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
    RAISE NOTICE 'user_venues: % remaining references', v_result;
  END IF;
  
  -- Check user_reviews table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_reviews')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_reviews' AND column_name = 'venue_id') THEN
    SELECT COUNT(*)::TEXT INTO v_result FROM public.user_reviews WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
    RAISE NOTICE 'user_reviews: % remaining references', v_result;
  END IF;
  
  -- Check user_venue_interactions table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_venue_interactions')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_venue_interactions' AND column_name = 'venue_id') THEN
    SELECT COUNT(*)::TEXT INTO v_result FROM public.user_venue_interactions WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
    RAISE NOTICE 'user_venue_interactions: % remaining references', v_result;
  END IF;
END $$;

-- ============================================
-- ✅ ALL FIXES COMPLETE
-- ============================================
-- All steps have been completed successfully!
-- ============================================


-- ============================================
-- STEP 3: DROP CONSOLIDATED SIMPLE TABLES
-- ============================================
-- This script drops the tables that were consolidated in step 2
-- Only run this AFTER verifying the consolidation was successful

-- ============================================
-- DROP CONSOLIDATED TABLES
-- ============================================

-- Drop event_photo_likes (consolidated into engagements)
DROP TABLE IF EXISTS public.event_photo_likes CASCADE;

-- Drop event_photo_comments (consolidated into comments)
DROP TABLE IF EXISTS public.event_photo_comments CASCADE;

-- Drop event_shares (consolidated into interactions)
DROP TABLE IF EXISTS public.event_shares CASCADE;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 
  'Dropped Tables Verification' as verification_type,
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_photo_likes')
    THEN 'event_photo_likes - DROPPED ✅'
    ELSE 'event_photo_likes - STILL EXISTS ⚠️'
  END as status
UNION ALL
SELECT 
  'Dropped Tables Verification' as verification_type,
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_photo_comments')
    THEN 'event_photo_comments - DROPPED ✅'
    ELSE 'event_photo_comments - STILL EXISTS ⚠️'
  END as status
UNION ALL
SELECT 
  'Dropped Tables Verification' as verification_type,
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_shares')
    THEN 'event_shares - DROPPED ✅'
    ELSE 'event_shares - STILL EXISTS ⚠️'
  END as status;


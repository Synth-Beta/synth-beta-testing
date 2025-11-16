-- ============================================
-- DROP REDUNDANT TABLES AFTER CONSOLIDATION
-- ============================================
-- Only run this AFTER verifying all migrations were successful
-- This drops tables that have been consolidated into other tables

-- ============================================
-- DROP event_interests (consolidated into relationships)
-- ============================================
DROP TABLE IF EXISTS public.event_interests CASCADE;

-- ============================================
-- DROP review_photos, review_videos, review_tags (if consolidated)
-- ============================================
-- Only drop if reviews table has the array columns and data was migrated
-- Check verification results before running these
DROP TABLE IF EXISTS public.review_photos CASCADE;
DROP TABLE IF EXISTS public.review_videos CASCADE;
DROP TABLE IF EXISTS public.review_tags CASCADE;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 
  'Dropped Tables Verification' as verification_type,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_interests'
    ) THEN 'event_interests - DROPPED ✅'
    ELSE 'event_interests - STILL EXISTS ⚠️'
  END as status
UNION ALL
SELECT 
  'Dropped Tables Verification' as verification_type,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_photos'
    ) THEN 'review_photos - DROPPED ✅'
    ELSE 'review_photos - STILL EXISTS ⚠️'
  END as status
UNION ALL
SELECT 
  'Dropped Tables Verification' as verification_type,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_videos'
    ) THEN 'review_videos - DROPPED ✅'
    ELSE 'review_videos - STILL EXISTS ⚠️'
  END as status
UNION ALL
SELECT 
  'Dropped Tables Verification' as verification_type,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'review_tags'
    ) THEN 'review_tags - DROPPED ✅'
    ELSE 'review_tags - STILL EXISTS ⚠️'
  END as status;


-- ============================================
-- QUICK CHECK: Verify Tables for Step 2
-- ============================================
-- Run this before Step 2 to see if the tables exist

DO $$
DECLARE
  photo_likes_exists BOOLEAN;
  photo_comments_exists BOOLEAN;
  shares_exists BOOLEAN;
  photo_likes_count BIGINT;
  photo_comments_count BIGINT;
  shares_count BIGINT;
BEGIN
  -- Check if tables exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_photo_likes'
  ) INTO photo_likes_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_photo_comments'
  ) INTO photo_comments_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_shares'
  ) INTO shares_exists;
  
  -- Get row counts if tables exist
  IF photo_likes_exists THEN
    SELECT COUNT(*) INTO photo_likes_count FROM public.event_photo_likes;
  ELSE
    photo_likes_count := 0;
  END IF;
  
  IF photo_comments_exists THEN
    SELECT COUNT(*) INTO photo_comments_count FROM public.event_photo_comments;
  ELSE
    photo_comments_count := 0;
  END IF;
  
  IF shares_exists THEN
    SELECT COUNT(*) INTO shares_count FROM public.event_shares;
  ELSE
    shares_count := 0;
  END IF;
  
  -- Display results
  RAISE NOTICE '=== Step 2 Tables Check ===';
  RAISE NOTICE 'event_photo_likes: % (rows: %)', 
    CASE WHEN photo_likes_exists THEN 'EXISTS' ELSE 'DOES NOT EXIST' END, 
    photo_likes_count;
  RAISE NOTICE 'event_photo_comments: % (rows: %)', 
    CASE WHEN photo_comments_exists THEN 'EXISTS' ELSE 'DOES NOT EXIST' END, 
    photo_comments_count;
  RAISE NOTICE 'event_shares: % (rows: %)', 
    CASE WHEN shares_exists THEN 'EXISTS' ELSE 'DOES NOT EXIST' END, 
    shares_count;
  
  -- Recommendation
  IF photo_likes_exists OR photo_comments_exists OR shares_exists THEN
    RAISE NOTICE '';
    RAISE NOTICE '✅ READY FOR STEP 2 - At least one table exists';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '⏭️  SKIP STEP 2 - None of these tables exist (they may have already been consolidated)';
  END IF;
END $$;

-- Display summary table
SELECT 
  'Step 2 Tables Summary' as check_type,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_photo_likes')
    THEN 'EXISTS'
    ELSE 'DOES NOT EXIST'
  END as event_photo_likes,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_photo_comments')
    THEN 'EXISTS'
    ELSE 'DOES NOT EXIST'
  END as event_photo_comments,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_shares')
    THEN 'EXISTS'
    ELSE 'DOES NOT EXIST'
  END as event_shares,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_photo_likes')
      OR EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_photo_comments')
      OR EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_shares')
    THEN 'READY FOR STEP 2'
    ELSE 'SKIP STEP 2'
  END as recommendation;


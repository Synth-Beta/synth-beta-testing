-- ============================================
-- STEP 4: CHECK AND HANDLE REDUNDANT TABLES
-- ============================================
-- This script checks for tables that may have already been consolidated
-- or are redundant with existing columns

-- ============================================
-- PART A: CHECK event_interests
-- ============================================
-- This should already be in the relationships table

DO $$
DECLARE
  event_interests_count INTEGER := 0;
  relationships_event_count INTEGER := 0;
BEGIN
  -- Check if event_interests exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_interests'
  ) THEN
    SELECT COUNT(*) INTO event_interests_count FROM public.event_interests;
    SELECT COUNT(*) INTO relationships_event_count 
    FROM public.relationships 
    WHERE related_entity_type = 'event';
    
    RAISE NOTICE 'event_interests table: % rows', event_interests_count;
    RAISE NOTICE 'relationships table (event type): % rows', relationships_event_count;
    
    IF event_interests_count > 0 THEN
      RAISE NOTICE '⚠️  event_interests has data. Check if it should be migrated to relationships table.';
    ELSE
      RAISE NOTICE '✅ event_interests is empty, safe to drop.';
    END IF;
  ELSE
    RAISE NOTICE '✅ event_interests does not exist (already dropped or never existed).';
  END IF;
END $$;

-- ============================================
-- PART B: CHECK event_promotions
-- ============================================
-- This should already be in monetization_tracking

DO $$
DECLARE
  event_promotions_count INTEGER := 0;
  monetization_event_count INTEGER := 0;
BEGIN
  -- Check if event_promotions exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_promotions'
  ) THEN
    SELECT COUNT(*) INTO event_promotions_count FROM public.event_promotions;
    SELECT COUNT(*) INTO monetization_event_count 
    FROM public.monetization_tracking 
    WHERE transaction_type = 'event_promotion';
    
    RAISE NOTICE 'event_promotions table: % rows', event_promotions_count;
    RAISE NOTICE 'monetization_tracking table (event_promotion type): % rows', monetization_event_count;
    
    IF event_promotions_count > 0 THEN
      RAISE NOTICE '⚠️  event_promotions has data. Check if it should be migrated to monetization_tracking table.';
    ELSE
      RAISE NOTICE '✅ event_promotions is empty, safe to drop.';
    END IF;
  ELSE
    RAISE NOTICE '✅ event_promotions does not exist (already dropped or never existed).';
  END IF;
END $$;

-- ============================================
-- PART C: CHECK review_photos, review_videos, review_tags
-- ============================================
-- These may be redundant if reviews table has photos/videos/tags arrays

DO $$
DECLARE
  review_photos_count INTEGER := 0;
  review_videos_count INTEGER := 0;
  review_tags_count INTEGER := 0;
  reviews_with_photos INTEGER := 0;
  reviews_with_videos INTEGER := 0;
  reviews_with_tags INTEGER := 0;
BEGIN
  -- Check if review_photos exists and if reviews has photos array
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'review_photos'
  ) THEN
    SELECT COUNT(*) INTO review_photos_count FROM public.review_photos;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'reviews' 
      AND column_name = 'photos'
  ) THEN
    SELECT COUNT(*) INTO reviews_with_photos 
    FROM public.reviews 
    WHERE photos IS NOT NULL AND array_length(photos, 1) > 0;
  END IF;
  
  -- Check if review_videos exists and if reviews has videos array
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'review_videos'
  ) THEN
    SELECT COUNT(*) INTO review_videos_count FROM public.review_videos;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'reviews' 
      AND column_name = 'videos'
  ) THEN
    SELECT COUNT(*) INTO reviews_with_videos 
    FROM public.reviews 
    WHERE videos IS NOT NULL AND array_length(videos, 1) > 0;
  END IF;
  
  -- Check if review_tags exists and if reviews has tag columns
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'review_tags'
  ) THEN
    SELECT COUNT(*) INTO review_tags_count FROM public.review_tags;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'reviews' 
      AND (column_name = 'mood_tags' OR column_name = 'genre_tags' OR column_name = 'context_tags')
  ) THEN
    SELECT COUNT(*) INTO reviews_with_tags 
    FROM public.reviews 
    WHERE (mood_tags IS NOT NULL AND array_length(mood_tags, 1) > 0)
       OR (genre_tags IS NOT NULL AND array_length(genre_tags, 1) > 0)
       OR (context_tags IS NOT NULL AND array_length(context_tags, 1) > 0);
  END IF;
  
  RAISE NOTICE '=== Review Media/Tags Check ===';
  RAISE NOTICE 'review_photos table: % rows', review_photos_count;
  RAISE NOTICE 'reviews with photos array: % rows', reviews_with_photos;
  RAISE NOTICE 'review_videos table: % rows', review_videos_count;
  RAISE NOTICE 'reviews with videos array: % rows', reviews_with_videos;
  RAISE NOTICE 'review_tags table: % rows', review_tags_count;
  RAISE NOTICE 'reviews with tags arrays: % rows', reviews_with_tags;
  
  IF review_photos_count = 0 AND reviews_with_photos > 0 THEN
    RAISE NOTICE '✅ review_photos is redundant (reviews table has photos array), safe to drop.';
  ELSIF review_photos_count > 0 THEN
    RAISE NOTICE '⚠️  review_photos has data. Check if it should be migrated to reviews.photos array.';
  END IF;
  
  IF review_videos_count = 0 AND reviews_with_videos > 0 THEN
    RAISE NOTICE '✅ review_videos is redundant (reviews table has videos array), safe to drop.';
  ELSIF review_videos_count > 0 THEN
    RAISE NOTICE '⚠️  review_videos has data. Check if it should be migrated to reviews.videos array.';
  END IF;
  
  IF review_tags_count = 0 AND reviews_with_tags > 0 THEN
    RAISE NOTICE '✅ review_tags is redundant (reviews table has tag arrays), safe to drop.';
  ELSIF review_tags_count > 0 THEN
    RAISE NOTICE '⚠️  review_tags has data. Check if it should be migrated to reviews tag arrays.';
  END IF;
END $$;

-- ============================================
-- SUMMARY QUERY
-- ============================================
SELECT 
  'Redundant Tables Check' as check_type,
  table_name,
  CASE 
    WHEN table_name = 'event_interests' THEN 'Should be in relationships table'
    WHEN table_name = 'event_promotions' THEN 'Should be in monetization_tracking table'
    WHEN table_name = 'review_photos' THEN 'May be redundant with reviews.photos array'
    WHEN table_name = 'review_videos' THEN 'May be redundant with reviews.videos array'
    WHEN table_name = 'review_tags' THEN 'May be redundant with reviews tag arrays'
    ELSE 'Check needed'
  END as recommendation,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = table_name
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END as status
FROM (
  SELECT 'event_interests' as table_name
  UNION ALL SELECT 'event_promotions'
  UNION ALL SELECT 'review_photos'
  UNION ALL SELECT 'review_videos'
  UNION ALL SELECT 'review_tags'
) t;


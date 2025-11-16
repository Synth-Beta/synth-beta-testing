-- ============================================
-- CHECK DATA IN REDUNDANT TABLES
-- ============================================
-- This script checks if redundant tables have data that needs migration

-- Check event_interests
SELECT 
  'event_interests' as table_name,
  COUNT(*) as row_count,
  COUNT(DISTINCT event_id) as unique_events,
  COUNT(DISTINCT user_id) as unique_users
FROM public.event_interests;

-- Check event_promotions
SELECT 
  'event_promotions' as table_name,
  COUNT(*) as row_count,
  COUNT(DISTINCT event_id) as unique_events
FROM public.event_promotions;

-- Check review_photos
SELECT 
  'review_photos' as table_name,
  COUNT(*) as row_count,
  COUNT(DISTINCT review_id) as unique_reviews
FROM public.review_photos;

-- Check review_videos
SELECT 
  'review_videos' as table_name,
  COUNT(*) as row_count,
  COUNT(DISTINCT review_id) as unique_reviews
FROM public.review_videos;

-- Check review_tags
SELECT 
  'review_tags' as table_name,
  COUNT(*) as row_count,
  COUNT(DISTINCT review_id) as unique_reviews,
  COUNT(DISTINCT tag) as unique_tags
FROM public.review_tags;

-- Check if reviews table has the array columns
SELECT 
  'reviews table check' as check_type,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'reviews' 
      AND column_name = 'photos'
  ) as has_photos_column,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'reviews' 
      AND column_name = 'videos'
  ) as has_videos_column,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'reviews' 
      AND (column_name = 'mood_tags' OR column_name = 'genre_tags' OR column_name = 'context_tags')
  ) as has_tag_columns,
  (
    SELECT COUNT(*) FROM public.reviews 
    WHERE photos IS NOT NULL AND array_length(photos, 1) > 0
  ) as reviews_with_photos,
  (
    SELECT COUNT(*) FROM public.reviews 
    WHERE videos IS NOT NULL AND array_length(videos, 1) > 0
  ) as reviews_with_videos,
  (
    SELECT COUNT(*) FROM public.reviews 
    WHERE (mood_tags IS NOT NULL AND array_length(mood_tags, 1) > 0)
       OR (genre_tags IS NOT NULL AND array_length(genre_tags, 1) > 0)
       OR (context_tags IS NOT NULL AND array_length(context_tags, 1) > 0)
  ) as reviews_with_tags;


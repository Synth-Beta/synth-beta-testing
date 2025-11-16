-- ============================================
-- CONSOLIDATE review_photos, review_videos, review_tags
-- ============================================
-- This script migrates data from separate tables into reviews.photos, reviews.videos, and reviews tag arrays

-- ============================================
-- PART A: CONSOLIDATE review_photos → reviews.photos
-- ============================================
DO $$
DECLARE
  migrated_count INTEGER;
  source_count INTEGER;
  reviews_updated INTEGER;
BEGIN
  -- Check if reviews table has photos column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'reviews' 
      AND column_name = 'photos'
  ) THEN
    -- Get source count
    SELECT COUNT(*) INTO source_count FROM public.review_photos;
    
    RAISE NOTICE 'Starting migration of % photo rows from review_photos to reviews.photos array', source_count;
    
    -- Update reviews to include photos from review_photos table
    -- Aggregate photos by review_id and merge into existing photos array
    UPDATE public.reviews r
    SET photos = COALESCE(r.photos, ARRAY[]::TEXT[]) || ARRAY(
      SELECT DISTINCT rp.photo_url 
      FROM public.review_photos rp
      WHERE rp.review_id = r.id
        AND rp.photo_url IS NOT NULL
        AND NOT (rp.photo_url = ANY(COALESCE(r.photos, ARRAY[]::TEXT[])))
    ),
    updated_at = GREATEST(
      r.updated_at, 
      (SELECT MAX(rp.created_at) FROM public.review_photos rp WHERE rp.review_id = r.id)
    )
    WHERE EXISTS (
      SELECT 1 FROM public.review_photos rp WHERE rp.review_id = r.id
    );
    
    GET DIAGNOSTICS reviews_updated = ROW_COUNT;
    migrated_count := source_count; -- All photos should be in reviews now
    
    RAISE NOTICE 'Migration complete:';
    RAISE NOTICE '  - Reviews updated: %', reviews_updated;
    RAISE NOTICE '  - Photos migrated: %', migrated_count;
  ELSE
    RAISE NOTICE '⚠️  reviews.photos column does not exist - Cannot migrate';
  END IF;
END $$;

-- ============================================
-- PART B: CONSOLIDATE review_videos → reviews.videos
-- ============================================
DO $$
DECLARE
  migrated_count INTEGER;
  source_count INTEGER;
  reviews_updated INTEGER;
BEGIN
  -- Check if reviews table has videos column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'reviews' 
      AND column_name = 'videos'
  ) THEN
    -- Get source count
    SELECT COUNT(*) INTO source_count FROM public.review_videos;
    
    RAISE NOTICE 'Starting migration of % video rows from review_videos to reviews.videos array', source_count;
    
    -- Update reviews to include videos from review_videos table
    UPDATE public.reviews r
    SET videos = COALESCE(r.videos, ARRAY[]::TEXT[]) || ARRAY(
      SELECT DISTINCT rv.video_url 
      FROM public.review_videos rv
      WHERE rv.review_id = r.id
        AND rv.video_url IS NOT NULL
        AND NOT (rv.video_url = ANY(COALESCE(r.videos, ARRAY[]::TEXT[])))
    ),
    updated_at = GREATEST(
      r.updated_at, 
      (SELECT MAX(rv.created_at) FROM public.review_videos rv WHERE rv.review_id = r.id)
    )
    WHERE EXISTS (
      SELECT 1 FROM public.review_videos rv WHERE rv.review_id = r.id
    );
    
    GET DIAGNOSTICS reviews_updated = ROW_COUNT;
    migrated_count := source_count;
    
    RAISE NOTICE 'Migration complete:';
    RAISE NOTICE '  - Reviews updated: %', reviews_updated;
    RAISE NOTICE '  - Videos migrated: %', migrated_count;
  ELSE
    RAISE NOTICE '⚠️  reviews.videos column does not exist - Cannot migrate';
  END IF;
END $$;

-- ============================================
-- PART C: CONSOLIDATE review_tags → reviews tag arrays
-- ============================================
DO $$
DECLARE
  migrated_count INTEGER;
  source_count INTEGER;
  reviews_updated INTEGER;
BEGIN
  -- Get source count
  SELECT COUNT(*) INTO source_count FROM public.review_tags;
  
  RAISE NOTICE 'Starting migration of % tag rows from review_tags to reviews tag arrays', source_count;
  
  -- Check what tag type columns exist in review_tags
  -- Update reviews with tags, mapping by tag type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'review_tags' 
      AND column_name = 'tag_type'
  ) THEN
    -- If review_tags has tag_type column, map to appropriate reviews tag arrays
    -- mood_tags, genre_tags, context_tags
    UPDATE public.reviews r
    SET 
      mood_tags = COALESCE(r.mood_tags, ARRAY[]::TEXT[]) || ARRAY(
        SELECT DISTINCT rt.tag 
        FROM public.review_tags rt
        WHERE rt.review_id = r.id
          AND rt.tag_type = 'mood'
          AND rt.tag IS NOT NULL
          AND NOT (rt.tag = ANY(COALESCE(r.mood_tags, ARRAY[]::TEXT[])))
      ),
      genre_tags = COALESCE(r.genre_tags, ARRAY[]::TEXT[]) || ARRAY(
        SELECT DISTINCT rt.tag 
        FROM public.review_tags rt
        WHERE rt.review_id = r.id
          AND rt.tag_type = 'genre'
          AND rt.tag IS NOT NULL
          AND NOT (rt.tag = ANY(COALESCE(r.genre_tags, ARRAY[]::TEXT[])))
      ),
      context_tags = COALESCE(r.context_tags, ARRAY[]::TEXT[]) || ARRAY(
        SELECT DISTINCT rt.tag 
        FROM public.review_tags rt
        WHERE rt.review_id = r.id
          AND rt.tag_type = 'context'
          AND rt.tag IS NOT NULL
          AND NOT (rt.tag = ANY(COALESCE(r.context_tags, ARRAY[]::TEXT[])))
      ),
      updated_at = GREATEST(
        r.updated_at, 
        (SELECT MAX(rt.created_at) FROM public.review_tags rt WHERE rt.review_id = r.id)
      )
    WHERE EXISTS (
      SELECT 1 FROM public.review_tags rt WHERE rt.review_id = r.id
    );
  ELSE
    -- If no tag_type column, assume all tags go to context_tags
    UPDATE public.reviews r
    SET context_tags = COALESCE(r.context_tags, ARRAY[]::TEXT[]) || ARRAY(
      SELECT DISTINCT rt.tag 
      FROM public.review_tags rt
      WHERE rt.review_id = r.id
        AND rt.tag IS NOT NULL
        AND NOT (rt.tag = ANY(COALESCE(r.context_tags, ARRAY[]::TEXT[])))
    ),
    updated_at = GREATEST(
      r.updated_at, 
      (SELECT MAX(rt.created_at) FROM public.review_tags rt WHERE rt.review_id = r.id)
    )
    WHERE EXISTS (
      SELECT 1 FROM public.review_tags rt WHERE rt.review_id = r.id
    );
  END IF;
  
  GET DIAGNOSTICS reviews_updated = ROW_COUNT;
  migrated_count := source_count;
  
  RAISE NOTICE 'Migration complete:';
  RAISE NOTICE '  - Reviews updated: %', reviews_updated;
  RAISE NOTICE '  - Tags migrated: %', migrated_count;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 
  'Migration Verification' as verification_type,
  'review_photos → reviews.photos' as consolidation,
  (
    SELECT COUNT(*) 
    FROM public.reviews 
    WHERE photos IS NOT NULL AND array_length(photos, 1) > 0
  ) as reviews_with_photos,
  (SELECT COUNT(*) FROM public.review_photos) as old_count;

SELECT 
  'Migration Verification' as verification_type,
  'review_videos → reviews.videos' as consolidation,
  (
    SELECT COUNT(*) 
    FROM public.reviews 
    WHERE videos IS NOT NULL AND array_length(videos, 1) > 0
  ) as reviews_with_videos,
  (SELECT COUNT(*) FROM public.review_videos) as old_count;

SELECT 
  'Migration Verification' as verification_type,
  'review_tags → reviews tag arrays' as consolidation,
  (
    SELECT COUNT(*) 
    FROM public.reviews 
    WHERE (mood_tags IS NOT NULL AND array_length(mood_tags, 1) > 0)
       OR (genre_tags IS NOT NULL AND array_length(genre_tags, 1) > 0)
       OR (context_tags IS NOT NULL AND array_length(context_tags, 1) > 0)
  ) as reviews_with_tags,
  (SELECT COUNT(*) FROM public.review_tags) as old_count;


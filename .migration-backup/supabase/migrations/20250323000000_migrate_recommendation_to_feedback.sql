-- Migration: Migrate recommendation data to feedback columns
-- This script migrates data from recommendation columns to feedback columns
-- where feedback is empty but recommendation has data

-- Step 1: Migrate artist_performance_recommendation to artist_performance_feedback
UPDATE public.reviews
SET artist_performance_feedback = COALESCE(
  artist_performance_feedback,
  artist_performance_recommendation
)
WHERE artist_performance_recommendation IS NOT NULL
  AND artist_performance_recommendation != ''
  AND (artist_performance_feedback IS NULL OR artist_performance_feedback = '');

-- Step 2: Migrate production_recommendation to production_feedback
UPDATE public.reviews
SET production_feedback = COALESCE(
  production_feedback,
  production_recommendation
)
WHERE production_recommendation IS NOT NULL
  AND production_recommendation != ''
  AND (production_feedback IS NULL OR production_feedback = '');

-- Step 3: Migrate venue_recommendation to venue_feedback
UPDATE public.reviews
SET venue_feedback = COALESCE(
  venue_feedback,
  venue_recommendation
)
WHERE venue_recommendation IS NOT NULL
  AND venue_recommendation != ''
  AND (venue_feedback IS NULL OR venue_feedback = '');

-- Step 4: Migrate location_recommendation to location_feedback
UPDATE public.reviews
SET location_feedback = COALESCE(
  location_feedback,
  location_recommendation
)
WHERE location_recommendation IS NOT NULL
  AND location_recommendation != ''
  AND (location_feedback IS NULL OR location_feedback = '');

-- Step 5: Migrate value_recommendation to value_feedback
UPDATE public.reviews
SET value_feedback = COALESCE(
  value_feedback,
  value_recommendation
)
WHERE value_recommendation IS NOT NULL
  AND value_recommendation != ''
  AND (value_feedback IS NULL OR value_feedback = '');

-- Add comments for documentation
COMMENT ON COLUMN public.reviews.artist_performance_feedback IS 'User feedback/notes for artist performance category (migrated from artist_performance_recommendation)';
COMMENT ON COLUMN public.reviews.production_feedback IS 'User feedback/notes for production category (migrated from production_recommendation)';
COMMENT ON COLUMN public.reviews.venue_feedback IS 'User feedback/notes for venue category (migrated from venue_recommendation)';
COMMENT ON COLUMN public.reviews.location_feedback IS 'User feedback/notes for location category (migrated from location_recommendation)';
COMMENT ON COLUMN public.reviews.value_feedback IS 'User feedback/notes for value category (migrated from value_recommendation)';


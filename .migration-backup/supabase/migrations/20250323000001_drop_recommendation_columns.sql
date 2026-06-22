-- Migration: Drop recommendation columns after data migration
-- This script removes the recommendation columns since data has been migrated to feedback columns

-- Step 1: Drop artist_performance_recommendation column
ALTER TABLE public.reviews
DROP COLUMN IF EXISTS artist_performance_recommendation;

-- Step 2: Drop production_recommendation column
ALTER TABLE public.reviews
DROP COLUMN IF EXISTS production_recommendation;

-- Step 3: Drop venue_recommendation column
ALTER TABLE public.reviews
DROP COLUMN IF EXISTS venue_recommendation;

-- Step 4: Drop location_recommendation column
ALTER TABLE public.reviews
DROP COLUMN IF EXISTS location_recommendation;

-- Step 5: Drop value_recommendation column
ALTER TABLE public.reviews
DROP COLUMN IF EXISTS value_recommendation;

-- Add comments for documentation
COMMENT ON COLUMN public.reviews.artist_performance_feedback IS 'User feedback/notes for artist performance category';
COMMENT ON COLUMN public.reviews.production_feedback IS 'User feedback/notes for production category';
COMMENT ON COLUMN public.reviews.venue_feedback IS 'User feedback/notes for venue category';
COMMENT ON COLUMN public.reviews.location_feedback IS 'User feedback/notes for location category';
COMMENT ON COLUMN public.reviews.value_feedback IS 'User feedback/notes for value category';


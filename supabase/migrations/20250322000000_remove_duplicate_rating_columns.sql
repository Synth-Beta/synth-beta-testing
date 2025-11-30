-- Remove duplicate/legacy rating columns from reviews table
-- Keep only the 5-category system columns:
--   - artist_performance_rating (replaces performance_rating)
--   - production_rating (new)
--   - venue_rating_decimal (replaces venue_rating_new)
--   - location_rating (replaces overall_experience_rating for location)
--   - value_rating (replaces overall_experience_rating for value)

BEGIN;

-- 1. Migrate any remaining data from legacy columns to new columns (if not already migrated)
-- performance_rating -> artist_performance_rating
UPDATE public.reviews
SET artist_performance_rating = COALESCE(artist_performance_rating, performance_rating)
WHERE artist_performance_rating IS NULL AND performance_rating IS NOT NULL;

-- venue_rating_new -> venue_rating_decimal
UPDATE public.reviews
SET venue_rating_decimal = COALESCE(venue_rating_decimal, venue_rating_new)
WHERE venue_rating_decimal IS NULL AND venue_rating_new IS NOT NULL;

-- overall_experience_rating -> location_rating and value_rating (split for 5-category system)
UPDATE public.reviews
SET 
  location_rating = COALESCE(location_rating, overall_experience_rating),
  value_rating = COALESCE(value_rating, overall_experience_rating)
WHERE (location_rating IS NULL OR value_rating IS NULL) AND overall_experience_rating IS NOT NULL;

-- Migrate feedback text from legacy columns
UPDATE public.reviews
SET artist_performance_feedback = COALESCE(artist_performance_feedback, performance_review_text)
WHERE artist_performance_feedback IS NULL AND performance_review_text IS NOT NULL;

UPDATE public.reviews
SET venue_feedback = COALESCE(venue_feedback, venue_review_text)
WHERE venue_feedback IS NULL AND venue_review_text IS NOT NULL;

UPDATE public.reviews
SET 
  location_feedback = COALESCE(location_feedback, overall_experience_review_text),
  value_feedback = COALESCE(value_feedback, overall_experience_review_text)
WHERE (location_feedback IS NULL OR value_feedback IS NULL) AND overall_experience_review_text IS NOT NULL;

-- 2. Drop legacy rating columns (after data migration)
ALTER TABLE public.reviews
  DROP COLUMN IF EXISTS performance_rating,
  DROP COLUMN IF EXISTS venue_rating_new,
  DROP COLUMN IF EXISTS overall_experience_rating;

-- 3. Drop legacy feedback text columns
ALTER TABLE public.reviews
  DROP COLUMN IF EXISTS performance_review_text,
  DROP COLUMN IF EXISTS venue_review_text,
  DROP COLUMN IF EXISTS overall_experience_review_text;

-- 4. Drop legacy venue_rating INTEGER column (we use venue_rating_decimal DECIMAL instead)
-- Note: Only drop if there are no constraints or dependencies
-- First, drop the check constraint if it exists
ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_new_venue_rating_check;

-- Then drop the column
ALTER TABLE public.reviews
  DROP COLUMN IF EXISTS venue_rating;

-- 5. Verify the remaining columns are correct
-- Should have:
--   - artist_performance_rating NUMERIC(2,1)
--   - production_rating NUMERIC(2,1)
--   - venue_rating_decimal NUMERIC(2,1)
--   - location_rating NUMERIC(2,1)
--   - value_rating NUMERIC(2,1)
--   - artist_performance_feedback TEXT
--   - production_feedback TEXT
--   - venue_feedback TEXT
--   - location_feedback TEXT
--   - value_feedback TEXT
--   - artist_performance_recommendation TEXT
--   - production_recommendation TEXT
--   - venue_recommendation TEXT
--   - location_recommendation TEXT
--   - value_recommendation TEXT

COMMIT;

-- Verification query (run after migration to confirm)
-- SELECT 
--   column_name, 
--   data_type, 
--   numeric_precision, 
--   numeric_scale
-- FROM information_schema.columns 
-- WHERE table_name = 'reviews' 
--   AND column_name LIKE '%rating%' OR column_name LIKE '%feedback%' OR column_name LIKE '%recommendation%'
-- ORDER BY column_name;


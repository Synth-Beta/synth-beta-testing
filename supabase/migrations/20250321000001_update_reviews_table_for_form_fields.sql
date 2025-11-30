-- Update reviews table to include all 5-category form fields
-- Maintains 3NF: each attribute is atomic and depends only on the primary key (id)
-- No new tables created - only ALTERs to existing reviews table

BEGIN;

-- 1. Add all 5 category rating columns (DECIMAL(2,1) for half-star precision 0.5-5.0)
-- Note: If venue_rating exists as INTEGER, we add venue_rating_decimal instead
DO $$
BEGIN
  -- Check if venue_rating exists and is INTEGER type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'reviews' 
    AND column_name = 'venue_rating'
    AND data_type = 'integer'
  ) THEN
    -- Add venue_rating_decimal for 5-category system (to avoid conflict with INTEGER venue_rating)
    ALTER TABLE public.reviews
      ADD COLUMN IF NOT EXISTS venue_rating_decimal DECIMAL(2,1) CHECK (venue_rating_decimal >= 0.5 AND venue_rating_decimal <= 5.0);
    
    -- Migrate data from INTEGER venue_rating to DECIMAL venue_rating_decimal
    UPDATE public.reviews
    SET venue_rating_decimal = venue_rating::DECIMAL(2,1)
    WHERE venue_rating IS NOT NULL AND venue_rating_decimal IS NULL;
  ELSE
    -- Add or alter venue_rating as DECIMAL if it doesn't exist or is already DECIMAL
    -- If it exists as INTEGER, this will fail and we'll use venue_rating_decimal above
    ALTER TABLE public.reviews
      ADD COLUMN IF NOT EXISTS venue_rating DECIMAL(2,1) CHECK (venue_rating >= 0.5 AND venue_rating <= 5.0);
  END IF;
EXCEPTION
  WHEN duplicate_column THEN
    -- If venue_rating already exists as different type, use venue_rating_decimal
    ALTER TABLE public.reviews
      ADD COLUMN IF NOT EXISTS venue_rating_decimal DECIMAL(2,1) CHECK (venue_rating_decimal >= 0.5 AND venue_rating_decimal <= 5.0);
END $$;

-- Add other 5-category rating columns
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS artist_performance_rating DECIMAL(2,1) CHECK (artist_performance_rating >= 0.5 AND artist_performance_rating <= 5.0),
  ADD COLUMN IF NOT EXISTS production_rating DECIMAL(2,1) CHECK (production_rating >= 0.5 AND production_rating <= 5.0),
  ADD COLUMN IF NOT EXISTS location_rating DECIMAL(2,1) CHECK (location_rating >= 0.5 AND location_rating <= 5.0),
  ADD COLUMN IF NOT EXISTS value_rating DECIMAL(2,1) CHECK (value_rating >= 0.5 AND value_rating <= 5.0);

-- 2. Add all 5 category feedback text columns (optional textual feedback)
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS artist_performance_feedback TEXT,
  ADD COLUMN IF NOT EXISTS production_feedback TEXT,
  ADD COLUMN IF NOT EXISTS venue_feedback TEXT,
  ADD COLUMN IF NOT EXISTS location_feedback TEXT,
  ADD COLUMN IF NOT EXISTS value_feedback TEXT;

-- 3. Add all 5 category recommendation columns (preset recommendation labels)
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS artist_performance_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS production_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS venue_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS location_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS value_recommendation TEXT;

-- 4. Ensure ticket_price_paid column exists
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS ticket_price_paid NUMERIC(8,2) CHECK (ticket_price_paid >= 0);

-- 5. Create indexes for efficient querying on rating columns
CREATE INDEX IF NOT EXISTS idx_reviews_artist_performance_rating ON public.reviews(artist_performance_rating) WHERE artist_performance_rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_production_rating ON public.reviews(production_rating) WHERE production_rating IS NOT NULL;

-- Handle venue_rating index (check if it's venue_rating_decimal or venue_rating)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'reviews' 
    AND column_name = 'venue_rating_decimal'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_reviews_venue_rating_decimal ON public.reviews(venue_rating_decimal) WHERE venue_rating_decimal IS NOT NULL;
  ELSE
    CREATE INDEX IF NOT EXISTS idx_reviews_venue_rating ON public.reviews(venue_rating) WHERE venue_rating IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reviews_location_rating ON public.reviews(location_rating) WHERE location_rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_value_rating ON public.reviews(value_rating) WHERE value_rating IS NOT NULL;

-- 6. Backfill from legacy 3-category columns if they exist (for data migration)
-- Map performance_rating -> artist_performance_rating
UPDATE public.reviews
SET artist_performance_rating = COALESCE(artist_performance_rating, performance_rating)
WHERE artist_performance_rating IS NULL AND performance_rating IS NOT NULL;

-- Map venue_rating_new -> venue_rating (or venue_rating_decimal if INTEGER venue_rating exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'reviews' 
    AND column_name = 'venue_rating_decimal'
  ) THEN
    UPDATE public.reviews
    SET venue_rating_decimal = COALESCE(venue_rating_decimal, venue_rating_new)
    WHERE venue_rating_decimal IS NULL AND venue_rating_new IS NOT NULL;
  ELSE
    UPDATE public.reviews
    SET venue_rating = COALESCE(venue_rating, venue_rating_new)
    WHERE venue_rating IS NULL AND venue_rating_new IS NOT NULL;
  END IF;
END $$;

-- Map overall_experience_rating -> location_rating and value_rating (split for 5-category system)
UPDATE public.reviews
SET 
  location_rating = COALESCE(location_rating, overall_experience_rating),
  value_rating = COALESCE(value_rating, overall_experience_rating)
WHERE (location_rating IS NULL OR value_rating IS NULL) AND overall_experience_rating IS NOT NULL;

-- Backfill feedback from legacy columns
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

-- 7. Add column comments for documentation
COMMENT ON COLUMN public.reviews.artist_performance_rating IS 'Rating for artist/band performance quality (0.5-5.0, half-star increments)';
COMMENT ON COLUMN public.reviews.production_rating IS 'Rating for production quality: sound, lights, visuals (0.5-5.0, half-star increments)';
COMMENT ON COLUMN public.reviews.venue_rating IS 'Rating for venue amenities, staff, comfort (0.5-5.0, half-star increments)';
COMMENT ON COLUMN public.reviews.location_rating IS 'Rating for location, neighborhood, transportation, logistics (0.5-5.0, half-star increments)';
COMMENT ON COLUMN public.reviews.value_rating IS 'Rating for overall value relative to ticket price paid (0.5-5.0, half-star increments)';
COMMENT ON COLUMN public.reviews.artist_performance_feedback IS 'Optional written feedback text for artist performance category';
COMMENT ON COLUMN public.reviews.production_feedback IS 'Optional written feedback text for production quality category';
COMMENT ON COLUMN public.reviews.venue_feedback IS 'Optional written feedback text for venue category';
COMMENT ON COLUMN public.reviews.location_feedback IS 'Optional written feedback text for location/logistics category';
COMMENT ON COLUMN public.reviews.value_feedback IS 'Optional written feedback text for value category';
COMMENT ON COLUMN public.reviews.artist_performance_recommendation IS 'Preset recommendation label selected for artist performance (e.g., "Electric energy", "Tight musicianship")';
COMMENT ON COLUMN public.reviews.production_recommendation IS 'Preset recommendation label selected for production quality (e.g., "Insane light show", "Crystal clear mix")';
COMMENT ON COLUMN public.reviews.venue_recommendation IS 'Preset recommendation label selected for venue (e.g., "Staff was incredible", "Comfortable layout")';
COMMENT ON COLUMN public.reviews.location_recommendation IS 'Preset recommendation label selected for location/logistics (e.g., "Easy transit", "Great pre-show spots")';
COMMENT ON COLUMN public.reviews.value_recommendation IS 'Preset recommendation label selected for value (e.g., "Worth every dollar", "Steal of a night")';
COMMENT ON COLUMN public.reviews.ticket_price_paid IS 'Ticket price paid by the reviewer (stored privately, used for value calculations)';

COMMIT;


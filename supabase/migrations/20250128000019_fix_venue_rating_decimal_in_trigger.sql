-- Fix ensure_draft_no_rating trigger to use venue_rating instead of venue_rating_decimal
-- This migration ensures the trigger function uses the correct column name and removes the old column

BEGIN;

-- Step 1: Drop the old venue_rating_decimal column and its constraint if they exist
-- First drop the constraint
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_venue_rating_decimal_check;

-- Drop the column if it exists (this will cascade and drop the constraint automatically)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'reviews' 
    AND column_name = 'venue_rating_decimal'
  ) THEN
    -- Migrate any data from venue_rating_decimal to venue_rating if venue_rating is NULL
    UPDATE public.reviews
    SET venue_rating = venue_rating_decimal
    WHERE venue_rating_decimal IS NOT NULL 
      AND (venue_rating IS NULL OR venue_rating = 0);
    
    -- Now drop the column
    ALTER TABLE public.reviews DROP COLUMN venue_rating_decimal;
    RAISE NOTICE 'Dropped venue_rating_decimal column';
  END IF;
END $$;

-- Step 2: Ensure venue_rating column exists as DECIMAL(2,1) with proper constraint
DO $$
BEGIN
  -- Check if venue_rating exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'reviews' 
    AND column_name = 'venue_rating'
  ) THEN
    -- Add venue_rating column
    ALTER TABLE public.reviews
      ADD COLUMN venue_rating DECIMAL(2,1) CHECK (venue_rating >= 0.5 AND venue_rating <= 5.0);
    RAISE NOTICE 'Added venue_rating column';
  ELSE
    -- Column exists, ensure it has the right constraint
    -- Drop existing constraint if it exists
    ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_venue_rating_check;
    -- Add the correct constraint
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_venue_rating_check 
      CHECK (venue_rating IS NULL OR (venue_rating >= 0.5 AND venue_rating <= 5.0));
    RAISE NOTICE 'Updated venue_rating constraint';
  END IF;
END $$;

-- Step 3: Update ensure_draft_no_rating trigger function to use venue_rating (not venue_rating_decimal)
CREATE OR REPLACE FUNCTION public.ensure_draft_no_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_sum NUMERIC := 0;
  v_count INTEGER := 0;
  v_avg NUMERIC;
BEGIN
  -- If this is a draft, ensure rating is NULL
  IF NEW.is_draft = true THEN
    NEW.rating := NULL;
  -- If this is being published (is_draft = false), calculate rating from available category ratings
  ELSIF NEW.is_draft = false THEN
    -- Only calculate if at least one category rating is provided
    IF NEW.artist_performance_rating IS NOT NULL 
       OR NEW.production_rating IS NOT NULL 
       OR NEW.venue_rating IS NOT NULL 
       OR NEW.location_rating IS NOT NULL 
       OR NEW.value_rating IS NOT NULL THEN
      -- Calculate average from available category ratings only
      IF NEW.artist_performance_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.artist_performance_rating;
        v_count := v_count + 1;
      END IF;
      IF NEW.production_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.production_rating;
        v_count := v_count + 1;
      END IF;
      IF NEW.venue_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.venue_rating;
        v_count := v_count + 1;
      END IF;
      IF NEW.location_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.location_rating;
        v_count := v_count + 1;
      END IF;
      IF NEW.value_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.value_rating;
        v_count := v_count + 1;
      END IF;
      
      -- Only calculate if we have at least one rating
      IF v_count > 0 THEN
        v_avg := ROUND((v_sum / v_count)::NUMERIC, 1); -- Round to 1 decimal place
        NEW.rating := GREATEST(0.5, LEAST(5.0, v_avg)); -- Clamp between 0.5 and 5.0
      ELSE
        -- No ratings provided - allow NULL (for different review types)
        NEW.rating := NULL;
      END IF;
    ELSE
      -- No category ratings at all - allow NULL (for different review types)
      NEW.rating := NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update comment to reflect correct column name
COMMENT ON FUNCTION public.ensure_draft_no_rating IS 
  'Ensures drafts have NULL rating. For published reviews, calculates rating as average of available category ratings (artist_performance_rating, production_rating, venue_rating, location_rating, value_rating) only. Allows NULL rating if no categories are provided (supports different review types).';

COMMIT;


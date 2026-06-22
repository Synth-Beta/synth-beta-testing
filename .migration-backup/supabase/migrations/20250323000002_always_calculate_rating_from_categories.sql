-- Migration: Always calculate rating from 5 category ratings
-- This ensures reviews.rating is always the average of the 5 category decimals
-- and stays in sync even if category ratings are updated directly

-- Update the trigger function to ALWAYS recalculate rating from category ratings when publishing
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
    NEW.rating = NULL;
  -- If this is being published (is_draft = false), ALWAYS recalculate rating from category ratings
  ELSIF NEW.is_draft = false THEN
    -- Always recalculate from category ratings to ensure accuracy
    -- This ensures rating stays in sync even if category ratings are updated
    IF NEW.artist_performance_rating IS NOT NULL 
       OR NEW.production_rating IS NOT NULL 
       OR NEW.venue_rating_decimal IS NOT NULL 
       OR NEW.location_rating IS NOT NULL 
       OR NEW.value_rating IS NOT NULL THEN
      -- Calculate average from available category ratings
      IF NEW.artist_performance_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.artist_performance_rating;
        v_count := v_count + 1;
      END IF;
      IF NEW.production_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.production_rating;
        v_count := v_count + 1;
      END IF;
      IF NEW.venue_rating_decimal IS NOT NULL THEN
        v_sum := v_sum + NEW.venue_rating_decimal;
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
      
      IF v_count > 0 THEN
        v_avg := ROUND((v_sum / v_count)::NUMERIC, 1); -- Round to 1 decimal place
        NEW.rating := GREATEST(0.5, LEAST(5.0, v_avg)); -- Clamp between 0.5 and 5.0
      ELSE
        -- Default to 3.0 if no category ratings available (shouldn't happen for published reviews)
        NEW.rating := 3.0;
      END IF;
    ELSE
      -- Default to 3.0 if no ratings at all (shouldn't happen for published reviews)
      NEW.rating := 3.0;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.ensure_draft_no_rating IS 'Ensures drafts have NULL rating and published reviews always have rating calculated as average of 5 category ratings (artist_performance, production, venue_decimal, location, value), rounded to 1 decimal place.';

-- Ensure the trigger exists and is using the updated function
DROP TRIGGER IF EXISTS ensure_draft_no_rating_trigger ON public.reviews;

CREATE TRIGGER ensure_draft_no_rating_trigger
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_draft_no_rating();

-- Step 2: Fix existing published reviews to have correct rating calculated from category ratings
-- This is a one-time update to ensure all existing reviews have accurate ratings
-- We'll use a simple approach: calculate the average and update
DO $$
DECLARE
  v_sum NUMERIC;
  v_count INTEGER;
  v_avg NUMERIC;
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT id, 
           artist_performance_rating, 
           production_rating, 
           venue_rating_decimal, 
           location_rating, 
           value_rating
    FROM public.reviews
    WHERE is_draft = false
      AND (
        artist_performance_rating IS NOT NULL 
        OR production_rating IS NOT NULL 
        OR venue_rating_decimal IS NOT NULL 
        OR location_rating IS NOT NULL 
        OR value_rating IS NOT NULL
      )
  LOOP
    v_sum := 0;
    v_count := 0;
    
    IF rec.artist_performance_rating IS NOT NULL THEN
      v_sum := v_sum + rec.artist_performance_rating;
      v_count := v_count + 1;
    END IF;
    IF rec.production_rating IS NOT NULL THEN
      v_sum := v_sum + rec.production_rating;
      v_count := v_count + 1;
    END IF;
    IF rec.venue_rating_decimal IS NOT NULL THEN
      v_sum := v_sum + rec.venue_rating_decimal;
      v_count := v_count + 1;
    END IF;
    IF rec.location_rating IS NOT NULL THEN
      v_sum := v_sum + rec.location_rating;
      v_count := v_count + 1;
    END IF;
    IF rec.value_rating IS NOT NULL THEN
      v_sum := v_sum + rec.value_rating;
      v_count := v_count + 1;
    END IF;
    
    IF v_count > 0 THEN
      v_avg := ROUND((v_sum / v_count)::NUMERIC, 1);
      v_avg := GREATEST(0.5, LEAST(5.0, v_avg));
      
      UPDATE public.reviews
      SET rating = v_avg
      WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- Add comment explaining the update
COMMENT ON COLUMN public.reviews.rating IS 'Overall rating calculated as average of 5 category ratings (artist_performance_rating, production_rating, venue_rating_decimal, location_rating, value_rating), rounded to 1 decimal place. Automatically calculated by trigger when publishing.';


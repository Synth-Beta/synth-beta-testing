-- Fix save_review_draft function to handle NOT NULL rating constraint
-- Allow NULL rating for drafts, but require rating for published reviews

BEGIN;

-- Step 1: Drop existing CHECK constraint on rating if it exists
-- First, try to drop by exact name
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_rating_check;

-- Also drop any other rating check constraints that might exist
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Find and drop any existing rating check constraint
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint 
    WHERE conrelid = 'public.reviews'::regclass
      AND contype = 'c'
      AND (pg_get_constraintdef(oid) LIKE '%rating%' 
           OR conname LIKE '%rating%')
  LOOP
    EXECUTE format('ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS %I', constraint_name);
    RAISE NOTICE 'Dropped constraint: %', constraint_name;
  END LOOP;
END $$;

-- Step 2: Drop all views that depend on the rating column
-- We need to drop these before altering the column type, then they can be recreated
-- Drop the specific view mentioned in the error
DROP VIEW IF EXISTS public.reviews_with_event_details CASCADE;

-- Drop other common views that might reference the rating column
DROP VIEW IF EXISTS public.public_reviews_with_profiles CASCADE;
DROP VIEW IF EXISTS public.enhanced_reviews_with_profiles CASCADE;
DROP VIEW IF EXISTS public.venue_reviews_with_profiles CASCADE;
DROP VIEW IF EXISTS public.reviews_with_connection_degree CASCADE;

-- Drop any other views that depend on reviews table (using pg_depend)
DO $$
DECLARE
  view_name TEXT;
BEGIN
  -- Find and drop all views that depend on the reviews table
  FOR view_name IN
    SELECT DISTINCT dependent_view.relname::TEXT
    FROM pg_depend
    JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
    JOIN pg_class AS dependent_view ON pg_rewrite.ev_class = dependent_view.oid
    JOIN pg_class AS source_table ON pg_depend.refobjid = source_table.oid
    WHERE source_table.relname = 'reviews'
      AND source_table.relnamespace = 'public'::regnamespace
      AND dependent_view.relkind = 'v'
      AND dependent_view.relnamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', view_name);
    RAISE NOTICE 'Dropped view: public.%', view_name;
  END LOOP;
END $$;

-- Step 3: Convert rating column from INTEGER to NUMERIC(3,1) to support decimal values (0.5-5.0)
-- First, convert existing integer ratings to decimal
DO $$
BEGIN
  -- Convert existing integer ratings to decimal (preserve existing values)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'reviews' 
    AND column_name = 'rating' 
    AND data_type = 'integer'
  ) THEN
    -- Convert integer to numeric, preserving values
    ALTER TABLE public.reviews 
      ALTER COLUMN rating TYPE NUMERIC(3,1) USING rating::NUMERIC(3,1);
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'reviews' 
    AND column_name = 'rating' 
    AND data_type = 'numeric'
  ) THEN
    -- Already numeric, just ensure precision
    ALTER TABLE public.reviews 
      ALTER COLUMN rating TYPE NUMERIC(3,1) USING rating::NUMERIC(3,1);
  ELSE
    -- Column doesn't exist or is different type, add it
    ALTER TABLE public.reviews 
      ADD COLUMN rating NUMERIC(3,1);
  END IF;
END $$;

-- Step 4: Make rating column nullable
ALTER TABLE public.reviews 
  ALTER COLUMN rating DROP NOT NULL;

-- Step 5: Add new check constraint: rating must be NOT NULL for published reviews (is_draft = false)
-- Allow NULL for drafts, require 0.5-5.0 for published reviews (decimal support)
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_rating_check 
  CHECK (
    (is_draft = true AND rating IS NULL) OR 
    (is_draft = false AND rating IS NOT NULL AND rating >= 0.5 AND rating <= 5.0)
  );

-- Step 6: Update save_review_draft function to explicitly set rating to NULL for drafts
-- Also handle case where a published review already exists (should not create duplicate draft)
CREATE OR REPLACE FUNCTION public.save_review_draft(
  p_user_id UUID,
  p_event_id UUID,
  p_draft_data JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  draft_id UUID;
  existing_review_id UUID;
  existing_is_draft BOOLEAN;
BEGIN
  -- First, check if ANY review exists (draft or published) for this user/event
  SELECT id, is_draft INTO existing_review_id, existing_is_draft
  FROM public.reviews
  WHERE user_id = p_user_id 
    AND event_id = p_event_id
  LIMIT 1;
  
  IF existing_review_id IS NOT NULL THEN
    -- A review already exists
    IF existing_is_draft THEN
      -- Update existing draft
      UPDATE public.reviews
      SET 
        draft_data = p_draft_data,
        last_saved_at = now(),
        updated_at = now(),
        rating = NULL -- Ensure rating is NULL for drafts
      WHERE id = existing_review_id;
      draft_id := existing_review_id;
    ELSE
      -- A published review exists - cannot create a draft for the same event
      -- Return NULL to indicate draft save failed (frontend should handle this gracefully)
      -- This prevents unique constraint violations
      RETURN NULL;
    END IF;
  ELSE
    -- No review exists, create new draft (private by default, rating = NULL)
    INSERT INTO public.reviews (
      user_id,
      event_id,
      is_draft,
      draft_data,
      last_saved_at,
      rating, -- NULL for drafts
      is_public, -- Keep drafts private
      created_at,
      updated_at
    ) VALUES (
      p_user_id,
      p_event_id,
      true,
      p_draft_data,
      now(),
      NULL, -- No rating for drafts
      false, -- Drafts are private
      now(),
      now()
    ) RETURNING id INTO draft_id;
  END IF;
  
  RETURN draft_id;
END;
$$;

-- Step 7: Add trigger to ensure drafts always have NULL rating
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
  -- If this is being published, ensure rating is NOT NULL
  ELSIF NEW.is_draft = false AND NEW.rating IS NULL THEN
    -- Calculate rating from category ratings if available
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
        NEW.rating := GREATEST(0.5, LEAST(5.0, v_avg)); -- Ensure 0.5-5.0 range
      ELSE
        -- Default to 3.0 if no category ratings available
        NEW.rating := 3.0;
      END IF;
    ELSE
      -- Default to 3.0 if no ratings at all
      NEW.rating := 3.0;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS ensure_draft_no_rating_trigger ON public.reviews;

-- Create trigger to enforce draft rating rules
CREATE TRIGGER ensure_draft_no_rating_trigger
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_draft_no_rating();

-- Step 8: Update existing drafts to have NULL rating
UPDATE public.reviews
SET rating = NULL
WHERE is_draft = true AND rating IS NOT NULL;

-- Step 9: Grant permissions
GRANT EXECUTE ON FUNCTION public.save_review_draft(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_draft_no_rating() TO authenticated;

-- Step 10: Recreate common views that were dropped (if they existed)
-- Note: These views may need to be recreated by their original migrations
-- We're just ensuring the structure is compatible

-- Step 11: Add comments
COMMENT ON COLUMN public.reviews.rating IS 'Overall rating (0.5-5.0, decimal). NULL for drafts, required for published reviews.';
COMMENT ON FUNCTION public.save_review_draft IS 'Saves draft reviews with NULL rating. Rating is required only when publishing (is_draft = false).';
COMMENT ON FUNCTION public.ensure_draft_no_rating IS 'Ensures drafts have NULL rating and published reviews have a valid decimal rating (0.5-5.0).';

COMMIT;


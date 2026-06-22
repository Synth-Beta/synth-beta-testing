-- Make event_id nullable in reviews table to allow reviews without events
-- Reviews can now be created with just artist_id and venue_id

BEGIN;

-- 1. Drop the existing unique constraint on (user_id, event_id)
-- This constraint prevents multiple reviews per user per event
-- We'll replace it with a partial unique index that only applies when event_id is not null
DO $$
BEGIN
  -- Drop the constraint if it exists (it might be named differently)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'reviews_user_id_event_id_key'
    AND table_name = 'reviews'
  ) THEN
    ALTER TABLE public.reviews DROP CONSTRAINT reviews_user_id_event_id_key;
  END IF;
  
  -- Also check for unique index
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'reviews_user_id_event_id_key'
    AND tablename = 'reviews'
  ) THEN
    DROP INDEX IF EXISTS public.reviews_user_id_event_id_key;
  END IF;
  
  -- Check for user_reviews_published_unique (from draft support migration)
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'user_reviews_published_unique'
    AND tablename = 'reviews'
  ) THEN
    DROP INDEX IF EXISTS public.user_reviews_published_unique;
  END IF;
END $$;

-- 2. Make event_id nullable
ALTER TABLE public.reviews 
  ALTER COLUMN event_id DROP NOT NULL;

-- 3. Make the foreign key constraint allow NULL values (it should already, but ensure it)
-- The foreign key constraint should already allow NULLs, but we'll verify
DO $$
BEGIN
  -- Check if foreign key exists and drop/recreate if needed to ensure NULL is allowed
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'reviews_event_id_fkey'
    AND table_name = 'reviews'
  ) THEN
    -- Foreign key already exists - it should allow NULLs by default
    -- But we'll ensure the constraint allows NULLs explicitly
    ALTER TABLE public.reviews 
      DROP CONSTRAINT IF EXISTS reviews_event_id_fkey;
    
    -- Recreate with explicit NULL handling
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_event_id_fkey 
      FOREIGN KEY (event_id) 
      REFERENCES public.events(id) 
      ON DELETE CASCADE;
  END IF;
END $$;

-- 4. Create partial unique index for reviews WITH event_id (one review per user per event)
-- This maintains the original constraint for reviews that have an event_id
CREATE UNIQUE INDEX IF NOT EXISTS reviews_user_id_event_id_unique 
  ON public.reviews(user_id, event_id) 
  WHERE event_id IS NOT NULL AND is_draft = false;

-- 5. Create unique index for reviews WITHOUT event_id (one review per user per artist+venue combination)
-- This ensures users can't create duplicate reviews for the same artist+venue when there's no event
CREATE UNIQUE INDEX IF NOT EXISTS reviews_user_id_artist_id_venue_id_unique 
  ON public.reviews(user_id, artist_id, venue_id) 
  WHERE event_id IS NULL AND is_draft = false 
  AND artist_id IS NOT NULL AND venue_id IS NOT NULL;

-- 6. Add comment explaining the new constraint structure
COMMENT ON INDEX reviews_user_id_event_id_unique IS 
  'Ensures one published review per user per event (when event_id is provided)';

COMMENT ON INDEX reviews_user_id_artist_id_venue_id_unique IS 
  'Ensures one published review per user per artist+venue combination (when event_id is null)';

COMMIT;




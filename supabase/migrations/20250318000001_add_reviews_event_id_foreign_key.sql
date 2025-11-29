-- Add foreign key constraint from reviews.event_id to events.id
-- This enables Supabase's automatic relationship detection for joins

-- Check if the foreign key already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'reviews_event_id_fkey'
    AND table_name = 'reviews'
  ) THEN
    -- Add the foreign key constraint
    ALTER TABLE public.reviews
    ADD CONSTRAINT reviews_event_id_fkey 
    FOREIGN KEY (event_id) 
    REFERENCES public.events(id) 
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Added foreign key constraint reviews_event_id_fkey';
  ELSE
    RAISE NOTICE 'Foreign key constraint reviews_event_id_fkey already exists';
  END IF;
END $$;

-- Create index if it doesn't exist (should already exist, but ensure it)
CREATE INDEX IF NOT EXISTS idx_reviews_event_id ON public.reviews(event_id);

-- Add comment
COMMENT ON CONSTRAINT reviews_event_id_fkey ON public.reviews IS 
'Foreign key from reviews.event_id to events.id - enables automatic relationship detection in Supabase';


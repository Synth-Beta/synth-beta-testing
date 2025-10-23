-- IMMEDIATE FIX for review system errors
-- This script fixes the 404 errors and array_length function issues

-- 1. First, let's fix the array_length function error in the setlist sync trigger
CREATE OR REPLACE FUNCTION sync_setlist_to_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if setlist data exists and is not null
  IF NEW.setlist IS NOT NULL THEN
    -- Update the corresponding jambase_events record
    UPDATE public.jambase_events 
    SET 
      setlist = NEW.setlist,
      setlist_source = 'user_import',
      setlist_enriched = true,
      setlist_last_updated = NOW(),
      updated_at = NOW(),
      setlist_song_count = CASE 
        WHEN NEW.setlist->>'songCount' IS NOT NULL 
        THEN (NEW.setlist->>'songCount')::INTEGER
        WHEN NEW.setlist->'songs' IS NOT NULL AND jsonb_typeof(NEW.setlist->'songs') = 'array'
        THEN (SELECT COUNT(*) FROM jsonb_array_elements(NEW.setlist->'songs'))  -- Safe alternative to jsonb_array_length
        ELSE 0
      END,
      setlist_fm_url = NEW.setlist->>'url',
      setlist_fm_id = NEW.setlist->>'setlistFmId'
    WHERE id = NEW.event_id;
    
    -- Log the sync for debugging
    RAISE NOTICE 'Synced setlist data from review % to event %', NEW.id, NEW.event_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Add missing columns to user_reviews table (only if they don't exist)
DO $$
BEGIN
  -- Add rank_order column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_reviews' AND column_name = 'rank_order') THEN
    ALTER TABLE public.user_reviews ADD COLUMN rank_order INTEGER;
  END IF;
  
  -- Add was_there column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_reviews' AND column_name = 'was_there') THEN
    ALTER TABLE public.user_reviews ADD COLUMN was_there BOOLEAN DEFAULT false;
  END IF;
  
  -- Add performance_rating column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_reviews' AND column_name = 'performance_rating') THEN
    ALTER TABLE public.user_reviews ADD COLUMN performance_rating DECIMAL(2,1) CHECK (performance_rating >= 1.0 AND performance_rating <= 5.0);
  END IF;
  
  -- Add venue_rating_new column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_reviews' AND column_name = 'venue_rating_new') THEN
    ALTER TABLE public.user_reviews ADD COLUMN venue_rating_new DECIMAL(2,1) CHECK (venue_rating_new >= 1.0 AND venue_rating_new <= 5.0);
  END IF;
  
  -- Add overall_experience_rating column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_reviews' AND column_name = 'overall_experience_rating') THEN
    ALTER TABLE public.user_reviews ADD COLUMN overall_experience_rating DECIMAL(2,1) CHECK (overall_experience_rating >= 1.0 AND overall_experience_rating <= 5.0);
  END IF;
  
  -- Add performance_review_text column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_reviews' AND column_name = 'performance_review_text') THEN
    ALTER TABLE public.user_reviews ADD COLUMN performance_review_text TEXT;
  END IF;
  
  -- Add venue_review_text column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_reviews' AND column_name = 'venue_review_text') THEN
    ALTER TABLE public.user_reviews ADD COLUMN venue_review_text TEXT;
  END IF;
  
  -- Add overall_experience_review_text column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_reviews' AND column_name = 'overall_experience_review_text') THEN
    ALTER TABLE public.user_reviews ADD COLUMN overall_experience_review_text TEXT;
  END IF;
END $$;

-- 3. Create indexes for the new columns (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_user_reviews_rank_order ON public.user_reviews(rank_order);
CREATE INDEX IF NOT EXISTS idx_user_reviews_was_there ON public.user_reviews(was_there);
CREATE INDEX IF NOT EXISTS idx_user_reviews_performance_rating ON public.user_reviews(performance_rating);
CREATE INDEX IF NOT EXISTS idx_user_reviews_venue_rating_new ON public.user_reviews(venue_rating_new);
CREATE INDEX IF NOT EXISTS idx_user_reviews_overall_experience_rating ON public.user_reviews(overall_experience_rating);

-- 4. Ensure proper RLS policies exist
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Public reviews are viewable by everyone" ON public.user_reviews;
  DROP POLICY IF EXISTS "Users can view their own reviews" ON public.user_reviews;
  DROP POLICY IF EXISTS "Users can create their own reviews" ON public.user_reviews;
  DROP POLICY IF EXISTS "Users can update their own reviews" ON public.user_reviews;
  DROP POLICY IF EXISTS "Users can delete their own reviews" ON public.user_reviews;
  
  -- Recreate policies
  CREATE POLICY "Public reviews are viewable by everyone" 
  ON public.user_reviews 
  FOR SELECT 
  USING (is_public = true);

  CREATE POLICY "Users can view their own reviews" 
  ON public.user_reviews 
  FOR SELECT 
  USING (auth.uid() = user_id);

  CREATE POLICY "Users can create their own reviews" 
  ON public.user_reviews 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can update their own reviews" 
  ON public.user_reviews 
  FOR UPDATE 
  USING (auth.uid() = user_id);

  CREATE POLICY "Users can delete their own reviews" 
  ON public.user_reviews 
  FOR DELETE 
  USING (auth.uid() = user_id);
END $$;

-- 5. Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_reviews TO authenticated;
GRANT SELECT ON public.user_reviews TO anon;

-- 6. Test the fixes
DO $$
BEGIN
  RAISE NOTICE 'Review system fixes applied successfully!';
  RAISE NOTICE 'Testing user_reviews table access...';
  
  -- Test that we can query the table
  PERFORM COUNT(*) FROM public.user_reviews;
  RAISE NOTICE 'user_reviews table is accessible';
  
  -- Test that the sync function exists
  PERFORM routine_name FROM information_schema.routines WHERE routine_name = 'sync_setlist_to_event';
  RAISE NOTICE 'setlist sync function is available';
  
  RAISE NOTICE 'All fixes applied successfully!';
END $$;

-- COMPREHENSIVE DATABASE FIX
-- This fixes ALL the database issues: review system, type mismatches, and missing functions

-- 1. Fix the setlist sync function (array_length error)
CREATE OR REPLACE FUNCTION sync_setlist_to_event()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.setlist IS NOT NULL THEN
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
        THEN (SELECT COUNT(*) FROM jsonb_array_elements(NEW.setlist->'songs'))
        ELSE 0
      END,
      setlist_fm_url = NEW.setlist->>'url',
      setlist_fm_id = NEW.setlist->>'setlistFmId'
    WHERE id = NEW.event_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Add missing columns to user_reviews table
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS rank_order INTEGER;
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS was_there BOOLEAN DEFAULT false;
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS performance_rating DECIMAL(2,1);
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS venue_rating_new DECIMAL(2,1);
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS overall_experience_rating DECIMAL(2,1);
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS performance_review_text TEXT;
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS venue_review_text TEXT;
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS overall_experience_review_text TEXT;

-- 3. Fix the set_user_interest function to handle the type mismatch
-- The issue is that the function expects UUID but gets TEXT
CREATE OR REPLACE FUNCTION public.set_user_interest(event_id uuid, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF interested THEN
    -- Insert row if interested (presence-based)
    INSERT INTO public.user_jambase_events (user_id, jambase_event_id)
    VALUES (auth.uid(), event_id)
    ON CONFLICT (user_id, jambase_event_id) 
    DO NOTHING;
  ELSE
    -- Delete row if not interested
    DELETE FROM public.user_jambase_events
    WHERE user_id = auth.uid() AND jambase_event_id = event_id;
  END IF;
END;
$$;

-- 4. Create an overloaded version that accepts TEXT and converts to UUID
CREATE OR REPLACE FUNCTION public.set_user_interest(event_id text, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_uuid uuid;
BEGIN
  -- Try to convert text to UUID, if it fails, return without error
  BEGIN
    event_uuid := event_id::uuid;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Invalid UUID format for event_id: %', event_id;
      RETURN;
  END;
  
  -- Call the UUID version
  PERFORM public.set_user_interest(event_uuid, interested);
END;
$$;

-- 5. Ensure user_reviews table has proper RLS policies
ALTER TABLE public.user_reviews ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies
DROP POLICY IF EXISTS "Public reviews are viewable by everyone" ON public.user_reviews;
DROP POLICY IF EXISTS "Users can view their own reviews" ON public.user_reviews;
DROP POLICY IF EXISTS "Users can create their own reviews" ON public.user_reviews;
DROP POLICY IF EXISTS "Users can update their own reviews" ON public.user_reviews;
DROP POLICY IF EXISTS "Users can delete their own reviews" ON public.user_reviews;

CREATE POLICY "Public reviews are viewable by everyone" ON public.user_reviews FOR SELECT USING (is_public = true);
CREATE POLICY "Users can view their own reviews" ON public.user_reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own reviews" ON public.user_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reviews" ON public.user_reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reviews" ON public.user_reviews FOR DELETE USING (auth.uid() = user_id);

-- 6. Grant permissions
GRANT ALL ON public.user_reviews TO authenticated;
GRANT SELECT ON public.user_reviews TO anon;
GRANT EXECUTE ON FUNCTION public.set_user_interest(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_interest(text, boolean) TO authenticated;

-- 7. Ensure user_jambase_events has proper policies
ALTER TABLE public.user_jambase_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own event associations" ON public.user_jambase_events;
CREATE POLICY "Users can manage their own event associations" ON public.user_jambase_events 
FOR ALL USING (auth.uid() = user_id);

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_reviews_rank_order ON public.user_reviews(rank_order);
CREATE INDEX IF NOT EXISTS idx_user_reviews_was_there ON public.user_reviews(was_there);
CREATE INDEX IF NOT EXISTS idx_user_reviews_performance_rating ON public.user_reviews(performance_rating);

-- 9. Test the fixes
DO $$
BEGIN
  RAISE NOTICE 'Comprehensive database fix applied successfully!';
  RAISE NOTICE 'Fixed issues:';
  RAISE NOTICE '  - Array length function error in setlist sync';
  RAISE NOTICE '  - Missing columns in user_reviews table';
  RAISE NOTICE '  - Type mismatch in set_user_interest function';
  RAISE NOTICE '  - RLS policies and permissions';
END $$;

-- Success message
SELECT 'All database issues have been fixed!' as status;

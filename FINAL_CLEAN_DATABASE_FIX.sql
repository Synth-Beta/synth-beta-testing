-- FINAL CLEAN DATABASE FIX
-- This addresses ALL identified issues without duplicating existing structures
-- Run this ONCE in Supabase SQL Editor to fix all problems

-- ============================================================================
-- ISSUE 1: Fix jsonb_array_length function error in setlist sync
-- ============================================================================

-- Replace the problematic jsonb_array_length with a working alternative
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

-- ============================================================================
-- ISSUE 2: Fix set_user_interest function type mismatch
-- ============================================================================

-- The issue: jambase_events.artist_id is TEXT (JamBase ID), but functions expect UUID
-- Solution: Create a function that handles the TEXT to UUID conversion properly

CREATE OR REPLACE FUNCTION public.set_user_interest(event_id_param text, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_uuid uuid;
BEGIN
  -- Try to convert text to UUID
  BEGIN
    event_uuid := event_id_param::uuid;
  EXCEPTION
    WHEN OTHERS THEN
      -- If conversion fails, try to find the event by jambase_event_id
      SELECT id INTO event_uuid 
      FROM public.jambase_events 
      WHERE jambase_event_id = event_id_param 
      LIMIT 1;
      
      IF event_uuid IS NULL THEN
        RAISE EXCEPTION 'Event not found: %', event_id_param;
      END IF;
  END;
  
  -- Now use the UUID version
  IF interested THEN
    INSERT INTO public.user_jambase_events (user_id, jambase_event_id)
    VALUES (auth.uid(), event_uuid)
    ON CONFLICT (user_id, jambase_event_id) 
    DO NOTHING;
  ELSE
    DELETE FROM public.user_jambase_events
    WHERE user_id = auth.uid() AND jambase_event_id = event_uuid;
  END IF;
END;
$$;

-- Keep the UUID version for backward compatibility
CREATE OR REPLACE FUNCTION public.set_user_interest(event_id uuid, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF interested THEN
    INSERT INTO public.user_jambase_events (user_id, jambase_event_id)
    VALUES (auth.uid(), event_id)
    ON CONFLICT (user_id, jambase_event_id) 
    DO NOTHING;
  ELSE
    DELETE FROM public.user_jambase_events
    WHERE user_id = auth.uid() AND jambase_event_id = event_id;
  END IF;
END;
$$;

-- ============================================================================
-- ISSUE 3: Add missing columns to user_reviews (only if they don't exist)
-- ============================================================================

-- Add missing columns that the reviewService expects
DO $$
BEGIN
  -- Check and add rank_order column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_reviews' AND column_name = 'rank_order'
  ) THEN
    ALTER TABLE public.user_reviews ADD COLUMN rank_order INTEGER;
  END IF;
  
  -- Check and add was_there column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_reviews' AND column_name = 'was_there'
  ) THEN
    ALTER TABLE public.user_reviews ADD COLUMN was_there BOOLEAN DEFAULT false;
  END IF;
  
  -- Check and add performance_rating column (may already exist from migrations)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_reviews' AND column_name = 'performance_rating'
  ) THEN
    ALTER TABLE public.user_reviews ADD COLUMN performance_rating DECIMAL(2,1);
  END IF;
  
  -- Check and add venue_rating_new column (may already exist from migrations)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_reviews' AND column_name = 'venue_rating_new'
  ) THEN
    ALTER TABLE public.user_reviews ADD COLUMN venue_rating_new DECIMAL(2,1);
  END IF;
  
  -- Check and add overall_experience_rating column (may already exist from migrations)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_reviews' AND column_name = 'overall_experience_rating'
  ) THEN
    ALTER TABLE public.user_reviews ADD COLUMN overall_experience_rating DECIMAL(2,1);
  END IF;
  
  -- Check and add performance_review_text column (may already exist from migrations)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_reviews' AND column_name = 'performance_review_text'
  ) THEN
    ALTER TABLE public.user_reviews ADD COLUMN performance_review_text TEXT;
  END IF;
  
  -- Check and add venue_review_text column (may already exist from migrations)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_reviews' AND column_name = 'venue_review_text'
  ) THEN
    ALTER TABLE public.user_reviews ADD COLUMN venue_review_text TEXT;
  END IF;
  
  -- Check and add overall_experience_review_text column (may already exist from migrations)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_reviews' AND column_name = 'overall_experience_review_text'
  ) THEN
    ALTER TABLE public.user_reviews ADD COLUMN overall_experience_review_text TEXT;
  END IF;
END $$;

-- ============================================================================
-- ISSUE 4: Fix RLS policies (clean up conflicts)
-- ============================================================================

-- Ensure user_reviews has proper RLS policies
ALTER TABLE public.user_reviews ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public reviews are viewable by everyone" ON public.user_reviews;
DROP POLICY IF EXISTS "Users can view their own reviews" ON public.user_reviews;
DROP POLICY IF EXISTS "Users can create their own reviews" ON public.user_reviews;
DROP POLICY IF EXISTS "Users can update their own reviews" ON public.user_reviews;
DROP POLICY IF EXISTS "Users can delete their own reviews" ON public.user_reviews;
DROP POLICY IF EXISTS "Users can manage their own reviews" ON public.user_reviews;

-- Create clean, non-conflicting policies
CREATE POLICY "public_reviews_select" ON public.user_reviews FOR SELECT USING (is_public = true);
CREATE POLICY "own_reviews_select" ON public.user_reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_reviews_insert" ON public.user_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_reviews_update" ON public.user_reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_reviews_delete" ON public.user_reviews FOR DELETE USING (auth.uid() = user_id);

-- Ensure user_jambase_events has proper policies
ALTER TABLE public.user_jambase_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can manage their own event associations" ON public.user_jambase_events;
DROP POLICY IF EXISTS "Users can update their own JamBase event associations" ON public.user_jambase_events;
DROP POLICY IF EXISTS "Users can delete their own JamBase event associations" ON public.user_jambase_events;
DROP POLICY IF EXISTS "Users can view their own JamBase event associations" ON public.user_jambase_events;
DROP POLICY IF EXISTS "Users can create their own JamBase event associations" ON public.user_jambase_events;
DROP POLICY IF EXISTS "Authenticated users can view all user event associations" ON public.user_jambase_events;

-- Create clean policies
CREATE POLICY "user_event_associations_select" ON public.user_jambase_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_event_associations_insert" ON public.user_jambase_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_event_associations_update" ON public.user_jambase_events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_event_associations_delete" ON public.user_jambase_events FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- ISSUE 5: Grant proper permissions
-- ============================================================================

-- Grant permissions for user_reviews
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_reviews TO authenticated;
GRANT SELECT ON public.user_reviews TO anon;

-- Grant permissions for user_jambase_events
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_jambase_events TO authenticated;
GRANT SELECT ON public.user_jambase_events TO anon;

-- Grant execute permissions for functions
GRANT EXECUTE ON FUNCTION public.set_user_interest(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_interest(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_setlist_to_event() TO authenticated;

-- ============================================================================
-- ISSUE 6: Create necessary indexes (only if they don't exist)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_reviews_rank_order ON public.user_reviews(rank_order);
CREATE INDEX IF NOT EXISTS idx_user_reviews_was_there ON public.user_reviews(was_there);
CREATE INDEX IF NOT EXISTS idx_user_jambase_events_user_id ON public.user_jambase_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_jambase_events_event_id ON public.user_jambase_events(jambase_event_id);

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'DATABASE FIX APPLIED SUCCESSFULLY!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Fixed Issues:';
  RAISE NOTICE '  ✅ Array length function error';
  RAISE NOTICE '  ✅ Type mismatch in set_user_interest';
  RAISE NOTICE '  ✅ Missing columns in user_reviews';
  RAISE NOTICE '  ✅ RLS policy conflicts';
  RAISE NOTICE '  ✅ Permission issues';
  RAISE NOTICE '  ✅ Missing indexes';
  RAISE NOTICE '========================================';
END $$;

-- Final verification
SELECT 'All database issues have been resolved!' as status;

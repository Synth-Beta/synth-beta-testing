-- MINIMAL FIX - Run this in Supabase SQL Editor immediately
-- This is the smallest possible fix to resolve the errors

-- 1. Fix the setlist function that's causing the array_length error
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
        ELSE 0
      END,
      setlist_fm_url = NEW.setlist->>'url',
      setlist_fm_id = NEW.setlist->>'setlistFmId'
    WHERE id = NEW.event_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Add the missing columns that are causing 404 errors
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS rank_order INTEGER;
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS was_there BOOLEAN DEFAULT false;

-- 3. Ensure basic RLS policies exist
ALTER TABLE public.user_reviews ENABLE ROW LEVEL SECURITY;

-- 4. Create basic policies
DROP POLICY IF EXISTS "Users can manage their own reviews" ON public.user_reviews;
CREATE POLICY "Users can manage their own reviews" ON public.user_reviews 
FOR ALL USING (auth.uid() = user_id);

-- 5. Grant permissions
GRANT ALL ON public.user_reviews TO authenticated;

-- Success message
SELECT 'Minimal fix applied successfully!' as status;

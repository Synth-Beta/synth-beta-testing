-- QUICK FIX - Copy this to Supabase SQL Editor and run immediately
-- This fixes the immediate array_length and 404 errors

-- 1. Fix the setlist sync function with safe array length calculation
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

-- 2. Add missing columns one by one (safe approach)
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS rank_order INTEGER;
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS was_there BOOLEAN DEFAULT false;
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS performance_rating DECIMAL(2,1);
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS venue_rating_new DECIMAL(2,1);
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS overall_experience_rating DECIMAL(2,1);
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS performance_review_text TEXT;
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS venue_review_text TEXT;
ALTER TABLE public.user_reviews ADD COLUMN IF NOT EXISTS overall_experience_review_text TEXT;

-- 3. Ensure RLS is enabled and policies exist
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

-- 4. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_reviews TO authenticated;
GRANT SELECT ON public.user_reviews TO anon;

-- Test
SELECT 'Fix applied successfully!' as status;

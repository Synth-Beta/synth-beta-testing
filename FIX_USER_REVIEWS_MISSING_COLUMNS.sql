-- Fix missing columns in user_reviews table that are expected by reviewService
-- This addresses the 404 errors and missing column issues

-- First, let's add any missing columns that the reviewService expects
ALTER TABLE public.user_reviews 
ADD COLUMN IF NOT EXISTS rank_order INTEGER,
ADD COLUMN IF NOT EXISTS was_there BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS performance_rating DECIMAL(2,1) CHECK (performance_rating >= 1.0 AND performance_rating <= 5.0),
ADD COLUMN IF NOT EXISTS venue_rating_new DECIMAL(2,1) CHECK (venue_rating_new >= 1.0 AND venue_rating_new <= 5.0),
ADD COLUMN IF NOT EXISTS overall_experience_rating DECIMAL(2,1) CHECK (overall_experience_rating >= 1.0 AND overall_experience_rating <= 5.0),
ADD COLUMN IF NOT EXISTS performance_review_text TEXT,
ADD COLUMN IF NOT EXISTS venue_review_text TEXT,
ADD COLUMN IF NOT EXISTS overall_experience_review_text TEXT;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_user_reviews_rank_order ON public.user_reviews(rank_order);
CREATE INDEX IF NOT EXISTS idx_user_reviews_was_there ON public.user_reviews(was_there);
CREATE INDEX IF NOT EXISTS idx_user_reviews_performance_rating ON public.user_reviews(performance_rating);
CREATE INDEX IF NOT EXISTS idx_user_reviews_venue_rating_new ON public.user_reviews(venue_rating_new);
CREATE INDEX IF NOT EXISTS idx_user_reviews_overall_experience_rating ON public.user_reviews(overall_experience_rating);

-- Add comments to document the new columns
COMMENT ON COLUMN public.user_reviews.rank_order IS 'User-defined ranking order for reviews (for top 10 lists, etc.)';
COMMENT ON COLUMN public.user_reviews.was_there IS 'Whether the user actually attended the event';
COMMENT ON COLUMN public.user_reviews.performance_rating IS 'Rating specifically for the artist/performance (1.0-5.0)';
COMMENT ON COLUMN public.user_reviews.venue_rating_new IS 'Rating specifically for the venue (1.0-5.0)';
COMMENT ON COLUMN public.user_reviews.overall_experience_rating IS 'Rating for overall experience (1.0-5.0)';
COMMENT ON COLUMN public.user_reviews.performance_review_text IS 'Text review specifically for the performance';
COMMENT ON COLUMN public.user_reviews.venue_review_text IS 'Text review specifically for the venue';
COMMENT ON COLUMN public.user_reviews.overall_experience_review_text IS 'Text review for overall experience';

-- Ensure the user_reviews table has proper RLS policies
-- Drop and recreate policies to ensure they're correct
DROP POLICY IF EXISTS "Public reviews are viewable by everyone" ON public.user_reviews;
DROP POLICY IF EXISTS "Users can view their own reviews" ON public.user_reviews;
DROP POLICY IF EXISTS "Users can create their own reviews" ON public.user_reviews;
DROP POLICY IF EXISTS "Users can update their own reviews" ON public.user_reviews;
DROP POLICY IF EXISTS "Users can delete their own reviews" ON public.user_reviews;

-- Recreate RLS policies
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

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_reviews TO authenticated;
GRANT SELECT ON public.user_reviews TO anon;

-- Ensure the table is accessible via the API
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

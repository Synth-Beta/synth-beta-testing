-- Split overall rating into three categories: Performance, Venue, and Overall Experience
-- This migration adds three new rating columns and updates the overall rating calculation

-- Add three new rating columns with half-star precision (0.5 to 5.0)
ALTER TABLE public.user_reviews 
ADD COLUMN IF NOT EXISTS performance_rating DECIMAL(2,1) CHECK (performance_rating >= 0.5 AND performance_rating <= 5.0),
ADD COLUMN IF NOT EXISTS venue_rating_new DECIMAL(2,1) CHECK (venue_rating_new >= 0.5 AND venue_rating_new <= 5.0),
ADD COLUMN IF NOT EXISTS overall_experience_rating DECIMAL(2,1) CHECK (overall_experience_rating >= 0.5 AND overall_experience_rating <= 5.0);

-- Add qualitative review text columns for each category
ALTER TABLE public.user_reviews 
ADD COLUMN IF NOT EXISTS performance_review_text TEXT,
ADD COLUMN IF NOT EXISTS venue_review_text TEXT,
ADD COLUMN IF NOT EXISTS overall_experience_review_text TEXT;

-- Create indexes for the new rating columns
CREATE INDEX IF NOT EXISTS idx_user_reviews_performance_rating ON public.user_reviews(performance_rating);
CREATE INDEX IF NOT EXISTS idx_user_reviews_venue_rating_new ON public.user_reviews(venue_rating_new);
CREATE INDEX IF NOT EXISTS idx_user_reviews_overall_experience_rating ON public.user_reviews(overall_experience_rating);

-- Migrate existing data: convert integer ratings to decimal and populate new columns
-- For existing reviews, we'll use the current rating for all three categories initially
UPDATE public.user_reviews 
SET 
  performance_rating = rating::DECIMAL(2,1),
  venue_rating_new = rating::DECIMAL(2,1),
  overall_experience_rating = rating::DECIMAL(2,1)
WHERE performance_rating IS NULL;

-- Update the overall rating to be the average of the three new ratings
UPDATE public.user_reviews 
SET rating = ROUND((performance_rating + venue_rating_new + overall_experience_rating) / 3.0)::INTEGER
WHERE performance_rating IS NOT NULL;

-- Create a new function to validate and calculate overall rating
CREATE OR REPLACE FUNCTION public.validate_and_calculate_overall_rating()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate if all three ratings are provided (for new reviews)
  -- Allow partial updates for existing reviews
  IF NEW.performance_rating IS NOT NULL AND NEW.venue_rating_new IS NOT NULL AND NEW.overall_experience_rating IS NOT NULL THEN
    -- Calculate overall rating as the average of the three categories, rounded to nearest integer
    NEW.rating = ROUND((NEW.performance_rating + NEW.venue_rating_new + NEW.overall_experience_rating) / 3.0)::INTEGER;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the old validation trigger and create the new one
DROP TRIGGER IF EXISTS validate_review_data_trigger ON public.user_reviews;
DROP TRIGGER IF EXISTS validate_three_category_rating_trigger ON public.user_reviews;
CREATE TRIGGER validate_three_category_rating_trigger
  BEFORE INSERT OR UPDATE ON public.user_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_and_calculate_overall_rating();

-- Update the public reviews view to include the new rating columns
DROP VIEW IF EXISTS public.public_reviews_with_profiles;
CREATE OR REPLACE VIEW public.public_reviews_with_profiles AS
SELECT 
    ur.id,
    ur.user_id,
    ur.event_id,
    ur.venue_id,
    ur.rating,
    ur.performance_rating,
    ur.venue_rating_new as venue_rating,
    ur.overall_experience_rating,
    ur.performance_review_text,
    ur.venue_review_text,
    ur.overall_experience_review_text,
    ur.artist_rating,
    ur.review_type,
    ur.reaction_emoji,
    ur.review_text,
    ur.photos,
    ur.videos,
    ur.mood_tags,
    ur.genre_tags,
    ur.context_tags,
    ur.venue_tags,
    ur.artist_tags,
    ur.likes_count,
    ur.comments_count,
    ur.shares_count,
    ur.created_at,
    ur.updated_at,
    p.name as reviewer_name,
    p.avatar_url as reviewer_avatar,
    je.title as event_title,
    je.artist_name,
    je.venue_name,
    je.event_date
FROM public.user_reviews ur
JOIN public.profiles p ON ur.user_id = p.user_id
LEFT JOIN public.jambase_events je ON ur.event_id = je.id
WHERE ur.is_public = true;

-- Grant access to the updated view
GRANT SELECT ON public.public_reviews_with_profiles TO authenticated;
GRANT SELECT ON public.public_reviews_with_profiles TO anon;

-- Add helpful comments
COMMENT ON COLUMN public.user_reviews.performance_rating IS 'Rating for artist/band performance quality (0.5-5.0)';
COMMENT ON COLUMN public.user_reviews.venue_rating_new IS 'Rating for venue experience - sound, staff, facilities (0.5-5.0)';
COMMENT ON COLUMN public.user_reviews.overall_experience_rating IS 'Rating for overall event experience - atmosphere, crowd, etc. (0.5-5.0)';
COMMENT ON COLUMN public.user_reviews.performance_review_text IS 'Optional qualitative review text for performance category';
COMMENT ON COLUMN public.user_reviews.venue_review_text IS 'Optional qualitative review text for venue category';
COMMENT ON COLUMN public.user_reviews.overall_experience_review_text IS 'Optional qualitative review text for overall experience category';
COMMENT ON COLUMN public.user_reviews.rating IS 'Overall rating calculated as average of performance, venue, and overall experience ratings';
-- Add venue reviews support to the existing review system
-- This migration extends the current user_reviews table to support venue-specific reviews

-- First, add venue-specific fields to the existing user_reviews table
ALTER TABLE public.user_reviews 
ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venue_profile(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS artist_rating INTEGER CHECK (artist_rating >= 1 AND artist_rating <= 5),
ADD COLUMN IF NOT EXISTS venue_rating INTEGER CHECK (venue_rating >= 1 AND venue_rating <= 5),
ADD COLUMN IF NOT EXISTS review_type TEXT DEFAULT 'event' CHECK (review_type IN ('event', 'venue', 'artist')),
ADD COLUMN IF NOT EXISTS venue_tags TEXT[], -- Venue-specific tags: "sound-quality", "staff", "drinks", "accessibility", "parking"
ADD COLUMN IF NOT EXISTS artist_tags TEXT[]; -- Artist-specific tags: "performance", "energy", "setlist", "vocals", "stage-presence"

-- Create indexes for the new fields
CREATE INDEX IF NOT EXISTS idx_user_reviews_venue_id ON public.user_reviews(venue_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_artist_rating ON public.user_reviews(artist_rating);
CREATE INDEX IF NOT EXISTS idx_user_reviews_venue_rating ON public.user_reviews(venue_rating);
CREATE INDEX IF NOT EXISTS idx_user_reviews_review_type ON public.user_reviews(review_type);
CREATE INDEX IF NOT EXISTS idx_user_reviews_venue_tags ON public.user_reviews USING GIN(venue_tags);
CREATE INDEX IF NOT EXISTS idx_user_reviews_artist_tags ON public.user_reviews USING GIN(artist_tags);

-- Create a function to ensure proper review constraints
CREATE OR REPLACE FUNCTION public.validate_review_data()
RETURNS TRIGGER AS $$
BEGIN
  -- For event reviews, require both artist and venue ratings
  IF NEW.review_type = 'event' THEN
    IF NEW.artist_rating IS NULL OR NEW.venue_rating IS NULL THEN
      RAISE EXCEPTION 'Event reviews must include both artist_rating and venue_rating';
    END IF;
    
    -- Set the overall rating as the average of artist and venue ratings
    NEW.rating = ROUND((NEW.artist_rating + NEW.venue_rating) / 2.0);
  
  -- For venue-only reviews
  ELSIF NEW.review_type = 'venue' THEN
    IF NEW.venue_rating IS NULL THEN
      RAISE EXCEPTION 'Venue reviews must include venue_rating';
    END IF;
    NEW.rating = NEW.venue_rating;
  
  -- For artist-only reviews
  ELSIF NEW.review_type = 'artist' THEN
    IF NEW.artist_rating IS NULL THEN
      RAISE EXCEPTION 'Artist reviews must include artist_rating';
    END IF;
    NEW.rating = NEW.artist_rating;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate review data
DROP TRIGGER IF EXISTS validate_review_data_trigger ON public.user_reviews;
CREATE TRIGGER validate_review_data_trigger
  BEFORE INSERT OR UPDATE ON public.user_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_review_data();

-- Create view for venue-specific reviews with aggregated data
CREATE OR REPLACE VIEW public.venue_reviews_with_profiles AS
SELECT 
    ur.id,
    ur.user_id,
    ur.event_id,
    ur.venue_id,
    ur.rating,
    ur.artist_rating,
    ur.venue_rating,
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
    je.event_date,
    vp.name as venue_profile_name,
    vp.address as venue_address,
    vp.maximum_attendee_capacity
FROM public.user_reviews ur
JOIN public.profiles p ON ur.user_id = p.user_id
LEFT JOIN public.jambase_events je ON ur.event_id = je.id
LEFT JOIN public.venue_profile vp ON ur.venue_id = vp.id
WHERE ur.is_public = true;

-- Grant access to the new view
GRANT SELECT ON public.venue_reviews_with_profiles TO authenticated;
GRANT SELECT ON public.venue_reviews_with_profiles TO anon;

-- Create function to get venue statistics
CREATE OR REPLACE FUNCTION public.get_venue_stats(venue_uuid UUID)
RETURNS TABLE (
  total_reviews INTEGER,
  average_venue_rating DECIMAL,
  average_artist_rating DECIMAL,
  average_overall_rating DECIMAL,
  rating_distribution JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_reviews,
    ROUND(AVG(ur.venue_rating), 2) as average_venue_rating,
    ROUND(AVG(ur.artist_rating), 2) as average_artist_rating,
    ROUND(AVG(ur.rating), 2) as average_overall_rating,
    JSON_BUILD_OBJECT(
      '1_star', COUNT(CASE WHEN ur.rating = 1 THEN 1 END),
      '2_star', COUNT(CASE WHEN ur.rating = 2 THEN 1 END),
      '3_star', COUNT(CASE WHEN ur.rating = 3 THEN 1 END),
      '4_star', COUNT(CASE WHEN ur.rating = 4 THEN 1 END),
      '5_star', COUNT(CASE WHEN ur.rating = 5 THEN 1 END)
    ) as rating_distribution
  FROM public.user_reviews ur
  WHERE ur.venue_id = venue_uuid 
    AND ur.is_public = true
    AND ur.venue_rating IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_venue_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_stats TO anon;

-- Create function to get popular venue tags
CREATE OR REPLACE FUNCTION public.get_popular_venue_tags(venue_uuid UUID DEFAULT NULL)
RETURNS TABLE (
  tag TEXT,
  count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    unnest(ur.venue_tags) as tag,
    COUNT(*)::INTEGER as count
  FROM public.user_reviews ur
  WHERE (venue_uuid IS NULL OR ur.venue_id = venue_uuid)
    AND ur.is_public = true
    AND ur.venue_tags IS NOT NULL
    AND array_length(ur.venue_tags, 1) > 0
  GROUP BY unnest(ur.venue_tags)
  ORDER BY count DESC, tag ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_popular_venue_tags TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_popular_venue_tags TO anon;

-- Update the existing public_reviews_with_profiles view to include the new fields
DROP VIEW IF EXISTS public.public_reviews_with_profiles;
CREATE OR REPLACE VIEW public.public_reviews_with_profiles AS
SELECT 
    ur.id,
    ur.user_id,
    ur.event_id,
    ur.venue_id,
    ur.rating,
    ur.artist_rating,
    ur.venue_rating,
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
    je.event_date,
    vp.name as venue_profile_name,
    vp.address as venue_address
FROM public.user_reviews ur
JOIN public.profiles p ON ur.user_id = p.user_id
LEFT JOIN public.jambase_events je ON ur.event_id = je.id
LEFT JOIN public.venue_profile vp ON ur.venue_id = vp.id
WHERE ur.is_public = true;

-- Grant access to the updated view
GRANT SELECT ON public.public_reviews_with_profiles TO authenticated;
GRANT SELECT ON public.public_reviews_with_profiles TO anon;

-- Add some helpful comments
COMMENT ON COLUMN public.user_reviews.venue_id IS 'Reference to venue_profile table for venue-specific reviews';
COMMENT ON COLUMN public.user_reviews.artist_rating IS 'Rating specifically for the artist performance (1-5)';
COMMENT ON COLUMN public.user_reviews.venue_rating IS 'Rating specifically for the venue experience (1-5)';
COMMENT ON COLUMN public.user_reviews.review_type IS 'Type of review: event (both artist+venue), venue (venue only), or artist (artist only)';
COMMENT ON COLUMN public.user_reviews.venue_tags IS 'Venue-specific tags like sound-quality, staff, drinks, accessibility, parking';
COMMENT ON COLUMN public.user_reviews.artist_tags IS 'Artist-specific tags like performance, energy, setlist, vocals, stage-presence';

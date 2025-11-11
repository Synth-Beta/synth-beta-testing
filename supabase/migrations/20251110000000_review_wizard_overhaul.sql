-- Migrate user review schema to five-category Airbnb-style wizard
-- Adds new rating/feedback columns, preserves existing data, and updates validation logic

BEGIN;

-- 1. Add new rating columns with half-star precision (0.5 - 5.0)
ALTER TABLE public.user_reviews
  ADD COLUMN IF NOT EXISTS artist_performance_rating DECIMAL(2,1) CHECK (artist_performance_rating >= 0.5 AND artist_performance_rating <= 5.0),
  ADD COLUMN IF NOT EXISTS production_rating DECIMAL(2,1) CHECK (production_rating >= 0.5 AND production_rating <= 5.0),
  ADD COLUMN IF NOT EXISTS venue_rating DECIMAL(2,1) CHECK (venue_rating >= 0.5 AND venue_rating <= 5.0),
  ADD COLUMN IF NOT EXISTS location_rating DECIMAL(2,1) CHECK (location_rating >= 0.5 AND location_rating <= 5.0),
  ADD COLUMN IF NOT EXISTS value_rating DECIMAL(2,1) CHECK (value_rating >= 0.5 AND value_rating <= 5.0),
  ADD COLUMN IF NOT EXISTS ticket_price_paid NUMERIC(8,2) CHECK (ticket_price_paid >= 0);

-- 2. Add optional feedback + recommendation text columns for each category
ALTER TABLE public.user_reviews
  ADD COLUMN IF NOT EXISTS artist_performance_feedback TEXT,
  ADD COLUMN IF NOT EXISTS production_feedback TEXT,
  ADD COLUMN IF NOT EXISTS venue_feedback TEXT,
  ADD COLUMN IF NOT EXISTS location_feedback TEXT,
  ADD COLUMN IF NOT EXISTS value_feedback TEXT,
  ADD COLUMN IF NOT EXISTS artist_performance_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS production_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS venue_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS location_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS value_recommendation TEXT;

-- 3. Backfill new columns from legacy data where possible
UPDATE public.user_reviews
SET
  artist_performance_rating = COALESCE(artist_performance_rating, performance_rating, rating::DECIMAL(2,1)),
  production_rating = COALESCE(production_rating, performance_rating, rating::DECIMAL(2,1)),
  venue_rating = COALESCE(venue_rating, venue_rating_new, venue_rating::DECIMAL(2,1), rating::DECIMAL(2,1)),
  location_rating = COALESCE(location_rating, venue_rating_new, rating::DECIMAL(2,1)),
  value_rating = COALESCE(value_rating, overall_experience_rating, rating::DECIMAL(2,1)),
  artist_performance_feedback = COALESCE(artist_performance_feedback, performance_review_text),
  venue_feedback = COALESCE(venue_feedback, venue_review_text),
  value_feedback = COALESCE(value_feedback, overall_experience_review_text)
WHERE artist_performance_rating IS NULL
   OR production_rating IS NULL
   OR venue_rating IS NULL
   OR location_rating IS NULL
   OR value_rating IS NULL
   OR artist_performance_feedback IS NULL
   OR venue_feedback IS NULL
   OR value_feedback IS NULL;

-- 4. Recalculate integer overall rating when all five categories exist
UPDATE public.user_reviews
SET rating = ROUND(
  (
    COALESCE(artist_performance_rating, rating::DECIMAL(2,1)) +
    COALESCE(production_rating, rating::DECIMAL(2,1)) +
    COALESCE(venue_rating, rating::DECIMAL(2,1)) +
    COALESCE(location_rating, rating::DECIMAL(2,1)) +
    COALESCE(value_rating, rating::DECIMAL(2,1))
  ) / 5.0
)::INTEGER
WHERE artist_performance_rating IS NOT NULL
  AND production_rating IS NOT NULL
  AND venue_rating IS NOT NULL
  AND location_rating IS NOT NULL
  AND value_rating IS NOT NULL;

-- 5. Drop obsolete indexes before removing legacy columns
DROP INDEX IF EXISTS idx_user_reviews_performance_rating;
DROP INDEX IF EXISTS idx_user_reviews_venue_rating_new;
DROP INDEX IF EXISTS idx_user_reviews_overall_experience_rating;

-- 6. Drop legacy columns now that data has been migrated
ALTER TABLE public.user_reviews
  DROP COLUMN IF EXISTS performance_rating,
  DROP COLUMN IF EXISTS performance_review_text,
  DROP COLUMN IF EXISTS venue_rating_new,
  DROP COLUMN IF EXISTS venue_review_text,
  DROP COLUMN IF EXISTS overall_experience_rating,
  DROP COLUMN IF EXISTS overall_experience_review_text;

-- 7. Recreate rating indexes for the new fields
CREATE INDEX IF NOT EXISTS idx_user_reviews_artist_performance_rating ON public.user_reviews(artist_performance_rating);
CREATE INDEX IF NOT EXISTS idx_user_reviews_production_rating ON public.user_reviews(production_rating);
CREATE INDEX IF NOT EXISTS idx_user_reviews_venue_rating ON public.user_reviews(venue_rating);
CREATE INDEX IF NOT EXISTS idx_user_reviews_location_rating ON public.user_reviews(location_rating);
CREATE INDEX IF NOT EXISTS idx_user_reviews_value_rating ON public.user_reviews(value_rating);

-- 8. Update validation trigger to require/average the five new categories
CREATE OR REPLACE FUNCTION public.validate_and_calculate_overall_rating()
RETURNS TRIGGER AS $$
DECLARE
  category_sum DECIMAL(4,2) := 0;
  category_count INTEGER := 0;
BEGIN
  IF NEW.artist_performance_rating IS NOT NULL THEN
    category_sum := category_sum + NEW.artist_performance_rating;
    category_count := category_count + 1;
  END IF;

  IF NEW.production_rating IS NOT NULL THEN
    category_sum := category_sum + NEW.production_rating;
    category_count := category_count + 1;
  END IF;

  IF NEW.venue_rating IS NOT NULL THEN
    category_sum := category_sum + NEW.venue_rating;
    category_count := category_count + 1;
  END IF;

  IF NEW.location_rating IS NOT NULL THEN
    category_sum := category_sum + NEW.location_rating;
    category_count := category_count + 1;
  END IF;

  IF NEW.value_rating IS NOT NULL THEN
    category_sum := category_sum + NEW.value_rating;
    category_count := category_count + 1;
  END IF;

  -- Require all five categories for newly inserted reviews
  IF TG_OP = 'INSERT' AND category_count <> 5 THEN
    RAISE EXCEPTION 'All five rating categories must be provided for a review.';
  END IF;

  -- Calculate the integer overall rating when at least one category is present
  IF category_count > 0 THEN
    NEW.rating := ROUND(category_sum / category_count)::INTEGER;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_three_category_rating_trigger ON public.user_reviews;
CREATE TRIGGER validate_five_category_rating_trigger
  BEFORE INSERT OR UPDATE ON public.user_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_and_calculate_overall_rating();

-- 9. Refresh the public reviews view with the new schema
DROP VIEW IF EXISTS public.public_reviews_with_profiles;
CREATE OR REPLACE VIEW public.public_reviews_with_profiles AS
SELECT 
    ur.id,
    ur.user_id,
    ur.event_id,
    ur.venue_id,
    ur.rating,
    ur.artist_performance_rating,
    ur.production_rating,
    ur.venue_rating,
    ur.location_rating,
    ur.value_rating,
    ur.artist_performance_feedback,
    ur.production_feedback,
    ur.venue_feedback,
    ur.location_feedback,
    ur.value_feedback,
    ur.artist_performance_recommendation,
    ur.production_recommendation,
    ur.venue_recommendation,
    ur.location_recommendation,
    ur.value_recommendation,
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
    p.name AS reviewer_name,
    p.avatar_url AS reviewer_avatar,
    je.title AS event_title,
    je.artist_name,
    je.venue_name,
    je.event_date
FROM public.user_reviews ur
JOIN public.profiles p ON ur.user_id = p.user_id
LEFT JOIN public.jambase_events je ON ur.event_id = je.id
WHERE ur.is_public = true;

GRANT SELECT ON public.public_reviews_with_profiles TO authenticated;
GRANT SELECT ON public.public_reviews_with_profiles TO anon;

-- 10. Document new columns
COMMENT ON COLUMN public.user_reviews.artist_performance_rating IS 'Rating for artist/band performance (0.5-5.0)';
COMMENT ON COLUMN public.user_reviews.production_rating IS 'Rating for production quality (sound, lights, visuals) (0.5-5.0)';
COMMENT ON COLUMN public.user_reviews.venue_rating IS 'Rating for venue amenities and staff (0.5-5.0)';
COMMENT ON COLUMN public.user_reviews.location_rating IS 'Rating for location, neighborhood, and logistics (0.5-5.0)';
COMMENT ON COLUMN public.user_reviews.value_rating IS 'Rating for overall value relative to ticket price (0.5-5.0)';
COMMENT ON COLUMN public.user_reviews.ticket_price_paid IS 'Ticket price paid by the reviewer (stored privately)';
COMMENT ON COLUMN public.user_reviews.artist_performance_feedback IS 'Optional written feedback for artist performance';
COMMENT ON COLUMN public.user_reviews.production_feedback IS 'Optional written feedback for production quality';
COMMENT ON COLUMN public.user_reviews.venue_feedback IS 'Optional written feedback for the venue';
COMMENT ON COLUMN public.user_reviews.location_feedback IS 'Optional written feedback for location/logistics';
COMMENT ON COLUMN public.user_reviews.value_feedback IS 'Optional written feedback about value for money';
COMMENT ON COLUMN public.user_reviews.artist_performance_recommendation IS 'Preset recommendation label selected for artist performance';
COMMENT ON COLUMN public.user_reviews.production_recommendation IS 'Preset recommendation label selected for production quality';
COMMENT ON COLUMN public.user_reviews.venue_recommendation IS 'Preset recommendation label selected for the venue';
COMMENT ON COLUMN public.user_reviews.location_recommendation IS 'Preset recommendation label selected for location/logistics';
COMMENT ON COLUMN public.user_reviews.value_recommendation IS 'Preset recommendation label selected for value vs. price';

COMMIT;


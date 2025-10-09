-- Fix draft system creating 1-star placeholder reviews
-- The issue: save_review_draft function creates records with rating: 1
-- If these get converted to published reviews, they become visible 1-star reviews

-- First, let's see what draft records exist with rating = 1
SELECT 
  COUNT(*) as total_drafts,
  COUNT(CASE WHEN is_draft = true THEN 1 END) as actual_drafts,
  COUNT(CASE WHEN is_draft = false AND rating = 1 THEN 1 END) as published_1_star,
  COUNT(CASE WHEN is_draft = false AND rating = 1 AND review_text IS NULL THEN 1 END) as empty_1_star
FROM user_reviews 
WHERE rating = 1;

-- Fix the save_review_draft function to use NULL rating for drafts
-- This prevents placeholder ratings from becoming visible reviews
CREATE OR REPLACE FUNCTION public.save_review_draft(
  p_user_id UUID,
  p_event_id UUID,
  p_draft_data JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  draft_id UUID;
BEGIN
  -- Try to find existing draft
  SELECT id INTO draft_id
  FROM user_reviews
  WHERE user_id = p_user_id 
    AND event_id = p_event_id 
    AND is_draft = true;
  
  IF draft_id IS NOT NULL THEN
    -- Update existing draft
    UPDATE user_reviews
    SET 
      draft_data = p_draft_data,
      last_saved_at = now(),
      updated_at = now()
    WHERE id = draft_id;
  ELSE
    -- Create new draft (private by default)
    INSERT INTO user_reviews (
      user_id,
      event_id,
      is_draft,
      draft_data,
      last_saved_at,
      rating, -- Use NULL for drafts to prevent placeholder ratings
      is_public, -- Keep drafts private
      created_at,
      updated_at
    ) VALUES (
      p_user_id,
      p_event_id,
      true,
      p_draft_data,
      now(),
      NULL, -- NULL rating for drafts - prevents placeholder 1-star reviews
      false, -- Drafts are private
      now(),
      now()
    ) RETURNING id INTO draft_id;
  END IF;
  
  RETURN draft_id;
END;
$$;

-- Create a trigger to ensure drafts never have visible ratings
CREATE OR REPLACE FUNCTION public.ensure_draft_no_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If this is a draft, ensure it has no visible rating
  IF NEW.is_draft = true THEN
    NEW.rating = NULL;
    NEW.performance_rating = NULL;
    NEW.venue_rating_new = NULL;
    NEW.overall_experience_rating = NULL;
    NEW.is_public = false;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to enforce draft rules
DROP TRIGGER IF EXISTS ensure_draft_no_rating_trigger ON public.user_reviews;
CREATE TRIGGER ensure_draft_no_rating_trigger
  BEFORE INSERT OR UPDATE ON public.user_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_draft_no_rating();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.ensure_draft_no_rating() TO authenticated;

-- Clean up any existing draft records that have rating = 1
-- These could become visible if is_draft gets set to false
UPDATE user_reviews 
SET 
  rating = NULL,
  performance_rating = NULL,
  venue_rating_new = NULL,
  overall_experience_rating = NULL
WHERE is_draft = true 
  AND rating = 1;

-- Add comments to document the fix
COMMENT ON FUNCTION public.save_review_draft() IS 'Saves draft reviews with NULL rating to prevent placeholder 1-star reviews from becoming visible';
COMMENT ON FUNCTION public.ensure_draft_no_rating() IS 'Ensures draft records never have visible ratings that could become published reviews';

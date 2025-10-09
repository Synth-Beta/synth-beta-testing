-- Add draft support to user_reviews table
-- This migration adds draft functionality for auto-saving incomplete reviews
-- Works with the current user_reviews table structure that has been modified by previous migrations

-- Add draft-related columns to user_reviews table
ALTER TABLE user_reviews 
ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS draft_data JSONB,
ADD COLUMN IF NOT EXISTS last_saved_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Set default is_public to false for drafts (they're private until published)
-- This ensures drafts are never visible to other users

-- Add indexes for draft functionality
CREATE INDEX IF NOT EXISTS idx_user_reviews_is_draft ON user_reviews(is_draft);
CREATE INDEX IF NOT EXISTS idx_user_reviews_draft_data ON user_reviews USING GIN(draft_data);
CREATE INDEX IF NOT EXISTS idx_user_reviews_last_saved_at ON user_reviews(last_saved_at DESC);

-- Add comments for new columns
COMMENT ON COLUMN user_reviews.is_draft IS 'Whether this review is a draft (incomplete) or published (complete)';
COMMENT ON COLUMN user_reviews.draft_data IS 'JSONB storage for incomplete form data (artist, venue, ratings, etc.)';
COMMENT ON COLUMN user_reviews.last_saved_at IS 'Timestamp of last auto-save for draft reviews';

-- Update the unique constraint to allow multiple drafts per user (but only one published review per event)
-- First drop the existing constraint, then create the new conditional unique index
ALTER TABLE user_reviews DROP CONSTRAINT IF EXISTS user_reviews_user_id_event_id_key;
CREATE UNIQUE INDEX user_reviews_published_unique ON user_reviews(user_id, event_id) 
WHERE is_draft = false;

-- Create function to auto-save draft reviews
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
      rating, -- NULL for drafts
      is_public, -- Keep drafts private
      created_at,
      updated_at
    ) VALUES (
      p_user_id,
      p_event_id,
      true,
      p_draft_data,
      now(),
      NULL, -- No rating for drafts
      false, -- Drafts are private
      now(),
      now()
    ) RETURNING id INTO draft_id;
  END IF;
  
  RETURN draft_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.save_review_draft TO authenticated;

-- Create function to publish draft review
CREATE OR REPLACE FUNCTION public.publish_review_draft(
  p_draft_id UUID,
  p_final_data JSONB,
  p_is_public BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  final_id UUID;
BEGIN
  -- Update the draft to published status with final data
  UPDATE user_reviews
  SET 
    is_draft = false,
    draft_data = NULL,
    -- Handle the three separate rating columns
    performance_rating = COALESCE((p_final_data->>'performanceRating')::DECIMAL(2,1), 1.0),
    venue_rating_new = COALESCE((p_final_data->>'venueRating')::DECIMAL(2,1), 1.0),
    overall_experience_rating = COALESCE((p_final_data->>'overallExperienceRating')::DECIMAL(2,1), 1.0),
    -- Calculate overall rating from the three categories
    rating = ROUND((
      COALESCE((p_final_data->>'performanceRating')::DECIMAL(2,1), 1.0) +
      COALESCE((p_final_data->>'venueRating')::DECIMAL(2,1), 1.0) +
      COALESCE((p_final_data->>'overallExperienceRating')::DECIMAL(2,1), 1.0)
    ) / 3.0)::INTEGER,
    -- Handle review text (could be in different fields)
    review_text = COALESCE(
      p_final_data->>'reviewText',
      p_final_data->>'performanceReviewText',
      p_final_data->>'venueReviewText',
      p_final_data->>'overallExperienceReviewText'
    ),
    performance_review_text = p_final_data->>'performanceReviewText',
    venue_review_text = p_final_data->>'venueReviewText',
    overall_experience_review_text = p_final_data->>'overallExperienceReviewText',
    reaction_emoji = p_final_data->>'reactionEmoji',
    photos = CASE 
      WHEN p_final_data->'photos' IS NOT NULL 
      THEN ARRAY(SELECT jsonb_array_elements_text(p_final_data->'photos'))
      ELSE NULL 
    END,
    videos = CASE 
      WHEN p_final_data->'videos' IS NOT NULL 
      THEN ARRAY(SELECT jsonb_array_elements_text(p_final_data->'videos'))
      ELSE NULL 
    END,
    mood_tags = CASE 
      WHEN p_final_data->'moodTags' IS NOT NULL 
      THEN ARRAY(SELECT jsonb_array_elements_text(p_final_data->'moodTags'))
      ELSE NULL 
    END,
    genre_tags = CASE 
      WHEN p_final_data->'genreTags' IS NOT NULL 
      THEN ARRAY(SELECT jsonb_array_elements_text(p_final_data->'genreTags'))
      ELSE NULL 
    END,
    context_tags = CASE 
      WHEN p_final_data->'contextTags' IS NOT NULL 
      THEN ARRAY(SELECT jsonb_array_elements_text(p_final_data->'contextTags'))
      ELSE NULL 
    END,
    -- Handle setlist data
    setlist = p_final_data->'selectedSetlist',
    custom_setlist = p_final_data->'customSetlist',
    is_public = p_is_public, -- Set public status when publishing
    updated_at = now()
  WHERE id = p_draft_id AND is_draft = true
  RETURNING id INTO final_id;
  
  RETURN final_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.publish_review_draft TO authenticated;

-- Create function to get user's draft reviews
CREATE OR REPLACE FUNCTION public.get_user_draft_reviews(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  event_id UUID,
  draft_data JSONB,
  last_saved_at TIMESTAMP WITH TIME ZONE,
  event_title TEXT,
  artist_name TEXT,
  venue_name TEXT,
  event_date TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ur.id,
    ur.event_id,
    ur.draft_data,
    ur.last_saved_at,
    je.title as event_title,
    je.artist_name,
    je.venue_name,
    je.event_date
  FROM user_reviews ur
  JOIN public.jambase_events je ON ur.event_id = je.id
  WHERE ur.user_id = p_user_id 
    AND ur.is_draft = true
  ORDER BY ur.last_saved_at DESC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_draft_reviews TO authenticated;

-- Create function to delete draft review
CREATE OR REPLACE FUNCTION public.delete_review_draft(p_draft_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM user_reviews
  WHERE id = p_draft_id 
    AND user_id = p_user_id 
    AND is_draft = true;
  
  RETURN FOUND;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.delete_review_draft TO authenticated;

-- Update RLS policies to handle drafts
-- Users can view their own drafts
CREATE POLICY "Users can view their own draft reviews" 
ON user_reviews 
FOR SELECT 
USING (auth.uid() = user_id AND is_draft = true);

-- Users can update their own drafts
CREATE POLICY "Users can update their own draft reviews" 
ON user_reviews 
FOR UPDATE 
USING (auth.uid() = user_id AND is_draft = true);

-- Users can delete their own drafts
CREATE POLICY "Users can delete their own draft reviews" 
ON user_reviews 
FOR DELETE 
USING (auth.uid() = user_id AND is_draft = true);

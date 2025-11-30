-- Fix draft review functions to use correct table names
-- The functions were referencing user_reviews and jambase_events which don't exist
-- They should use reviews and events tables instead

-- ============================================================
-- 0. Ensure reviews table has draft columns
-- ============================================================

-- Add draft-related columns to reviews table if they don't exist
ALTER TABLE public.reviews 
ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS draft_data JSONB,
ADD COLUMN IF NOT EXISTS last_saved_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create indexes for draft functionality if they don't exist
CREATE INDEX IF NOT EXISTS idx_reviews_is_draft ON public.reviews(is_draft);
CREATE INDEX IF NOT EXISTS idx_reviews_draft_data ON public.reviews USING GIN(draft_data);
CREATE INDEX IF NOT EXISTS idx_reviews_last_saved_at ON public.reviews(last_saved_at DESC);

-- ============================================================
-- 1. Fix get_user_draft_reviews function
-- ============================================================

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
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.event_id,
    r.draft_data,
    r.last_saved_at,
    COALESCE(
      r.draft_data->>'eventTitle',
      e.title
    ) as event_title,
    COALESCE(
      r.draft_data->'selectedArtist'->>'name',
      e.artist_name
    ) as artist_name,
    COALESCE(
      r.draft_data->'selectedVenue'->>'name',
      e.venue_name
    ) as venue_name,
    -- Prefer eventDate from draft_data, fallback to event's event_date
    COALESCE(
      CASE 
        WHEN r.draft_data->>'eventDate' IS NOT NULL 
        THEN (r.draft_data->>'eventDate' || 'T20:00:00Z')::TIMESTAMP WITH TIME ZONE
        ELSE NULL
      END,
      e.event_date
    ) as event_date
  FROM public.reviews r
  LEFT JOIN public.events e ON r.event_id = e.id
  WHERE r.user_id = p_user_id 
    AND r.is_draft = true
  ORDER BY r.last_saved_at DESC;
END;
$$;

-- ============================================================
-- 2. Fix save_review_draft function
-- ============================================================

CREATE OR REPLACE FUNCTION public.save_review_draft(
  p_user_id UUID,
  p_event_id UUID,
  p_draft_data JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  draft_id UUID;
BEGIN
  -- Try to find existing draft
  SELECT id INTO draft_id
  FROM public.reviews
  WHERE user_id = p_user_id 
    AND event_id = p_event_id
    AND is_draft = true;
  
  IF draft_id IS NOT NULL THEN
    -- Update existing draft
    UPDATE public.reviews
    SET 
      draft_data = p_draft_data,
      last_saved_at = now(),
      updated_at = now()
    WHERE id = draft_id;
  ELSE
    -- Create new draft (private by default)
    INSERT INTO public.reviews (
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

-- ============================================================
-- 3. Fix publish_review_draft function
-- ============================================================

CREATE OR REPLACE FUNCTION public.publish_review_draft(
  p_draft_id UUID,
  p_final_data JSONB,
  p_is_public BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  final_id UUID;
BEGIN
  -- Update the draft to published status with final data
  UPDATE public.reviews
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

-- ============================================================
-- 4. Fix delete_review_draft function
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_review_draft(p_draft_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.reviews
  WHERE id = p_draft_id 
    AND user_id = p_user_id 
    AND is_draft = true;
  
  RETURN FOUND;
END;
$$;

-- ============================================================
-- Grant permissions
-- ============================================================

GRANT EXECUTE ON FUNCTION public.get_user_draft_reviews(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_review_draft(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_review_draft(UUID, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_review_draft(UUID, UUID) TO authenticated;

-- ============================================================
-- Add comments
-- ============================================================

COMMENT ON FUNCTION public.get_user_draft_reviews(UUID) IS 'Returns user draft reviews with event information';
COMMENT ON FUNCTION public.save_review_draft(UUID, UUID, JSONB) IS 'Saves or updates a draft review';
COMMENT ON FUNCTION public.publish_review_draft(UUID, JSONB, BOOLEAN) IS 'Publishes a draft review with final data';
COMMENT ON FUNCTION public.delete_review_draft(UUID, UUID) IS 'Deletes a draft review';


-- Prevent creating/updating drafts when a published review already exists
-- This fixes the bug where drafts keep appearing in "Unreviewed" after review submission

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
  published_review_id UUID;
BEGIN
  -- CRITICAL: Check if a published review already exists for this event
  -- If it does, don't create or update drafts - the review is already complete
  SELECT id INTO published_review_id
  FROM public.reviews
  WHERE user_id = p_user_id 
    AND event_id = p_event_id
    AND is_draft = false;
  
  IF published_review_id IS NOT NULL THEN
    -- Published review exists - don't create/update drafts
    -- Return NULL to indicate draft save was blocked
    RETURN NULL;
  END IF;
  
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.save_review_draft(UUID, UUID, JSONB) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.save_review_draft(UUID, UUID, JSONB) IS 'Saves or updates a draft review, but blocks draft creation if a published review already exists';


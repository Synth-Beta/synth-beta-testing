-- ============================================
-- Fix update_review_counts trigger function
-- ============================================
-- This migration fixes the update_review_counts() function to prevent
-- errors when accessing engagement_type field that doesn't exist on
-- the comments table.
--
-- Issue: The function was checking TG_TABLE_NAME in the same IF condition
-- as accessing NEW.engagement_type, which caused PostgreSQL to validate
-- the field even when triggered from the comments table.
--
-- Solution: Restructure to use nested IF statements so engagement_type
-- is only accessed when we're sure we're dealing with the engagements table.

CREATE OR REPLACE FUNCTION public.update_review_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Handle engagements table
    IF TG_TABLE_NAME = 'engagements' THEN
      IF NEW.entity_type = 'review' AND NEW.engagement_type = 'like' THEN
        UPDATE public.reviews 
        SET likes_count = COALESCE(likes_count, 0) + 1 
        WHERE id = NEW.entity_id;
      ELSIF NEW.entity_type = 'review' AND NEW.engagement_type = 'share' THEN
        UPDATE public.reviews 
        SET shares_count = COALESCE(shares_count, 0) + 1 
        WHERE id = NEW.entity_id;
      END IF;
    -- Handle comments table
    ELSIF TG_TABLE_NAME = 'comments' THEN
      IF NEW.entity_type = 'review' THEN
        UPDATE public.reviews 
        SET comments_count = COALESCE(comments_count, 0) + 1 
        WHERE id = NEW.entity_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Handle engagements table
    IF TG_TABLE_NAME = 'engagements' THEN
      IF OLD.entity_type = 'review' AND OLD.engagement_type = 'like' THEN
        UPDATE public.reviews 
        SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) 
        WHERE id = OLD.entity_id;
      ELSIF OLD.entity_type = 'review' AND OLD.engagement_type = 'share' THEN
        UPDATE public.reviews 
        SET shares_count = GREATEST(COALESCE(shares_count, 0) - 1, 0) 
        WHERE id = OLD.entity_id;
      END IF;
    -- Handle comments table
    ELSIF TG_TABLE_NAME = 'comments' THEN
      IF OLD.entity_type = 'review' THEN
        UPDATE public.reviews 
        SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) 
        WHERE id = OLD.entity_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- Add comment to document the fix
COMMENT ON FUNCTION public.update_review_counts() IS 
  'Updates review engagement counts (likes, comments, shares). Fixed to prevent engagement_type field access errors when triggered from comments table.';


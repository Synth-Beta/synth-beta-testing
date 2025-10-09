-- Fix ATTENDANCE_ONLY records that are incorrectly marked as public
-- These records should be private and not appear in public feeds

-- First, let's see what we're dealing with
SELECT 
  COUNT(*) as total_attendance_only,
  COUNT(CASE WHEN is_public = true THEN 1 END) as public_attendance_only,
  COUNT(CASE WHEN is_public = false THEN 1 END) as private_attendance_only
FROM user_reviews 
WHERE review_text = 'ATTENDANCE_ONLY';

-- Fix any ATTENDANCE_ONLY records that are incorrectly marked as public
UPDATE user_reviews 
SET 
  is_public = false,
  updated_at = now()
WHERE review_text = 'ATTENDANCE_ONLY' 
  AND is_public = true;

-- Verify the fix
SELECT 
  COUNT(*) as total_attendance_only,
  COUNT(CASE WHEN is_public = true THEN 1 END) as public_attendance_only,
  COUNT(CASE WHEN is_public = false THEN 1 END) as private_attendance_only
FROM user_reviews 
WHERE review_text = 'ATTENDANCE_ONLY';

-- Add a comment to document this fix
COMMENT ON COLUMN user_reviews.review_text IS 'Review content. Special value "ATTENDANCE_ONLY" indicates attendance tracking without a review. These records should always have is_public = false.';

-- Create a function to ensure ATTENDANCE_ONLY records are always private
CREATE OR REPLACE FUNCTION public.ensure_attendance_only_private()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If this is an ATTENDANCE_ONLY record, force it to be private
  IF NEW.review_text = 'ATTENDANCE_ONLY' THEN
    NEW.is_public = false;
    NEW.is_draft = false;
    NEW.draft_data = null;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to enforce ATTENDANCE_ONLY records are always private
DROP TRIGGER IF EXISTS ensure_attendance_only_private_trigger ON public.user_reviews;
CREATE TRIGGER ensure_attendance_only_private_trigger
  BEFORE INSERT OR UPDATE ON public.user_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_attendance_only_private();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.ensure_attendance_only_private() TO authenticated;

-- Add comment to document the trigger
COMMENT ON FUNCTION public.ensure_attendance_only_private() IS 'Ensures ATTENDANCE_ONLY records are always marked as private (is_public = false) and not drafts';

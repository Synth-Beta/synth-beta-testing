-- ============================================
-- MIGRATION: Add Unfriend Function for 3NF Schema
-- ============================================
-- This migration creates an unfriend function for user_relationships table
-- and cleans up duplicate friend relationships
-- ============================================

-- ============================================
-- PHASE 1: CREATE UNFRIEND FUNCTION
-- ============================================

-- Drop old unfriend function if it exists (uses friends table)
DROP FUNCTION IF EXISTS public.unfriend_user(uuid) CASCADE;

-- Create new unfriend function for user_relationships table
CREATE OR REPLACE FUNCTION public.unfriend_user(friend_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  -- Get the current user ID (from auth.users)
  current_user_id := auth.uid();
  
  -- Check if the current user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to unfriend someone';
  END IF;
  
  -- Delete friendship relationship in both directions
  -- This handles cases where the friendship might only exist in one direction
  DELETE FROM public.user_relationships
  WHERE relationship_type = 'friend'
    AND (
      (user_id = current_user_id AND related_user_id = friend_user_id)
      OR (user_id = friend_user_id AND related_user_id = current_user_id)
    );
  
  -- Silently return success (even if nothing was deleted)
  -- This prevents errors when trying to unfriend someone who isn't a friend
  -- or when friendship was already removed
  RETURN;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.unfriend_user(uuid) TO authenticated;

-- ============================================
-- PHASE 2: CLEAN UP DUPLICATE FRIEND RELATIONSHIPS
-- ============================================

-- Remove duplicate friendships (keep only one direction)
-- This ensures that if both users have a friend record, we keep only one
DO $$
DECLARE
  duplicate_count integer;
BEGIN
  -- Count duplicates (friendships that exist in both directions)
  SELECT COUNT(*) INTO duplicate_count
  FROM public.user_relationships ur1
  WHERE ur1.relationship_type = 'friend'
    AND ur1.status = 'accepted'
    AND EXISTS (
      SELECT 1 FROM public.user_relationships ur2
      WHERE ur2.relationship_type = 'friend'
        AND ur2.status = 'accepted'
        AND ur2.user_id = ur1.related_user_id
        AND ur2.related_user_id = ur1.user_id
        AND ur2.id != ur1.id  -- Different record
    );
  
  RAISE NOTICE 'Found % duplicate friend relationships to clean up', duplicate_count;
  
  -- Delete duplicate relationships (keep the one with the earlier created_at or lower ID)
  DELETE FROM public.user_relationships ur1
  WHERE ur1.relationship_type = 'friend'
    AND ur1.status = 'accepted'
    AND EXISTS (
      SELECT 1 FROM public.user_relationships ur2
      WHERE ur2.relationship_type = 'friend'
        AND ur2.status = 'accepted'
        AND ur2.user_id = ur1.related_user_id
        AND ur2.related_user_id = ur1.user_id
        AND ur2.id != ur1.id
        AND (
          ur2.created_at < ur1.created_at 
          OR (ur2.created_at = ur1.created_at AND ur2.id < ur1.id)
        )
    );
  
  RAISE NOTICE 'Cleaned up duplicate friend relationships';
END $$;

-- ============================================
-- PHASE 3: ADD UNIQUE CONSTRAINT TO PREVENT FUTURE DUPLICATES
-- ============================================

-- Create a unique index to prevent duplicate friendships (both directions)
-- This ensures that only one friendship record exists between two users
CREATE UNIQUE INDEX IF NOT EXISTS unique_friendship_bidirectional
ON public.user_relationships (
  LEAST(user_id, related_user_id),
  GREATEST(user_id, related_user_id),
  relationship_type
)
WHERE relationship_type = 'friend' AND status = 'accepted';

-- ============================================
-- SUMMARY
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Unfriend Function and Cleanup Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Created unfriend_user function for user_relationships';
  RAISE NOTICE '✅ Cleaned up duplicate friend relationships';
  RAISE NOTICE '✅ Added unique constraint to prevent future duplicates';
  RAISE NOTICE '========================================';
END $$;


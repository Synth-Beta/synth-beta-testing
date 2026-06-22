-- ============================================
-- Allow profile viewers to read accepted friendships
-- ============================================
-- Existing "follow" visibility policy already permits viewing users that others follow.
-- This migration adds a tight SELECT policy so any authenticated user can read rows
-- where the relationship_type is 'friend' and the status is 'accepted' without
-- widening access to other relationship types or statuses.

DROP POLICY IF EXISTS "Allow view friend relationships for profile" ON public.user_relationships;
CREATE POLICY "Allow view friend relationships for profile"
  ON public.user_relationships
  FOR SELECT
  TO authenticated
  USING (
    relationship_type = 'friend'
    AND status = 'accepted'
  );

-- Rollback
DROP POLICY IF EXISTS "Allow view friend relationships for profile" ON public.user_relationships;

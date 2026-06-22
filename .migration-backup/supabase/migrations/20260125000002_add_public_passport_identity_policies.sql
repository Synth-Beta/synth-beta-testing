-- ============================================
-- ADD PUBLIC PASSPORT IDENTITY POLICIES
-- ============================================
-- This migration adds RLS policies to allow:
-- 1. Anyone to view public users' passport identities
-- 2. Friends to view private users' passport identities
-- ============================================

BEGIN;

-- Drop existing policy if it exists (we'll recreate it)
DROP POLICY IF EXISTS "Users can view their own passport identity" ON public.passport_identity;

-- Recreate the policy for viewing own identity
CREATE POLICY "Users can view their own passport identity"
  ON public.passport_identity
  FOR SELECT
  USING (auth.uid() = user_id);

-- Add policy: Anyone can view public users' passport identities
-- Note: This works for both authenticated and anonymous users
-- Treats NULL is_public_profile as public (default behavior)
CREATE POLICY "Users can view public passport identities"
  ON public.passport_identity
  FOR SELECT
  USING (
    -- User doesn't exist in users table (legacy/edge case - allow viewing)
    NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = passport_identity.user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = passport_identity.user_id
      AND (users.is_public_profile = true OR users.is_public_profile IS NULL)
    )
  );

-- Add policy: Friends can view private users' passport identities
-- Friends are stored in user_relationships with relationship_type='friend' and status='accepted'
-- The relationship is bidirectional, so we check both directions
CREATE POLICY "Friends can view private passport identities"
  ON public.passport_identity
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = passport_identity.user_id
      AND users.is_public_profile = false
      AND EXISTS (
        SELECT 1 FROM public.user_relationships
        WHERE relationship_type = 'friend'
        AND status = 'accepted'
        AND (
          (user_id = auth.uid() AND related_user_id = passport_identity.user_id)
          OR
          (user_id = passport_identity.user_id AND related_user_id = auth.uid())
        )
      )
    )
  );

-- Add comments
COMMENT ON POLICY "Users can view their own passport identity" ON public.passport_identity IS 
'Allows users to view their own passport identity';

COMMENT ON POLICY "Users can view public passport identities" ON public.passport_identity IS 
'Allows anyone to view passport identities of users with public profiles';

COMMENT ON POLICY "Friends can view private passport identities" ON public.passport_identity IS 
'Allows friends to view passport identities of users with private profiles (bidirectional friendship check)';

-- Grant SELECT permissions to anon role (for public profiles)
-- authenticated role already has permissions from original migration
GRANT SELECT ON public.passport_identity TO anon;

COMMIT;

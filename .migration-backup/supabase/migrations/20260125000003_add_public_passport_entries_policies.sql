-- ============================================
-- ADD PUBLIC PASSPORT ENTRIES POLICIES
-- ============================================
-- This migration adds RLS policies to allow:
-- 1. Anyone to view public users' passport entries (stamps)
-- 2. Friends to view private users' passport entries
-- ============================================

BEGIN;

-- Add policy: Anyone can view public users' passport entries
-- Note: This works for both authenticated and anonymous users
-- Treats NULL is_public_profile as public (default behavior)
CREATE POLICY "Users can view public passport entries"
  ON public.passport_entries
  FOR SELECT
  USING (
    -- User doesn't exist in users table (legacy/edge case - allow viewing)
    NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = passport_entries.user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = passport_entries.user_id
      AND (users.is_public_profile = true OR users.is_public_profile IS NULL)
    )
  );

-- Add policy: Friends can view private users' passport entries
-- Friends are stored in user_relationships with relationship_type='friend' and status='accepted'
-- The relationship is bidirectional, so we check both directions
CREATE POLICY "Friends can view private passport entries"
  ON public.passport_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = passport_entries.user_id
      AND users.is_public_profile = false
      AND EXISTS (
        SELECT 1 FROM public.user_relationships
        WHERE relationship_type = 'friend'
        AND status = 'accepted'
        AND (
          (user_id = auth.uid() AND related_user_id = passport_entries.user_id)
          OR
          (user_id = passport_entries.user_id AND related_user_id = auth.uid())
        )
      )
    )
  );

-- Add comments
COMMENT ON POLICY "Users can view public passport entries" ON public.passport_entries IS 
  'Allows anyone to view passport entries (stamps) for users with public profiles';

COMMENT ON POLICY "Friends can view private passport entries" ON public.passport_entries IS 
  'Allows friends to view passport entries (stamps) for users with private profiles';

COMMIT;

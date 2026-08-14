-- Fix reviews_select RLS policy: private reviews are currently world-readable.
--
-- The policy consolidated in supabase/perf-review-2026-07-12/02_consolidate_rls_policies.sql
-- OR's together:
--   (is_public = true) OR (is_draft = false OR is_draft IS NULL) OR (self) OR (admin)
-- Since almost every published review has is_draft = false, the second clause alone
-- makes EVERY published review readable by anyone (including anon), regardless of
-- is_public. `is_public` currently has no enforcement power at the database level -
-- it only "works" because app code happens to add .eq('is_public', true) by
-- convention, which is not a real security boundary (any direct API call bypasses it).
--
-- New intended visibility model for a review:
--   - Always visible to its author (draft or published, public or private).
--   - Always visible to admins.
--   - Visible to everyone else ONLY if: is_draft = false AND (is_public = true OR
--     the viewer is a direct, accepted friend of the author).
--     Friends-of-friends do NOT get private-review access - only direct friends.
--
-- Run this in the Supabase SQL editor. Read-only reviews unaffected; this only
-- changes SELECT visibility, not who can write.

-- Defensive: make sure the friend-lookup in the new policy is index-backed.
-- (user_relationships is queried this way throughout the app already - these
-- are likely redundant with existing indexes, but IF NOT EXISTS makes that safe.)
CREATE INDEX IF NOT EXISTS user_relationships_user_id_type_status_idx
  ON public.user_relationships (user_id, relationship_type, status);
CREATE INDEX IF NOT EXISTS user_relationships_related_user_id_type_status_idx
  ON public.user_relationships (related_user_id, relationship_type, status);

DROP POLICY IF EXISTS "reviews_select" ON public.reviews;
CREATE POLICY "reviews_select" ON public.reviews
  FOR SELECT TO public
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = (SELECT auth.uid()) AND u.account_type = 'admin'::account_type
    )
    OR (
      (is_draft = false OR is_draft IS NULL)
      AND (
        is_public = true
        OR EXISTS (
          SELECT 1 FROM public.user_relationships ur
          WHERE ur.relationship_type = 'friend'
            AND ur.status = 'accepted'
            AND (
              (ur.user_id = (SELECT auth.uid()) AND ur.related_user_id = reviews.user_id)
              OR (ur.related_user_id = (SELECT auth.uid()) AND ur.user_id = reviews.user_id)
            )
        )
      )
    )
  );

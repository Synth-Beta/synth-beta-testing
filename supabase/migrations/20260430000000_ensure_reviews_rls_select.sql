-- Idempotent reviews RLS guard.
-- Prior migrations (20260427020000, 20260428000000) set these policies but may not
-- have been applied to all environments. This migration re-runs them safely.

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Drop and recreate to guarantee they exist with the correct USING clause.
DROP POLICY IF EXISTS "Published reviews are viewable by everyone" ON public.reviews;
DROP POLICY IF EXISTS "Users can view own draft reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can insert their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can update their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can delete their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.reviews;
DROP POLICY IF EXISTS "Authenticated users can read reviews" ON public.reviews;

-- Non-draft reviews are readable by everyone (anon + authenticated)
CREATE POLICY "Published reviews are viewable by everyone"
ON public.reviews
FOR SELECT
USING (is_draft = false OR is_draft IS NULL);

-- Owners can always read their own reviews (including drafts)
CREATE POLICY "Users can view own draft reviews"
ON public.reviews
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own reviews"
ON public.reviews
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own reviews"
ON public.reviews
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own reviews"
ON public.reviews
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

GRANT SELECT ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;

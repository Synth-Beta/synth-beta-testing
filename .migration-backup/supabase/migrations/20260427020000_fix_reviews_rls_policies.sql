-- Fix reviews table RLS policies
-- Root cause: reviews table has RLS enabled but NO SELECT policies,
-- so all reads return 0 rows (PostgREST treats missing policy as deny).
-- This causes "review link not valid" on mobile and stuck "Loading review..."
-- on web, because queries return nothing regardless of auth state.

BEGIN;

-- Ensure RLS is enabled on reviews
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Drop any stale policies first to avoid conflicts
DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.reviews;
DROP POLICY IF EXISTS "Published reviews are viewable by everyone" ON public.reviews;
DROP POLICY IF EXISTS "Users can view own draft reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can insert their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can update their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can delete their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Authenticated users can read reviews" ON public.reviews;

-- Published reviews are readable by everyone (authenticated + anon)
CREATE POLICY "Published reviews are viewable by everyone"
ON public.reviews
FOR SELECT
USING (is_draft = false OR is_draft IS NULL);

-- Users can also see their own draft reviews
CREATE POLICY "Users can view own draft reviews"
ON public.reviews
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can create their own reviews
CREATE POLICY "Users can insert their own reviews"
ON public.reviews
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own reviews
CREATE POLICY "Users can update their own reviews"
ON public.reviews
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can delete their own reviews
CREATE POLICY "Users can delete their own reviews"
ON public.reviews
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Ensure grants
GRANT SELECT ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;

COMMIT;

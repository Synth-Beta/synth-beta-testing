-- Fix RLS for recommendations cache
-- SECURITY DEFINER functions should bypass RLS, but if they don't,
-- we need to ensure the function can read the cache table

-- Drop and recreate the policy to ensure it works with SECURITY DEFINER functions
DROP POLICY IF EXISTS "Users can view their own recommendations" ON public.user_recommendations_cache;

-- Create a policy that works with both direct queries and SECURITY DEFINER functions
-- SECURITY DEFINER functions bypass RLS, but this policy ensures direct queries work
CREATE POLICY "Users can view their own recommendations"
  ON public.user_recommendations_cache
  FOR SELECT
  USING (auth.uid() = user_id);

-- Verify the function can read from the cache
-- This should return rows if the function works correctly
-- Run this with your user ID to test:
-- SELECT * FROM public.get_user_recommendations('YOUR_USER_ID_HERE'::uuid, 10);


-- ============================================================
-- FIX USER_SCENE_PROGRESS RLS POLICIES
-- This migration fixes the 406 errors by ensuring proper RLS policies
-- ============================================================

-- Drop all existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Users can view their own scene progress" ON public.user_scene_progress;
DROP POLICY IF EXISTS "Users can insert their own scene progress" ON public.user_scene_progress;
DROP POLICY IF EXISTS "Users can update their own scene progress" ON public.user_scene_progress;
DROP POLICY IF EXISTS "Users can delete their own scene progress" ON public.user_scene_progress;

-- Ensure RLS is enabled
ALTER TABLE public.user_scene_progress ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: Users can view their own progress
-- Allow users to read their own progress records
-- Also allow service_role for function execution
CREATE POLICY "Users can view their own scene progress"
  ON public.user_scene_progress
  FOR SELECT
  TO authenticated, service_role
  USING (
    -- Allow if user is authenticated and matches user_id
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    -- OR allow service_role (for functions)
    OR (auth.role() = 'service_role')
  );

-- Alternative: More permissive policy for debugging (if above doesn't work)
-- This allows any authenticated user to read, but should be restricted later
-- Uncomment only if the above policy still doesn't work:
-- DROP POLICY IF EXISTS "Users can view their own scene progress" ON public.user_scene_progress;
-- CREATE POLICY "Authenticated users can view scene progress"
--   ON public.user_scene_progress
--   FOR SELECT
--   TO authenticated
--   USING (auth.role() = 'authenticated');

-- INSERT Policy: Users can insert their own progress
-- Allow users to create progress records for themselves
CREATE POLICY "Users can insert their own scene progress"
  ON public.user_scene_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND auth.uid() = user_id
  );

-- UPDATE Policy: Users can update their own progress
-- Allow users to update their own progress records
CREATE POLICY "Users can update their own scene progress"
  ON public.user_scene_progress
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND auth.uid() = user_id
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND auth.uid() = user_id
  );

-- DELETE Policy: Users can delete their own progress (optional, for cleanup)
CREATE POLICY "Users can delete their own scene progress"
  ON public.user_scene_progress
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND auth.uid() = user_id
  );

-- ============================================================
-- GRANTS
-- ============================================================

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_scene_progress TO authenticated;

-- Grant usage on the sequence (if using serial IDs, though we're using UUIDs)
-- This is just for safety
GRANT USAGE ON SCHEMA public TO authenticated;

-- ============================================================
-- VERIFY POLICIES
-- ============================================================

-- Check that RLS is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'user_scene_progress'
    AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS is not enabled on user_scene_progress table';
  END IF;
END $$;

-- Log success
DO $$
BEGIN
  RAISE NOTICE 'Successfully fixed RLS policies for user_scene_progress table';
END $$;


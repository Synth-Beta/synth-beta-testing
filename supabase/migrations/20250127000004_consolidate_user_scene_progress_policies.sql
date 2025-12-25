-- ============================================================
-- CONSOLIDATE USER_SCENE_PROGRESS RLS POLICIES
-- This migration ensures there are no conflicting policies
-- and that authenticated users can access their own records
-- ============================================================

-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Users can view their own scene progress" ON public.user_scene_progress;
DROP POLICY IF EXISTS "Users can insert their own scene progress" ON public.user_scene_progress;
DROP POLICY IF EXISTS "Users can update their own scene progress" ON public.user_scene_progress;
DROP POLICY IF EXISTS "Users can delete their own scene progress" ON public.user_scene_progress;
DROP POLICY IF EXISTS "Authenticated users can view scene progress" ON public.user_scene_progress;
DROP POLICY IF EXISTS "Authenticated users can insert scene progress" ON public.user_scene_progress;
DROP POLICY IF EXISTS "Authenticated users can update scene progress" ON public.user_scene_progress;

-- Ensure RLS is enabled
ALTER TABLE public.user_scene_progress ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: Users can view their own progress
-- This is the primary policy - users can only see their own records
CREATE POLICY "Users can view their own scene progress"
  ON public.user_scene_progress
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND auth.uid() = user_id
  );

-- Also allow service_role for function execution
CREATE POLICY "Service role can view scene progress"
  ON public.user_scene_progress
  FOR SELECT
  TO service_role
  USING (true);

-- INSERT Policy: Users can insert their own progress
CREATE POLICY "Users can insert their own scene progress"
  ON public.user_scene_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND auth.uid() = user_id
  );

-- UPDATE Policy: Users can update their own progress
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

-- DELETE Policy: Users can delete their own progress
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

-- Grant to service_role for function execution
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_scene_progress TO service_role;

-- Grant usage on the schema
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- ============================================================
-- VERIFY SETUP
-- ============================================================

DO $$
BEGIN
  -- Check that RLS is enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'user_scene_progress'
    AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS is not enabled on user_scene_progress table';
  END IF;
  
  -- Check that we have the right number of policies (5: SELECT for authenticated, SELECT for service_role, INSERT, UPDATE, DELETE)
  IF (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'user_scene_progress' AND schemaname = 'public') < 5 THEN
    RAISE WARNING 'Expected 5 policies on user_scene_progress, but found a different number';
  END IF;
  
  RAISE NOTICE 'Successfully consolidated RLS policies for user_scene_progress table';
END $$;


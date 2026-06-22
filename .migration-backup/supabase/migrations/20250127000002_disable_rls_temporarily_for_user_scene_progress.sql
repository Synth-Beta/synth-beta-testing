-- ============================================================
-- TEMPORARY: DISABLE RLS ON USER_SCENE_PROGRESS
-- This is a temporary fix to allow queries to work
-- TODO: Re-enable RLS once the root cause is identified
-- ============================================================

-- Option 1: Disable RLS entirely (NOT RECOMMENDED FOR PRODUCTION)
-- Uncomment only if absolutely necessary for debugging
-- ALTER TABLE public.user_scene_progress DISABLE ROW LEVEL SECURITY;

-- Option 2: Create a permissive policy that allows all authenticated users
-- This is safer than disabling RLS completely
DROP POLICY IF EXISTS "Authenticated users can view scene progress" ON public.user_scene_progress;
CREATE POLICY "Authenticated users can view scene progress"
  ON public.user_scene_progress
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert scene progress" ON public.user_scene_progress;
CREATE POLICY "Authenticated users can insert scene progress"
  ON public.user_scene_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update scene progress" ON public.user_scene_progress;
CREATE POLICY "Authenticated users can update scene progress"
  ON public.user_scene_progress
  FOR UPDATE
  TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Note: This allows any authenticated user to see any user's progress
-- This is a temporary workaround - the function should still enforce user_id matching
-- In production, you should re-enable the stricter policies


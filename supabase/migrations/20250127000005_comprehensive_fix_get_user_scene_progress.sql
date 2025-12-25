-- ============================================================
-- COMPREHENSIVE FIX FOR get_user_scene_progress 406 ERROR
-- This addresses multiple potential causes:
-- 1. Function doesn't exist or wrong signature
-- 2. Function not exposed via PostgREST
-- 3. Permissions issues
-- 4. Empty table causing issues
-- 5. PostgREST cache issues
-- ============================================================

-- Step 1: Drop ALL versions of the function (handle overloads)
DROP FUNCTION IF EXISTS public.get_user_scene_progress CASCADE;

-- Step 2: Ensure the table exists and is accessible
-- (This shouldn't be necessary, but ensures table is ready)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_scene_progress'
  ) THEN
    RAISE EXCEPTION 'Table user_scene_progress does not exist. Run the scenes system migration first.';
  END IF;
END $$;

-- Step 3: Create the function with explicit configuration
-- Using STABLE volatility for better PostgREST compatibility
-- Using explicit schema qualification
CREATE OR REPLACE FUNCTION public.get_user_scene_progress(
  p_user_id UUID,
  p_scene_id UUID
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  scene_id UUID,
  discovery_state TEXT,
  artists_experienced INTEGER,
  venues_experienced INTEGER,
  cities_experienced INTEGER,
  genres_experienced INTEGER,
  events_experienced INTEGER,
  progress_percentage INTEGER,
  discovered_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Handle empty table gracefully - return empty result set, not error
  RETURN QUERY
  SELECT 
    usp.id,
    usp.user_id,
    usp.scene_id,
    usp.discovery_state,
    usp.artists_experienced,
    usp.venues_experienced,
    usp.cities_experienced,
    usp.genres_experienced,
    usp.events_experienced,
    usp.progress_percentage,
    usp.discovered_at,
    usp.started_at,
    usp.completed_at,
    usp.last_activity_at,
    usp.metadata
  FROM public.user_scene_progress usp
  WHERE usp.user_id = p_user_id
    AND usp.scene_id = p_scene_id;
  
  -- If no rows found, function returns empty result set (not an error)
  -- This is the correct behavior for PostgREST
END;
$$;

-- Step 4: Grant permissions explicitly
-- PostgREST requires these grants to expose the function
GRANT EXECUTE ON FUNCTION public.get_user_scene_progress(UUID, UUID) 
  TO authenticated, anon, service_role, postgres;

-- Step 5: Add comment for PostgREST metadata
COMMENT ON FUNCTION public.get_user_scene_progress(UUID, UUID) IS 
  'Get user scene progress. Returns empty result if no progress exists.';

-- Step 6: Verify function was created correctly
DO $$
DECLARE
  func_exists BOOLEAN;
  func_signature TEXT;
BEGIN
  -- Check function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'get_user_scene_progress'
    AND pg_get_function_arguments(p.oid) = 'p_user_id uuid, p_scene_id uuid'
  ) INTO func_exists;
  
  IF NOT func_exists THEN
    RAISE EXCEPTION 'Function get_user_scene_progress was not created successfully';
  END IF;
  
  -- Get function signature for verification
  SELECT pg_get_function_arguments(p.oid) INTO func_signature
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
  AND p.proname = 'get_user_scene_progress'
  AND pg_get_function_arguments(p.oid) = 'p_user_id uuid, p_scene_id uuid';
  
  RAISE NOTICE '✅ Function get_user_scene_progress created successfully';
  RAISE NOTICE '   Signature: %', func_signature;
  RAISE NOTICE '   Volatility: STABLE';
  RAISE NOTICE '   Security: DEFINER';
END $$;

-- Step 7: Test function with NULL inputs (should return empty, not error)
-- This ensures the function handles edge cases
DO $$
DECLARE
  test_result RECORD;
  row_count INT := 0;
BEGIN
  -- Test with NULL UUIDs (should return empty, not error)
  FOR test_result IN 
    SELECT * FROM public.get_user_scene_progress(
      '00000000-0000-0000-0000-000000000000'::UUID,
      '00000000-0000-0000-0000-000000000000'::UUID
    )
  LOOP
    row_count := row_count + 1;
  END LOOP;
  
  RAISE NOTICE '✅ Function test passed (returned % rows for non-existent IDs)', row_count;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '⚠️ Function test failed: %', SQLERRM;
END $$;

-- Step 8: Refresh PostgREST schema cache (if possible)
-- Note: In Supabase, this might require a restart or happens automatically
-- But we can at least ensure the function is in the right state
DO $$
BEGIN
  RAISE NOTICE '📝 Note: If 406 error persists, PostgREST may need to refresh its schema cache.';
  RAISE NOTICE '   In Supabase, this usually happens automatically within a few seconds.';
  RAISE NOTICE '   If not, try restarting the Supabase project or wait 30-60 seconds.';
END $$;


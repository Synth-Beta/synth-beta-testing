-- ============================================================
-- FIX GET_USER_SCENE_PROGRESS FUNCTION ACCESS
-- This migration ensures the function is properly exposed
-- and accessible via the REST API to fix 406 errors
-- ============================================================

-- Drop and recreate the function to ensure it's properly exposed
DROP FUNCTION IF EXISTS public.get_user_scene_progress(UUID, UUID);

-- Function to get user scene progress (bypasses RLS)
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
SET search_path = public
STABLE
AS $$
BEGIN
  -- Note: We rely on the WHERE clause to filter by user_id for security
  -- The function is SECURITY DEFINER so it bypasses RLS, but we only return
  -- rows matching the provided user_id parameter
  -- The frontend should only call this with the authenticated user's ID
  
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
END;
$$;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.get_user_scene_progress(UUID, UUID) TO authenticated, anon;

-- Also grant to service_role for internal use
GRANT EXECUTE ON FUNCTION public.get_user_scene_progress(UUID, UUID) TO service_role;

-- Ensure the function is exposed via PostgREST
-- This is done by ensuring it's in the public schema and has proper grants
-- PostgREST automatically exposes functions in the public schema

-- ============================================================
-- VERIFY FUNCTION EXISTS AND IS ACCESSIBLE
-- ============================================================
DO $$
BEGIN
  -- Check that function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'get_user_scene_progress'
    AND pg_get_function_arguments(p.oid) = 'p_user_id uuid, p_scene_id uuid'
  ) THEN
    RAISE EXCEPTION 'Function get_user_scene_progress does not exist';
  END IF;
  
  RAISE NOTICE 'Function get_user_scene_progress is properly configured';
END $$;


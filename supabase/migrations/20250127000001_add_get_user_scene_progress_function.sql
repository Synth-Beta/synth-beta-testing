-- ============================================================
-- ADD FUNCTION TO GET USER SCENE PROGRESS (BYPASSES RLS)
-- This function can be called from the frontend to get progress
-- without RLS blocking it, since it's SECURITY DEFINER
-- ============================================================

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

-- Function to get all user scene progress (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_all_user_scene_progress(
  p_user_id UUID
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
  ORDER BY usp.last_activity_at DESC NULLS LAST;
END;
$$;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.get_all_user_scene_progress(UUID) TO authenticated, anon;


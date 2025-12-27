-- ============================================
-- HOME SCENE CALCULATOR
-- Identifies user's primary scene based on participation
-- ============================================

CREATE OR REPLACE FUNCTION public.calculate_home_scene(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_home_scene_id UUID;
  v_scene_progress RECORD;
BEGIN
  -- Find scene with highest progress/completion
  SELECT usp.scene_id
  INTO v_home_scene_id
  FROM public.user_scene_progress usp
  WHERE usp.user_id = p_user_id
    AND usp.discovery_state IN ('in_progress', 'completed')
  ORDER BY 
    CASE usp.discovery_state
      WHEN 'completed' THEN 3
      WHEN 'in_progress' THEN 2
      ELSE 1
    END DESC,
    usp.progress_percentage DESC,
    usp.events_experienced DESC,
    usp.last_activity_at DESC NULLS LAST
  LIMIT 1;

  -- If no scene progress, try to infer from passport entries
  IF v_home_scene_id IS NULL THEN
    SELECT pe.entity_uuid::UUID
    INTO v_home_scene_id
    FROM public.passport_entries pe
    WHERE pe.user_id = p_user_id
      AND pe.type = 'scene'
    ORDER BY pe.unlocked_at DESC
    LIMIT 1;
  END IF;

  -- If still no scene, infer from most frequent city + genre combination
  -- (This is a fallback - would require genre analysis from events)
  -- For now, return NULL if no scene found

  RETURN v_home_scene_id;
END;
$$;

-- Function to update home scene in passport identity
CREATE OR REPLACE FUNCTION public.update_home_scene(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_home_scene_id UUID;
BEGIN
  v_home_scene_id := public.calculate_home_scene(p_user_id);

  -- Update passport identity
  INSERT INTO public.passport_identity (user_id, home_scene_id, join_year, updated_at)
  VALUES (
    p_user_id, 
    v_home_scene_id, 
    EXTRACT(YEAR FROM (SELECT created_at FROM auth.users WHERE id = p_user_id))::INTEGER,
    now()
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET
    home_scene_id = EXCLUDED.home_scene_id,
    updated_at = EXCLUDED.updated_at;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.calculate_home_scene(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_home_scene(UUID) TO authenticated;

COMMENT ON FUNCTION public.calculate_home_scene IS 'Identifies user primary scene based on scene progress and passport entries';
COMMENT ON FUNCTION public.update_home_scene IS 'Updates home scene in passport identity';


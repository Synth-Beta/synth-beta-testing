-- ============================================================
-- BACKFILL SCENE PROGRESS
-- Calculate and populate scene progress for all existing users
-- based on their passport entries and reviews
-- ============================================================

-- Function to backfill progress for a single user
CREATE OR REPLACE FUNCTION public.backfill_user_scene_progress(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_scene RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Loop through all active scenes
  FOR v_scene IN 
    SELECT id FROM public.scenes WHERE is_active = true
  LOOP
    -- Calculate progress for this user and scene
    BEGIN
      PERFORM public.calculate_scene_progress(p_user_id, v_scene.id);
      v_count := v_count + 1;
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but continue with other scenes
        RAISE WARNING 'Error calculating progress for user %, scene %: %', p_user_id, v_scene.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- Backfill progress for all users
DO $$
DECLARE
  v_user RECORD;
  v_total_scenes INTEGER;
  v_processed_users INTEGER := 0;
BEGIN
  -- Get count of active scenes
  SELECT COUNT(*) INTO v_total_scenes FROM public.scenes WHERE is_active = true;
  
  RAISE NOTICE 'Starting scene progress backfill for % active scenes...', v_total_scenes;
  
  -- Loop through all users
  FOR v_user IN 
    SELECT DISTINCT id FROM auth.users
  LOOP
    -- Backfill progress for this user
    PERFORM public.backfill_user_scene_progress(v_user.id);
    v_processed_users := v_processed_users + 1;
    
    -- Log progress every 100 users
    IF v_processed_users % 100 = 0 THEN
      RAISE NOTICE 'Processed % users...', v_processed_users;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Backfill complete! Processed % users across % scenes', v_processed_users, v_total_scenes;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.backfill_user_scene_progress TO authenticated;


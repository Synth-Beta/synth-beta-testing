-- ============================================
-- PASSPORT PERIODIC CALCULATIONS
-- Functions for periodic recalculation of passport data
-- ============================================

-- Master function to recalculate all passport data for a user
CREATE OR REPLACE FUNCTION public.recalculate_passport_data(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Recalculate fan type and identity
  PERFORM public.update_passport_identity(p_user_id);
  
  -- Update home scene
  PERFORM public.update_home_scene(p_user_id);
  
  -- Detect eras (this can be expensive, so run periodically)
  PERFORM public.detect_user_eras(p_user_id);
  
  -- Detect festivals
  PERFORM public.detect_festival_stamps(p_user_id);
  
  -- Calculate artist milestones
  PERFORM public.calculate_artist_milestones(p_user_id);
  
  -- Recalculate taste map
  PERFORM public.calculate_taste_map(p_user_id);
  
  -- Check for achievements (uses master function for all tiered achievements)
  PERFORM public.check_all_achievements(p_user_id);
  
  -- Auto-select timeline highlights
  PERFORM public.auto_select_timeline_highlights(p_user_id, 10);
END;
$$;

-- Function to recalculate passport data for all users (for batch jobs)
-- Note: This should be run carefully in production due to performance
CREATE OR REPLACE FUNCTION public.recalculate_all_passport_data()
RETURNS TABLE(user_id UUID, success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
  v_error TEXT;
BEGIN
  FOR v_user IN
    SELECT DISTINCT user_id
    FROM public.passport_entries
    ORDER BY user_id
  LOOP
    BEGIN
      PERFORM public.recalculate_passport_data(v_user.user_id);
      RETURN QUERY SELECT v_user.user_id, true, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      RETURN QUERY SELECT v_user.user_id, false, v_error;
    END;
  END LOOP;
END;
$$;

-- Grant permissions (recalculate_all should be admin-only, but included for completeness)
GRANT EXECUTE ON FUNCTION public.recalculate_passport_data(UUID) TO authenticated;

COMMENT ON FUNCTION public.recalculate_passport_data IS 'Master function to recalculate all passport data (identity, stamps, achievements, taste map) for a user';
COMMENT ON FUNCTION public.recalculate_all_passport_data IS 'Batch function to recalculate passport data for all users (use with caution)';


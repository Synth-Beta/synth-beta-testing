-- ============================================
-- TEST ACHIEVEMENT FUNCTIONS
-- Run this to test achievement calculation for a specific user
-- ============================================

-- Test function for a single user (replace with actual user_id)
-- Example usage:
-- 
-- SELECT public.calculate_all_achievements('YOUR_USER_ID_HERE');
--
-- Then check results:
-- SELECT 
--   a.achievement_key,
--   a.name,
--   uap.current_progress,
--   uap.highest_tier_achieved,
--   a.bronze_goal,
--   a.silver_goal,
--   a.gold_goal
-- FROM public.user_achievement_progress uap
-- INNER JOIN public.achievements a ON a.id = uap.achievement_id
-- WHERE uap.user_id = 'YOUR_USER_ID_HERE'
-- ORDER BY a.sort_order;

-- ============================================
-- QUICK TEST: Test with first user that has reviews
-- ============================================
DO $$
DECLARE
  v_test_user_id UUID;
  v_review_count INTEGER;
BEGIN
  -- Get first user with reviews
  SELECT user_id, COUNT(*) 
  INTO v_test_user_id, v_review_count
  FROM public.reviews
  WHERE is_draft = false
  GROUP BY user_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF v_test_user_id IS NULL THEN
    RAISE NOTICE 'No users with reviews found. Cannot test.';
    RETURN;
  END IF;

  RAISE NOTICE 'Testing achievements for user % (has % reviews)...', v_test_user_id, v_review_count;

  -- Calculate achievements
  PERFORM public.calculate_all_achievements(v_test_user_id);

  RAISE NOTICE 'Test complete! Check user_achievement_progress table for results.';
  RAISE NOTICE 'Run this query to see results:';
  RAISE NOTICE 'SELECT a.achievement_key, a.name, uap.current_progress, uap.highest_tier_achieved FROM user_achievement_progress uap JOIN achievements a ON a.id = uap.achievement_id WHERE uap.user_id = ''%'';', v_test_user_id;

END;
$$;


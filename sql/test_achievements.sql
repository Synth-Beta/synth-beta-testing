-- ============================================
-- TEST ACHIEVEMENTS - Diagnostic Queries
-- Run these to check if achievements are working
-- ============================================

-- 1. Check if achievements table has data
SELECT COUNT(*) as achievement_count FROM public.achievements;

-- 2. Check if any users have reviews
SELECT COUNT(DISTINCT user_id) as users_with_reviews
FROM public.reviews
WHERE is_draft = false;

-- 3. Test a single user's achievement calculation
-- Replace 'YOUR_USER_ID' with an actual user_id
DO $$
DECLARE
  v_test_user_id UUID;
BEGIN
  -- Get first user with reviews
  SELECT user_id INTO v_test_user_id
  FROM public.reviews
  WHERE is_draft = false
  LIMIT 1;

  IF v_test_user_id IS NULL THEN
    RAISE NOTICE 'No users with reviews found';
    RETURN;
  END IF;

  RAISE NOTICE 'Testing user: %', v_test_user_id;
  
  -- Test single achievement calculation
  BEGIN
    PERFORM public.calculate_genre_curator(v_test_user_id);
    RAISE NOTICE '✓ calculate_genre_curator worked';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '✗ calculate_genre_curator failed: %', SQLERRM;
  END;

  -- Check if progress was created
  SELECT COUNT(*) INTO v_count
  FROM public.user_achievement_progress
  WHERE user_id = v_test_user_id;

  RAISE NOTICE 'Progress records created: %', v_count;
END;
$$;

-- 4. Check current progress for all users
SELECT 
  COUNT(*) as total_progress_records,
  COUNT(DISTINCT user_id) as users_with_progress
FROM public.user_achievement_progress;

-- 5. See sample progress data
SELECT 
  uap.user_id,
  a.achievement_key,
  a.name,
  uap.current_progress,
  uap.highest_tier_achieved,
  a.bronze_goal,
  a.silver_goal,
  a.gold_goal
FROM public.user_achievement_progress uap
INNER JOIN public.achievements a ON a.id = uap.achievement_id
ORDER BY uap.user_id, a.sort_order
LIMIT 50;






-- ============================================
-- BACKFILL ACHIEVEMENTS
-- Run this to calculate achievements for all existing users
-- ============================================

DO $$
DECLARE
  v_user RECORD;
  v_processed_users INTEGER := 0;
  v_total_users INTEGER;
BEGIN
  -- Get count of users with reviews
  SELECT COUNT(DISTINCT user_id) INTO v_total_users
  FROM public.reviews
  WHERE is_draft = false;

  RAISE NOTICE 'Starting achievement backfill for % users with reviews...', v_total_users;

  -- Loop through all users with reviews
  FOR v_user IN
    SELECT DISTINCT user_id
    FROM public.reviews
    WHERE is_draft = false
    ORDER BY user_id
  LOOP
    BEGIN
      -- Calculate all achievements for this user
      PERFORM public.calculate_all_achievements(v_user.user_id);
      v_processed_users := v_processed_users + 1;

      -- Log progress every 50 users
      IF v_processed_users % 50 = 0 THEN
        RAISE NOTICE 'Processed % / % users...', v_processed_users, v_total_users;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue with other users
      RAISE WARNING 'Error calculating achievements for user %: %', v_user.user_id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Backfill complete! Processed % users', v_processed_users;
END;
$$;

-- ============================================
-- VERIFICATION: Check results
-- ============================================
-- Uncomment to see results after backfill:
-- SELECT 
--   uap.user_id,
--   a.achievement_key,
--   a.name,
--   uap.current_progress,
--   uap.highest_tier_achieved,
--   a.bronze_goal,
--   a.silver_goal,
--   a.gold_goal
-- FROM public.user_achievement_progress uap
-- INNER JOIN public.achievements a ON a.id = uap.achievement_id
-- ORDER BY uap.user_id, a.sort_order
-- LIMIT 100;


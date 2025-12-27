-- ============================================
-- BACKFILL PASSPORT ENHANCEMENTS
-- Calculate fan types, eras, festivals, milestones, and taste maps for existing users
-- ============================================

-- Backfill passport identity for all users with activity
DO $$
DECLARE
  v_user RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_user IN
    SELECT DISTINCT user_id
    FROM public.reviews
    WHERE was_there = true
    UNION
    SELECT DISTINCT user_id
    FROM public.passport_entries
  LOOP
    BEGIN
      -- Calculate identity
      PERFORM public.update_passport_identity(v_user.user_id);
      
      -- Calculate home scene
      PERFORM public.update_home_scene(v_user.user_id);
      
      v_count := v_count + 1;
      
      -- Log progress every 100 users
      IF v_count % 100 = 0 THEN
        RAISE NOTICE 'Processed % users...', v_count;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error processing user %: %', v_user.user_id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Completed identity backfill for % users', v_count;
END $$;

-- Backfill festivals and milestones (run detection for all users)
DO $$
DECLARE
  v_user RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_user IN
    SELECT DISTINCT user_id
    FROM public.reviews
    WHERE was_there = true
  LOOP
    BEGIN
      PERFORM public.detect_festival_stamps(v_user.user_id);
      PERFORM public.calculate_artist_milestones(v_user.user_id);
      
      v_count := v_count + 1;
      
      IF v_count % 100 = 0 THEN
        RAISE NOTICE 'Processed % users for festivals/milestones...', v_count;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error processing user %: %', v_user.user_id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Completed festival/milestone backfill for % users', v_count;
END $$;

-- Backfill eras (more expensive, run for users with sufficient history)
DO $$
DECLARE
  v_user RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_user IN
    SELECT r.user_id, COUNT(DISTINCT e.id) as event_count
    FROM public.reviews r
    INNER JOIN public.events e ON e.id = r.event_id
    WHERE r.was_there = true
    GROUP BY r.user_id
    HAVING COUNT(DISTINCT e.id) >= 10  -- Only users with 10+ events
  LOOP
    BEGIN
      PERFORM public.detect_user_eras(v_user.user_id);
      
      v_count := v_count + 1;
      
      IF v_count % 50 = 0 THEN
        RAISE NOTICE 'Processed % users for eras...', v_count;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error processing user %: %', v_user.user_id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Completed era backfill for % users', v_count;
END $$;

-- Backfill taste maps for all users with activity
DO $$
DECLARE
  v_user RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_user IN
    SELECT DISTINCT user_id
    FROM public.reviews
    WHERE was_there = true
  LOOP
    BEGIN
      PERFORM public.calculate_taste_map(v_user.user_id);
      
      v_count := v_count + 1;
      
      IF v_count % 100 = 0 THEN
        RAISE NOTICE 'Processed % users for taste maps...', v_count;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error processing user %: %', v_user.user_id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Completed taste map backfill for % users', v_count;
END $$;

-- Backfill achievements
DO $$
DECLARE
  v_user RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_user IN
    SELECT DISTINCT user_id
    FROM public.reviews
    WHERE was_there = true OR review_text IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.detect_deep_cut_reviewer(v_user.user_id);
      PERFORM public.detect_scene_connector(v_user.user_id);
      PERFORM public.detect_trusted_taste(v_user.user_id);
      
      v_count := v_count + 1;
      
      IF v_count % 100 = 0 THEN
        RAISE NOTICE 'Processed % users for achievements...', v_count;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error processing user %: %', v_user.user_id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Completed achievement backfill for % users', v_count;
END $$;

-- Set default rarity for existing entries without rarity
UPDATE public.passport_entries
SET rarity = 'common'
WHERE rarity IS NULL;

COMMENT ON FUNCTION public.recalculate_passport_data IS 'Master function to recalculate all passport data for a user - use this for periodic updates';


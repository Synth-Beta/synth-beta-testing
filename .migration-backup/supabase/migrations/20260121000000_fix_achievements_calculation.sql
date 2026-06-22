-- ============================================
-- FIX ACHIEVEMENTS CALCULATION SYSTEM
-- ============================================
-- This migration fixes the achievements system by:
-- 1. Creating the missing check_all_achievements function
-- 2. Adding calculations for genre_curator and genre_specialist
-- 3. Fixing genre detection to use events.genres as primary source
-- 4. Ensuring achievements are recalculated when reviews are created
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: CREATE check_all_achievements FUNCTION
-- ============================================
-- This function calculates progress for all achievements and updates user_achievement_progress table

CREATE OR REPLACE FUNCTION public.check_all_achievements(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement RECORD;
  v_progress INTEGER;
  v_highest_tier TEXT;
  v_metadata JSONB;
BEGIN
  -- Loop through all active achievements
  FOR v_achievement IN
    SELECT id, achievement_key, bronze_goal, silver_goal, gold_goal
    FROM public.achievements
    WHERE is_active = true
  LOOP
    -- Calculate progress based on achievement type
    v_progress := 0;
    v_highest_tier := NULL;
    v_metadata := '{}'::jsonb;
    
    CASE v_achievement.achievement_key
      WHEN 'genre_curator' THEN
        -- Count distinct genres from events (primary) or artists (fallback)
        SELECT COUNT(DISTINCT genre)
        INTO v_progress
        FROM (
          SELECT UNNEST(COALESCE(e.genres, ARRAY[]::TEXT[])) as genre
          FROM public.reviews r
          INNER JOIN public.events e ON e.id = r.event_id
          WHERE r.user_id = p_user_id
            AND (r.was_there = true OR r.review_text IS NOT NULL)
            AND COALESCE(e.genres, ARRAY[]::TEXT[]) != ARRAY[]::TEXT[]
          
          UNION
          
          SELECT UNNEST(a.genres) as genre
          FROM public.reviews r
          INNER JOIN public.events e ON e.id = r.event_id
          INNER JOIN public.artists a ON a.id = e.artist_id
          WHERE r.user_id = p_user_id
            AND (r.was_there = true OR r.review_text IS NOT NULL)
            AND a.genres IS NOT NULL
            AND (e.genres IS NULL OR e.genres = ARRAY[]::TEXT[])
        ) genre_list;
        
      WHEN 'genre_specialist' THEN
        -- Find the genre with the most attended shows
        SELECT COALESCE(MAX(genre_count), 0)
        INTO v_progress
        FROM (
          SELECT genre, COUNT(*) as genre_count
          FROM (
            SELECT UNNEST(COALESCE(e.genres, ARRAY[]::TEXT[])) as genre
            FROM public.reviews r
            INNER JOIN public.events e ON e.id = r.event_id
            WHERE r.user_id = p_user_id
              AND (r.was_there = true OR r.review_text IS NOT NULL)
              AND COALESCE(e.genres, ARRAY[]::TEXT[]) != ARRAY[]::TEXT[]
            
            UNION ALL
            
            SELECT UNNEST(a.genres) as genre
            FROM public.reviews r
            INNER JOIN public.events e ON e.id = r.event_id
            INNER JOIN public.artists a ON a.id = e.artist_id
            WHERE r.user_id = p_user_id
              AND (r.was_there = true OR r.review_text IS NOT NULL)
              AND a.genres IS NOT NULL
              AND (e.genres IS NULL OR e.genres = ARRAY[]::TEXT[])
          ) genre_list
          GROUP BY genre
        ) genre_counts;
        
      WHEN 'bucket_list_starter' THEN
        -- Count events where artist or venue is in bucket_list
        SELECT COUNT(DISTINCT r.event_id)
        INTO v_progress
        FROM public.reviews r
        INNER JOIN public.events e ON e.id = r.event_id
        WHERE r.user_id = p_user_id
          AND (r.was_there = true OR r.review_text IS NOT NULL)
          AND (
            EXISTS (
              SELECT 1 FROM public.bucket_list bl
              INNER JOIN public.entities ent ON ent.id = bl.entity_id
              WHERE bl.user_id = p_user_id
                AND ent.entity_type = 'artist'
                AND ent.entity_uuid = e.artist_id
            )
            OR EXISTS (
              SELECT 1 FROM public.bucket_list bl
              INNER JOIN public.entities ent ON ent.id = bl.entity_id
              WHERE bl.user_id = p_user_id
                AND ent.entity_type = 'venue'
                AND ent.entity_uuid = e.venue_id
            )
          );
        
      WHEN 'intentional_explorer' THEN
        -- Find max scenes across different scenes in one genre
        -- This is complex, so we'll use a simplified version
        SELECT COALESCE(MAX(scene_count), 0)
        INTO v_progress
        FROM (
          SELECT genre, COUNT(DISTINCT pe.entity_uuid) as scene_count
          FROM (
            SELECT UNNEST(COALESCE(e.genres, ARRAY[]::TEXT[])) as genre, e.id as event_id
            FROM public.reviews r
            INNER JOIN public.events e ON e.id = r.event_id
            WHERE r.user_id = p_user_id
              AND (r.was_there = true OR r.review_text IS NOT NULL)
              AND COALESCE(e.genres, ARRAY[]::TEXT[]) != ARRAY[]::TEXT[]
            
            UNION
            
            SELECT UNNEST(a.genres) as genre, e.id as event_id
            FROM public.reviews r
            INNER JOIN public.events e ON e.id = r.event_id
            INNER JOIN public.artists a ON a.id = e.artist_id
            WHERE r.user_id = p_user_id
              AND (r.was_there = true OR r.review_text IS NOT NULL)
              AND a.genres IS NOT NULL
              AND (e.genres IS NULL OR e.genres = ARRAY[]::TEXT[])
          ) genre_events
          INNER JOIN public.passport_entries pe ON pe.user_id = p_user_id
            AND pe.type = 'scene'
            AND pe.entity_uuid IS NOT NULL
          GROUP BY genre
        ) scene_counts;
        
      ELSE
        -- For other achievements, use get_achievement_progress function
        -- This handles venue_hopper, scene_explorer, etc.
        SELECT current_progress
        INTO v_progress
        FROM public.get_achievement_progress(p_user_id)
        WHERE achievement_type = v_achievement.achievement_key
        LIMIT 1;
    END CASE;
    
    -- Determine highest tier achieved
    IF v_progress >= v_achievement.gold_goal THEN
      v_highest_tier := 'gold';
    ELSIF v_progress >= v_achievement.silver_goal THEN
      v_highest_tier := 'silver';
    ELSIF v_progress >= v_achievement.bronze_goal THEN
      v_highest_tier := 'bronze';
    END IF;
    
    -- Insert or update user_achievement_progress
    INSERT INTO public.user_achievement_progress (
      user_id,
      achievement_id,
      current_progress,
      highest_tier_achieved,
      progress_metadata,
      updated_at
    )
    VALUES (
      p_user_id,
      v_achievement.id,
      v_progress,
      v_highest_tier,
      v_metadata,
      now()
    )
    ON CONFLICT (user_id, achievement_id)
    DO UPDATE SET
      current_progress = EXCLUDED.current_progress,
      highest_tier_achieved = EXCLUDED.highest_tier_achieved,
      progress_metadata = EXCLUDED.progress_metadata,
      updated_at = now(),
      -- Update tier timestamps if tier increased
      bronze_achieved_at = CASE 
        WHEN EXCLUDED.highest_tier_achieved IN ('bronze', 'silver', 'gold') 
          AND user_achievement_progress.bronze_achieved_at IS NULL 
        THEN now() 
        ELSE user_achievement_progress.bronze_achieved_at 
      END,
      silver_achieved_at = CASE 
        WHEN EXCLUDED.highest_tier_achieved IN ('silver', 'gold') 
          AND user_achievement_progress.silver_achieved_at IS NULL 
        THEN now() 
        ELSE user_achievement_progress.silver_achieved_at 
      END,
      gold_achieved_at = CASE 
        WHEN EXCLUDED.highest_tier_achieved = 'gold' 
          AND user_achievement_progress.gold_achieved_at IS NULL 
        THEN now() 
        ELSE user_achievement_progress.gold_achieved_at 
      END;
  END LOOP;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.check_all_achievements(UUID) TO authenticated;

COMMENT ON FUNCTION public.check_all_achievements IS 'Calculates and updates progress for all achievements for a user';

-- ============================================
-- STEP 2: UPDATE TRIGGER TO CALL check_all_achievements
-- ============================================
-- Update the auto_unlock_passport_on_review trigger to recalculate achievements

CREATE OR REPLACE FUNCTION public.auto_unlock_passport_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_data RECORD;
  v_venue_data RECORD;
  v_is_festival BOOLEAN := false;
BEGIN
  -- Only process if review is not a draft and user attended
  IF NEW.is_draft = false AND (NEW.was_there = true OR NEW.review_text IS NOT NULL) THEN
    -- Get event details - use JOINs to get artist/venue names (they're not in events table)
    SELECT 
      e.venue_city,
      e.venue_state,
      e.venue_id, -- UUID of venue
      COALESCE(v.name, e.venue_city) as venue_name, -- Use venue name from venues table or fallback to city
      e.artist_id, -- UUID of artist
      COALESCE(a.name, e.title) as artist_name, -- Use artist name from artists table or fallback to event title
      e.title,
      e.id as event_id
    INTO v_event_data
    FROM public.events e
    LEFT JOIN public.artists a ON a.id = e.artist_id
    LEFT JOIN public.venues v ON v.id = e.venue_id
    WHERE e.id = NEW.event_id;
    
    IF v_event_data IS NOT NULL THEN
      -- Check if this is a festival
      v_is_festival := (
        v_event_data.venue_name ILIKE '%festival%' 
        OR v_event_data.venue_name ILIKE '%fest%' 
        OR v_event_data.venue_name ILIKE '%gathering%'
        OR v_event_data.venue_name ILIKE '%fair%'
        OR v_event_data.title ILIKE '%festival%'
        OR v_event_data.title ILIKE '%fest%'
      );

      -- Unlock city (skip if "Unknown")
      IF v_event_data.venue_city IS NOT NULL 
         AND LOWER(TRIM(v_event_data.venue_city)) != 'unknown' THEN
        PERFORM public.unlock_passport_city(
          NEW.user_id,
          v_event_data.venue_city,
          v_event_data.venue_state
        );
        
        -- Check for first-time city achievement
        PERFORM public.detect_first_time_city(NEW.user_id, NEW.event_id);
      END IF;
      
      -- Unlock venue using JamBase venue_id
      IF v_event_data.venue_name IS NOT NULL THEN
        PERFORM public.unlock_passport_venue(
          NEW.user_id,
          v_event_data.venue_id, -- Use JamBase ID instead of UUID
          v_event_data.venue_name
        );
      END IF;
      
      -- Unlock artist using JamBase artist_id
      IF v_event_data.artist_name IS NOT NULL THEN
        PERFORM public.unlock_passport_artist(
          NEW.user_id,
          v_event_data.artist_id::TEXT, -- JamBase ID
          v_event_data.artist_name
        );
      END IF;

      -- Detect festivals (runs detection which handles existing stamps)
      IF v_is_festival THEN
        PERFORM public.detect_festival_stamps(NEW.user_id);
      END IF;

      -- Calculate artist milestones
      PERFORM public.calculate_artist_milestones(NEW.user_id);

      -- Check for deep cut reviewer achievement (after review is saved)
      IF NEW.review_text IS NOT NULL AND NEW.review_text != 'ATTENDANCE_ONLY' THEN
        PERFORM public.detect_deep_cut_reviewer(NEW.user_id);
      END IF;
      
      -- Recalculate all achievements after passport entries are updated
      PERFORM public.check_all_achievements(NEW.user_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMIT;


-- ============================================
-- AUTO-POPULATE PASSPORT TIMELINE
-- Automatically detects and adds significant moments to user timeline
-- ============================================

-- Drop existing trigger and functions to ensure clean recreation
DROP TRIGGER IF EXISTS trigger_auto_populate_timeline_on_review ON public.reviews;
DROP FUNCTION IF EXISTS public.trigger_auto_populate_timeline_on_review();
DROP FUNCTION IF EXISTS public.backfill_passport_timeline();
DROP FUNCTION IF EXISTS public.auto_populate_passport_timeline(UUID);

-- Function to auto-populate timeline for a single user
CREATE OR REPLACE FUNCTION public.auto_populate_passport_timeline(
  p_user_id UUID
)
RETURNS TABLE(
  highlights_added INTEGER,
  firsts_count INTEGER,
  milestones_count INTEGER,
  quality_reviews_count INTEGER,
  special_events_count INTEGER,
  achievements_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review RECORD;
  v_event RECORD;
  v_achievement RECORD;
  v_firsts INTEGER := 0;
  v_milestones INTEGER := 0;
  v_quality_reviews INTEGER := 0;
  v_special_events INTEGER := 0;
  v_achievements INTEGER := 0;
  v_total_added INTEGER := 0;
  v_review_count INTEGER;
  v_event_count INTEGER;
  v_is_first_review BOOLEAN;
  v_is_first_artist BOOLEAN;
  v_is_first_venue BOOLEAN;
  v_is_first_city BOOLEAN;
  v_significance TEXT;
  v_milestone_number INTEGER;
  v_tour_name TEXT;
BEGIN
  -- Process all non-draft reviews for this user
  FOR v_review IN
    SELECT 
      r.id,
      r.user_id,
      r.event_id,
      r.artist_id,
      r.venue_id,
      r.rating,
      r.review_text,
      r.photos,
      r.was_there,
      r.created_at,
      r.artist_performance_rating,
      r.production_rating,
      r.venue_rating,
      r.location_rating,
      r.value_rating,
      r.setlist as review_setlist,
      r."Event_date" as review_event_date,
      e.id as event_uuid,
      COALESCE(e.artist_id, r.artist_id) as artist_id,
      COALESCE(e.venue_id, r.venue_id) as venue_id,
      e.venue_city,
      e.venue_state,
      COALESCE(e.setlist, r.setlist) as setlist,
      e.tour_name,
      COALESCE(e.event_date, r."Event_date"::timestamptz) as event_date
    FROM public.reviews r
    LEFT JOIN public.events e ON e.id = r.event_id
    WHERE r.user_id = p_user_id
      AND r.is_draft = false
      AND (r.was_there = true OR r.review_text IS NOT NULL)
    ORDER BY r.created_at ASC
  LOOP
    -- Skip if already in timeline
    IF EXISTS (
      SELECT 1 FROM public.passport_timeline
      WHERE user_id = p_user_id
        AND review_id = v_review.id
    ) THEN
      CONTINUE;
    END IF;

    v_significance := NULL;
    
    -- ============================================
    -- 1. CHECK FOR FIRSTS
    -- ============================================
    
    -- Check if this is the user's first review
    SELECT COUNT(*) INTO v_review_count
    FROM public.reviews
    WHERE user_id = p_user_id
      AND is_draft = false
      AND (was_there = true OR review_text IS NOT NULL)
      AND created_at < v_review.created_at;
    
    v_is_first_review := (v_review_count = 0);
    
    -- Check if first time seeing this artist
    IF v_review.artist_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_review_count
      FROM public.passport_entries
      WHERE user_id = p_user_id
        AND type = 'artist'
        AND entity_uuid = v_review.artist_id
        AND unlocked_at < v_review.created_at;
      
      v_is_first_artist := (v_review_count = 0);
    ELSE
      v_is_first_artist := false;
    END IF;
    
    -- Check if first time at this venue
    IF v_review.venue_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_review_count
      FROM public.passport_entries
      WHERE user_id = p_user_id
        AND type = 'venue'
        AND entity_uuid = v_review.venue_id
        AND unlocked_at < v_review.created_at;
      
      v_is_first_venue := (v_review_count = 0);
    ELSE
      v_is_first_venue := false;
    END IF;
    
    -- Check if first event in this city
    -- Only check if we have venue_city from events table (venues table doesn't have city column)
    IF v_review.venue_city IS NOT NULL THEN
      SELECT COUNT(*) INTO v_review_count
      FROM public.passport_entries
      WHERE user_id = p_user_id
        AND type = 'city'
        AND entity_id = LOWER(REPLACE(TRIM(v_review.venue_city), ' ', '_'))
        AND unlocked_at < v_review.created_at;
      
      v_is_first_city := (v_review_count = 0);
    ELSE
      v_is_first_city := false;
    END IF;
    
    -- Set significance for firsts
    IF v_is_first_review THEN
      v_significance := 'First review';
      v_firsts := v_firsts + 1;
    ELSIF v_is_first_artist AND v_review.event_uuid IS NOT NULL THEN
      SELECT name INTO v_significance
      FROM public.artists
      WHERE id = v_review.artist_id;
      v_significance := 'First time seeing ' || COALESCE(v_significance, 'this artist');
      v_firsts := v_firsts + 1;
    ELSIF v_is_first_venue AND v_review.event_uuid IS NOT NULL THEN
      SELECT name INTO v_significance
      FROM public.venues
      WHERE id = v_review.venue_id;
      v_significance := 'First time at ' || COALESCE(v_significance, 'this venue');
      v_firsts := v_firsts + 1;
    ELSIF v_is_first_city THEN
      v_significance := 'First event in ' || v_review.venue_city;
      v_firsts := v_firsts + 1;
    END IF;
    
    -- ============================================
    -- 2. CHECK FOR MILESTONES
    -- ============================================
    
    -- Count total reviews up to this point (including this one)
    SELECT COUNT(*) INTO v_review_count
    FROM public.reviews
    WHERE user_id = p_user_id
      AND is_draft = false
      AND (was_there = true OR review_text IS NOT NULL)
      AND created_at <= v_review.created_at;
    
    -- Check for review milestones
    IF v_review_count IN (10, 50, 100) THEN
      v_milestone_number := v_review_count;
      IF v_significance IS NULL THEN
        v_significance := v_milestone_number || 'th review';
      ELSE
        v_significance := v_significance || ' • ' || v_milestone_number || 'th review';
      END IF;
      v_milestones := v_milestones + 1;
    END IF;
    
    -- Count total events up to this point
    -- Count distinct events (by event_id) or distinct artist+venue+date combinations
    SELECT COUNT(DISTINCT 
      COALESCE(r2.event_id::text, 
        COALESCE(r2.artist_id::text, '') || '|' || 
        COALESCE(r2.venue_id::text, '') || '|' || 
        COALESCE(r2."Event_date"::text, '')
      )
    ) INTO v_event_count
    FROM public.reviews r2
    WHERE r2.user_id = p_user_id
      AND r2.is_draft = false
      AND (r2.was_there = true OR r2.review_text IS NOT NULL)
      AND r2.created_at <= v_review.created_at;
    
    -- Check for event milestones
    IF v_event_count IN (10, 50, 100) THEN
      v_milestone_number := v_event_count;
      IF v_significance IS NULL THEN
        v_significance := v_milestone_number || 'th event';
      ELSE
        v_significance := v_significance || ' • ' || v_milestone_number || 'th event';
      END IF;
      v_milestones := v_milestones + 1;
    END IF;
    
    -- ============================================
    -- 3. CHECK FOR HIGH-QUALITY REVIEWS
    -- ============================================
    
    -- Check for high ratings (4+ stars)
    IF v_review.rating IS NOT NULL AND v_review.rating >= 4.0 THEN
      IF v_significance IS NULL THEN
        v_significance := ROUND(v_review.rating::numeric, 1) || '-star review';
      ELSE
        v_significance := v_significance || ' • ' || ROUND(v_review.rating::numeric, 1) || ' stars';
      END IF;
      v_quality_reviews := v_quality_reviews + 1;
    END IF;
    
    -- Check for reviews with photos
    IF v_review.photos IS NOT NULL AND array_length(v_review.photos, 1) > 0 THEN
      IF v_significance IS NULL THEN
        v_significance := 'Review with photos';
      ELSE
        v_significance := v_significance || ' • With photos';
      END IF;
      v_quality_reviews := v_quality_reviews + 1;
    END IF;
    
    -- Check for detailed reviews (long text)
    IF v_review.review_text IS NOT NULL AND length(v_review.review_text) > 200 THEN
      IF v_significance IS NULL THEN
        v_significance := 'Detailed review';
      ELSE
        v_significance := v_significance || ' • Detailed';
      END IF;
      v_quality_reviews := v_quality_reviews + 1;
    END IF;
    
    -- ============================================
    -- 4. CHECK FOR SPECIAL EVENTS
    -- ============================================
    
    -- Check for events with setlists (from either events table or review setlist column)
    IF v_review.setlist IS NOT NULL AND v_review.setlist::text != 'null' AND v_review.setlist::text != '{}' THEN
      -- Extract tour name from setlist if available
      v_tour_name := v_review.setlist->>'tour';
      
      -- Check if tour name is in setlist or events table
      IF COALESCE(v_tour_name, v_review.tour_name) IS NOT NULL AND COALESCE(v_tour_name, v_review.tour_name) != '' THEN
        IF v_significance IS NULL THEN
          v_significance := COALESCE(v_tour_name, v_review.tour_name) || ' tour • Setlist available';
        ELSE
          v_significance := v_significance || ' • ' || COALESCE(v_tour_name, v_review.tour_name) || ' tour • Setlist';
        END IF;
      ELSE
        IF v_significance IS NULL THEN
          v_significance := 'Event with setlist';
        ELSE
          v_significance := v_significance || ' • Setlist available';
        END IF;
      END IF;
      v_special_events := v_special_events + 1;
    ELSIF v_review.tour_name IS NOT NULL AND v_review.tour_name != '' THEN
      -- Tour name from events table (no setlist)
      IF v_significance IS NULL THEN
        v_significance := v_review.tour_name || ' tour';
      ELSE
        v_significance := v_significance || ' • ' || v_review.tour_name || ' tour';
      END IF;
      v_special_events := v_special_events + 1;
    END IF;
    
    -- ============================================
    -- INSERT INTO TIMELINE IF SIGNIFICANT
    -- ============================================
    
    -- Only insert if we found something significant
    IF v_significance IS NOT NULL THEN
      INSERT INTO public.passport_timeline (
        user_id,
        event_id,
        review_id,
        is_auto_selected,
        significance,
        created_at
      )
      VALUES (
        p_user_id,
        v_review.event_uuid, -- Can be null if review doesn't have event_id
        v_review.id,
        true,
        v_significance,
        v_review.created_at
      )
      ON CONFLICT (user_id, COALESCE(event_id, '00000000-0000-0000-0000-000000000000'::UUID), COALESCE(review_id, '00000000-0000-0000-0000-000000000000'::UUID))
      DO NOTHING;
      
      -- Check if row was actually inserted (not skipped due to conflict)
      GET DIAGNOSTICS v_review_count = ROW_COUNT;
      IF v_review_count > 0 THEN
        v_total_added := v_total_added + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- ============================================
  -- 5. CHECK FOR ACHIEVEMENT UNLOCKS
  -- ============================================
  
  -- Add timeline entries for achievement unlocks
  FOR v_achievement IN
    SELECT 
      pa.id,
      pa.achievement_type,
      pa.tier,
      pa.unlocked_at,
      pa.metadata
    FROM public.passport_achievements pa
    WHERE pa.user_id = p_user_id
      AND pa.unlocked_at IS NOT NULL
      -- Only add if not already in timeline
      AND NOT EXISTS (
        SELECT 1 FROM public.passport_timeline pt
        WHERE pt.user_id = p_user_id
          AND pt.significance LIKE '%' || pa.achievement_type || '%'
      )
    ORDER BY pa.unlocked_at ASC
  LOOP
    -- Get achievement name
    v_significance := CASE v_achievement.achievement_type
      WHEN 'venue_hopper' THEN 'Venue Hopper'
      WHEN 'scene_explorer' THEN 'Scene Explorer'
      WHEN 'city_crosser' THEN 'City Crosser'
      WHEN 'era_walker' THEN 'Era Walker'
      WHEN 'first_through_door' THEN 'First Through the Door'
      WHEN 'trusted_voice' THEN 'Trusted Voice'
      WHEN 'deep_cut_reviewer' THEN 'Deep Cut Reviewer'
      WHEN 'scene_regular' THEN 'Scene Regular'
      WHEN 'road_tripper' THEN 'Road Tripper'
      WHEN 'venue_loyalist' THEN 'Venue Loyalist'
      WHEN 'genre_blender' THEN 'Genre Blender'
      WHEN 'memory_maker' THEN 'Memory Maker'
      WHEN 'early_adopter' THEN 'Early Adopter'
      WHEN 'connector' THEN 'Connector'
      WHEN 'passport_complete' THEN 'Passport Complete'
      ELSE v_achievement.achievement_type
    END;
    
    IF v_achievement.tier IS NOT NULL THEN
      v_significance := v_significance || ' (' || INITCAP(v_achievement.tier) || ')';
    END IF;
    
    v_significance := 'Achievement unlocked: ' || v_significance;
    
    -- Try to find a related event for this achievement
    -- Use the most recent review before the achievement unlock (with or without event_id)
    v_event.id := NULL;
    SELECT r.event_id INTO v_event.id
    FROM public.reviews r
    WHERE r.user_id = p_user_id
      AND r.is_draft = false
      AND r.created_at <= v_achievement.unlocked_at
    ORDER BY r.created_at DESC
    LIMIT 1;
    
    INSERT INTO public.passport_timeline (
      user_id,
      event_id,
      review_id,
      is_auto_selected,
      significance,
      created_at
    )
    VALUES (
      p_user_id,
      v_event.id, -- Can be null
      NULL,
      true,
      v_significance,
      v_achievement.unlocked_at
    )
    ON CONFLICT (user_id, COALESCE(event_id, '00000000-0000-0000-0000-000000000000'::UUID), COALESCE(review_id, '00000000-0000-0000-0000-000000000000'::UUID))
    DO NOTHING;
    
    -- Check if row was actually inserted
    GET DIAGNOSTICS v_review_count = ROW_COUNT;
    IF v_review_count > 0 THEN
      v_achievements := v_achievements + 1;
      v_total_added := v_total_added + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT 
    v_total_added,
    v_firsts,
    v_milestones,
    v_quality_reviews,
    v_special_events,
    v_achievements;
END;
$$;

-- Backfill function to process all existing users
CREATE OR REPLACE FUNCTION public.backfill_passport_timeline()
RETURNS TABLE(
  users_processed INTEGER,
  total_highlights_added INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_result RECORD;
  v_users_processed INTEGER := 0;
  v_total_highlights INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting passport timeline backfill for all users...';
  
  -- Process each user who has reviews
  FOR v_user IN
    SELECT DISTINCT user_id
    FROM public.reviews
    WHERE is_draft = false
      AND (was_there = true OR review_text IS NOT NULL)
    ORDER BY user_id
  LOOP
    -- Call auto-populate function for this user
    SELECT * INTO v_result
    FROM public.auto_populate_passport_timeline(v_user.user_id);
    
    v_users_processed := v_users_processed + 1;
    v_total_highlights := v_total_highlights + (v_result.highlights_added);
    
    -- Log progress every 10 users
    IF v_users_processed % 10 = 0 THEN
      RAISE NOTICE 'Processed % users, added % highlights so far...', v_users_processed, v_total_highlights;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Backfill complete: % users processed, % highlights added', v_users_processed, v_total_highlights;
  
  RETURN QUERY SELECT v_users_processed, v_total_highlights;
END;
$$;

-- Trigger function to auto-populate timeline when a review is published
CREATE OR REPLACE FUNCTION public.trigger_auto_populate_timeline_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only process when review is published (is_draft changes from true to false)
  IF NEW.is_draft = false AND (OLD.is_draft = true OR OLD.id IS NULL) THEN
    -- Auto-populate timeline for this review
    PERFORM public.auto_populate_passport_timeline(NEW.user_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on reviews table
DROP TRIGGER IF EXISTS trigger_auto_populate_timeline_on_review ON public.reviews;

CREATE TRIGGER trigger_auto_populate_timeline_on_review
  AFTER INSERT OR UPDATE OF is_draft ON public.reviews
  FOR EACH ROW
  WHEN (NEW.is_draft = false)
  EXECUTE FUNCTION public.trigger_auto_populate_timeline_on_review();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.auto_populate_passport_timeline(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_passport_timeline() TO authenticated;

-- Add comments
COMMENT ON FUNCTION public.auto_populate_passport_timeline(UUID) IS 'Automatically detects and adds significant moments to a user''s passport timeline';
COMMENT ON FUNCTION public.backfill_passport_timeline() IS 'Backfills passport timeline for all existing users with reviews';
COMMENT ON FUNCTION public.trigger_auto_populate_timeline_on_review() IS 'Trigger function to auto-populate timeline when a review is published';


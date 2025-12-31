-- ============================================
-- COMPLETE TIMELINE UPDATE - ALL FUNCTIONS AND BACKFILL
-- Removes all city logic, uses venue name matching only
-- Run this entire file to update functions and backfill timeline
-- ============================================

-- ============================================
-- STEP 1: UPDATE AUTO-POPULATE FUNCTION
-- ============================================

DROP TRIGGER IF EXISTS trigger_auto_populate_timeline_on_review ON public.reviews;
DROP FUNCTION IF EXISTS public.trigger_auto_populate_timeline_on_review();
DROP FUNCTION IF EXISTS public.auto_populate_passport_timeline(UUID);

-- Simplified function to auto-populate timeline for automatic milestones only
CREATE OR REPLACE FUNCTION public.auto_populate_passport_timeline(
  p_user_id UUID
)
RETURNS TABLE(
  highlights_added INTEGER,
  first_review INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review RECORD;
  v_artist_id UUID;
  v_venue_id UUID;
  v_artist_name TEXT;
  v_venue_name TEXT;
  v_event_name TEXT;
  v_first_review INTEGER := 0;
  v_total_added INTEGER := 0;
  v_review_count INTEGER;
  v_is_first_review BOOLEAN;
BEGIN
  -- Process all non-draft reviews for this user
  FOR v_review IN
    SELECT 
      r.id,
      r.user_id,
      r.event_id,
      r.artist_id,
      r.venue_id,
      r.created_at,
      COALESCE(e.artist_id, r.artist_id) as resolved_artist_id,
      COALESCE(e.venue_id, r.venue_id) as resolved_venue_id
    FROM public.reviews r
    LEFT JOIN public.events e ON e.id = r.event_id
    WHERE r.user_id = p_user_id
      AND r.is_draft = false
      AND (r.was_there = true OR r.review_text IS NOT NULL)
    ORDER BY r.created_at ASC
  LOOP
    -- Determine primary artist/venue data for this review
    v_artist_id := v_review.resolved_artist_id;
    v_venue_id := v_review.resolved_venue_id;

    -- Skip if already in timeline
    IF EXISTS (
      SELECT 1 FROM public.passport_timeline
      WHERE user_id = p_user_id
        AND review_id = v_review.id
    ) THEN
      CONTINUE;
    END IF;
    
    -- Build Event_name from artist and venue names
    v_event_name := NULL;
    IF v_artist_id IS NOT NULL THEN
      SELECT name INTO v_artist_name FROM public.artists WHERE id = v_artist_id;
    END IF;
    IF v_venue_id IS NOT NULL THEN
      SELECT name INTO v_venue_name FROM public.venues WHERE id = v_venue_id;
    END IF;
    
    IF v_artist_name IS NOT NULL AND v_venue_name IS NOT NULL THEN
      v_event_name := v_artist_name || ' @ ' || v_venue_name;
    ELSIF v_artist_name IS NOT NULL THEN
      v_event_name := v_artist_name;
    ELSIF v_venue_name IS NOT NULL THEN
      v_event_name := v_venue_name;
    END IF;
    
    -- ============================================
    -- 1. CHECK FOR FIRST REVIEW
    -- ============================================
    
    SELECT COUNT(*) INTO v_review_count
    FROM public.reviews
    WHERE user_id = p_user_id
      AND is_draft = false
      AND (was_there = true OR review_text IS NOT NULL)
      AND created_at < v_review.created_at;
    
    v_is_first_review := (v_review_count = 0);
    
    IF v_is_first_review THEN
      INSERT INTO public.passport_timeline (
        user_id,
        review_id,
        is_auto_selected,
        significance,
        "Event_name",
        created_at
      )
      SELECT
        p_user_id,
        v_review.id,
        true,
        'First review',
        v_event_name,
        v_review.created_at
      WHERE NOT EXISTS (
        SELECT 1 FROM public.passport_timeline
        WHERE user_id = p_user_id AND review_id = v_review.id
      );
      
      IF FOUND THEN
        v_first_review := v_first_review + 1;
        v_total_added := v_total_added + 1;
      END IF;
      
      CONTINUE; -- Only mark one milestone per review
    END IF;
    
    -- Removed "first favorite artist" and "first favorite venue" milestones
    -- These required artist_follows and venue_follows tables which don't exist
    -- Only tracking "first review" milestone automatically
  END LOOP;
  
  RETURN QUERY SELECT 
    v_total_added,
    v_first_review;
END;
$$;

-- ============================================
-- STEP 2: CREATE TRIGGER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.trigger_auto_populate_timeline_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result RECORD;
BEGIN
  -- Only run if the review is being published (not a draft)
  IF NEW.is_draft = false THEN
    -- Call the auto-populate function for the user who created the review
    SELECT * INTO v_result
    FROM public.auto_populate_passport_timeline(NEW.user_id);
    
    RAISE NOTICE 'Auto-populated timeline for user % on review %: added % highlights', NEW.user_id, NEW.id, v_result.highlights_added;
  END IF;
  
  RETURN NEW;
END;
$$;

-- ============================================
-- STEP 3: CREATE TRIGGER
-- ============================================

CREATE TRIGGER trigger_auto_populate_timeline_on_review
  AFTER INSERT OR UPDATE OF is_draft ON public.reviews
  FOR EACH ROW
  WHEN (NEW.is_draft = false)
  EXECUTE FUNCTION public.trigger_auto_populate_timeline_on_review();

-- ============================================
-- STEP 4: GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.auto_populate_passport_timeline(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_auto_populate_timeline_on_review() TO authenticated;

-- ============================================
-- STEP 5: BACKFILL TIMELINE FOR ALL USERS
-- ============================================

DO $$
DECLARE
  v_user RECORD;
  v_result RECORD;
  v_users_processed INTEGER := 0;
  v_total_highlights INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting timeline backfill for all users...';
  
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
  
  RAISE NOTICE 'Timeline backfill completed. Processed % users, added % total highlights.', v_users_processed, v_total_highlights;
  
  -- Also backfill Event_name for all timeline entries
  RAISE NOTICE 'Starting Event_name backfill for timeline entries...';
  
  UPDATE public.passport_timeline pt
  SET "Event_name" = subquery.event_name,
      updated_at = now()
  FROM (
    SELECT 
      pt2.id,
      CASE
        WHEN a.name IS NOT NULL AND v.name IS NOT NULL THEN a.name || ' @ ' || v.name
        WHEN a.name IS NOT NULL THEN a.name
        WHEN v.name IS NOT NULL THEN v.name
        ELSE NULL
      END AS event_name
    FROM public.passport_timeline pt2
    LEFT JOIN public.reviews r ON r.id = pt2.review_id
    LEFT JOIN public.events e ON e.id = r.event_id
    -- Prefer artist/venue from events table, fallback to review's artist/venue
    LEFT JOIN public.artists a ON a.id = COALESCE(e.artist_id, r.artist_id)
    LEFT JOIN public.venues v ON v.id = COALESCE(e.venue_id, r.venue_id)
    WHERE pt2."Event_name" IS NULL
      AND pt2.review_id IS NOT NULL
  ) subquery
  WHERE pt.id = subquery.id
    AND pt."Event_name" IS NULL;
  
  RAISE NOTICE 'Event_name backfill completed.';
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TIMELINE UPDATE COMPLETE!';
  RAISE NOTICE 'Functions updated and timeline backfilled.';
  RAISE NOTICE '========================================';
  
END $$;


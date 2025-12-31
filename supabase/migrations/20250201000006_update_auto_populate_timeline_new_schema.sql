-- ============================================
-- UPDATE AUTO-POPULATE TIMELINE FOR NEW SCHEMA
-- Only mark true milestones: first_review, first_favorite_artist, first_favorite_venue
-- Auto-populate Event_name from Artists.name and Venues.name
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
  first_review INTEGER,
  first_favorite_artist INTEGER,
  first_favorite_venue INTEGER
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
  v_first_favorite_artist INTEGER := 0;
  v_first_favorite_venue INTEGER := 0;
  v_total_added INTEGER := 0;
  v_review_count INTEGER;
  v_is_first_review BOOLEAN;
  v_is_first_favorite_artist BOOLEAN;
  v_is_first_favorite_venue BOOLEAN;
  v_is_following_artist BOOLEAN;
  v_is_following_venue BOOLEAN;
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
    
    -- ============================================
    -- 2. CHECK FOR FIRST FAVORITE ARTIST
    -- ============================================
    
    IF v_artist_id IS NOT NULL THEN
      -- Check if user is following this artist (was following at the time of the review)
      SELECT EXISTS (
        SELECT 1 FROM public.artist_follows
        WHERE user_id = p_user_id
          AND artist_id = v_artist_id
          AND created_at <= v_review.created_at
      ) INTO v_is_following_artist;
      
      -- Check if this is first time seeing this favorite artist
      IF v_is_following_artist THEN
        -- Check if there's already a timeline entry for first time seeing this artist
        SELECT COUNT(*) INTO v_review_count
        FROM public.passport_timeline
        WHERE user_id = p_user_id
          AND significance LIKE 'First time seeing %'
          AND review_id IN (
            SELECT id FROM public.reviews
            WHERE user_id = p_user_id
              AND artist_id = v_artist_id
              AND created_at < v_review.created_at
              AND is_draft = false
              AND (was_there = true OR review_text IS NOT NULL)
          );
        
        v_is_first_favorite_artist := (v_review_count = 0);
        
        IF v_is_first_favorite_artist THEN
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
            'First time seeing ' || COALESCE(v_artist_name, 'this artist'),
            v_event_name,
            v_review.created_at
          WHERE NOT EXISTS (
            SELECT 1 FROM public.passport_timeline
            WHERE user_id = p_user_id AND review_id = v_review.id
          );
          
          GET DIAGNOSTICS v_review_count = ROW_COUNT;
          IF v_review_count > 0 THEN
            v_first_favorite_artist := v_first_favorite_artist + 1;
            v_total_added := v_total_added + 1;
          END IF;
          
          CONTINUE; -- Only mark one milestone per review
        END IF;
      END IF;
    END IF;
    
    -- ============================================
    -- 3. CHECK FOR FIRST FAVORITE VENUE
    -- ============================================
    
    IF v_venue_id IS NOT NULL AND v_venue_name IS NOT NULL THEN
      -- Check if user is following this venue (by name, was following at the time of the review)
      SELECT EXISTS (
        SELECT 1 FROM public.venue_follows
        WHERE user_id = p_user_id
          AND venue_name = v_venue_name
          AND created_at <= v_review.created_at
      ) INTO v_is_following_venue;
      
      -- Check if this is first time at this favorite venue
      IF v_is_following_venue THEN
        -- Check if there's already a timeline entry for first time at this venue
        SELECT COUNT(*) INTO v_review_count
        FROM public.passport_timeline
        WHERE user_id = p_user_id
          AND significance LIKE 'First time at %'
          AND review_id IN (
            SELECT id FROM public.reviews
            WHERE user_id = p_user_id
              AND venue_id = v_venue_id
              AND created_at < v_review.created_at
              AND is_draft = false
              AND (was_there = true OR review_text IS NOT NULL)
          );
        
        v_is_first_favorite_venue := (v_review_count = 0);
        
        IF v_is_first_favorite_venue THEN
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
            'First time at ' || v_venue_name,
            v_event_name,
            v_review.created_at
          WHERE NOT EXISTS (
            SELECT 1 FROM public.passport_timeline
            WHERE user_id = p_user_id AND review_id = v_review.id
          );
          
          GET DIAGNOSTICS v_review_count = ROW_COUNT;
          IF v_review_count > 0 THEN
            v_first_favorite_venue := v_first_favorite_venue + 1;
            v_total_added := v_total_added + 1;
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT 
    v_total_added,
    v_first_review,
    v_first_favorite_artist,
    v_first_favorite_venue;
END;
$$;

-- Trigger function
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

-- Create the trigger
CREATE TRIGGER trigger_auto_populate_timeline_on_review
  AFTER INSERT OR UPDATE OF is_draft ON public.reviews
  FOR EACH ROW
  WHEN (NEW.is_draft = false)
  EXECUTE FUNCTION public.trigger_auto_populate_timeline_on_review();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.auto_populate_passport_timeline(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_auto_populate_timeline_on_review() TO authenticated;


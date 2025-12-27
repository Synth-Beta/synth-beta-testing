-- ============================================
-- ENHANCE PASSPORT TRIGGERS
-- Update auto-unlock triggers to detect festivals, milestones, achievements
-- ============================================

-- Enhanced trigger function to auto-unlock passport entries and detect achievements
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
    -- Get event details - use JamBase IDs
    SELECT 
      e.venue_city,
      e.venue_state,
      e.venue_id, -- JamBase venue ID (preferred)
      e.venue_name,
      e.artist_id, -- JamBase artist ID (preferred)
      e.artist_name,
      e.title,
      e.id as event_id
    INTO v_event_data
    FROM public.events e
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

      -- Trigger taste map recalculation (async-friendly, can be batched)
      -- We'll recalculate on-demand or via periodic job
      -- PERFORM public.calculate_taste_map(NEW.user_id);

      -- Check for deep cut reviewer achievement (after review is saved)
      IF NEW.review_text IS NOT NULL AND NEW.review_text != 'ATTENDANCE_ONLY' THEN
        PERFORM public.detect_deep_cut_reviewer(NEW.user_id);
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function to auto-select timeline highlights (called periodically or on-demand)
CREATE OR REPLACE FUNCTION public.auto_select_timeline_highlights(p_user_id UUID, p_limit INTEGER DEFAULT 10)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event RECORD;
  v_significance_score NUMERIC;
  v_count INTEGER := 0;
BEGIN
  -- Clear existing auto-selected highlights (keep pinned ones)
  DELETE FROM public.passport_timeline
  WHERE user_id = p_user_id
    AND is_auto_selected = true
    AND is_pinned = false;

  -- Select top events by significance score
  FOR v_event IN
    SELECT 
      e.id as event_id,
      r.id as review_id,
      -- Significance score based on:
      -- - Review rating (higher = more significant)
      -- - Review text length (longer = more thoughtful)
      -- - Likes count (social validation)
      -- - Artist milestone (first time seeing artist = significant)
      -- - Venue rarity (iconic venues = significant)
      (
        COALESCE(r.rating, 3) * 2.0 +
        COALESCE(LENGTH(r.review_text), 0) / 100.0 +
        COALESCE(r.likes_count, 0) * 1.5 +
        CASE WHEN pe_artist.id IS NULL THEN 5 ELSE 0 END +  -- First time seeing artist
        CASE WHEN pe_venue.rarity = 'legendary' THEN 10
             WHEN pe_venue.rarity = 'uncommon' THEN 5
             ELSE 0 END
      ) as significance_score
    FROM public.events e
    INNER JOIN public.reviews r ON r.event_id = e.id 
      AND r.user_id = p_user_id 
      AND r.was_there = true
    LEFT JOIN public.external_entity_ids eei_artist ON eei_artist.entity_uuid = e.artist_id 
      AND eei_artist.entity_type = 'artist' 
      AND eei_artist.source = 'jambase'
    LEFT JOIN public.passport_entries pe_artist ON pe_artist.user_id = p_user_id
      AND pe_artist.type = 'artist'
      AND pe_artist.entity_id = COALESCE(eei_artist.external_id, e.artist_id::TEXT)
      AND pe_artist.unlocked_at <= e.event_date  -- Unlocked before or at event date
    LEFT JOIN public.external_entity_ids eei_venue ON eei_venue.entity_uuid = e.venue_id 
      AND eei_venue.entity_type = 'venue' 
      AND eei_venue.source = 'jambase'
    LEFT JOIN public.passport_entries pe_venue ON pe_venue.user_id = p_user_id
      AND pe_venue.type = 'venue'
      AND pe_venue.entity_id = COALESCE(eei_venue.external_id, e.venue_id::TEXT)
    WHERE r.is_public = true
      OR r.review_text IS NOT NULL
    ORDER BY significance_score DESC
    LIMIT p_limit
  LOOP
    -- Insert auto-selected highlight
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
      v_event.event_id,
      v_event.review_id,
      true,
      CASE 
        WHEN v_event.significance_score >= 20 THEN 'Major moment in your live music journey'
        WHEN v_event.significance_score >= 15 THEN 'Memorable show with high engagement'
        ELSE 'Significant event in your concert history'
      END,
      now()
    )
    ON CONFLICT DO NOTHING;

    v_count := v_count + 1;
  END LOOP;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.auto_select_timeline_highlights(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.auto_select_timeline_highlights IS 'Auto-selects timeline highlights based on significance score (rating, review length, engagement, milestones)';


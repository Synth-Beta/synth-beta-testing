-- ============================================
-- BACKFILL TIMELINE WITH SIGNIFICANT EVENTS
-- Calls auto_populate_passport_timeline for all users
-- This will add: first review, first favorite artist, first favorite venue
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
  
END $$;


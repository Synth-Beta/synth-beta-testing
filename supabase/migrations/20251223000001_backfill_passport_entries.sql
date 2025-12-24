-- Backfill passport entries from existing reviews and event interests
-- This migration populates passport_entries for all existing user activity
-- Safe to run multiple times (idempotent) - uses ON CONFLICT DO NOTHING

-- Backfill from reviews (non-draft reviews where user attended or wrote review)
DO $$
DECLARE
  review_record RECORD;
  event_record RECORD;
  unlocked_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting passport backfill from reviews...';
  
  -- Process all non-draft reviews
  FOR review_record IN
    SELECT DISTINCT
      r.user_id,
      r.event_id,
      r.created_at
    FROM public.reviews r
    WHERE r.is_draft = false
      AND (r.was_there = true OR r.review_text IS NOT NULL)
      AND r.event_id IS NOT NULL
    ORDER BY r.created_at ASC
  LOOP
    -- Get event details - use JamBase IDs
    SELECT 
      e.venue_city,
      e.venue_state,
      e.venue_id, -- JamBase venue ID (preferred)
      e.venue_name,
      e.artist_id, -- JamBase artist ID (preferred)
      e.artist_name
    INTO event_record
    FROM public.events e
    WHERE e.id = review_record.event_id;
    
    IF event_record IS NOT NULL THEN
      -- Unlock city (skip if "Unknown")
      IF event_record.venue_city IS NOT NULL 
         AND LOWER(TRIM(event_record.venue_city)) != 'unknown' THEN
        PERFORM public.unlock_passport_city(
          review_record.user_id,
          event_record.venue_city,
          event_record.venue_state
        );
        unlocked_count := unlocked_count + 1;
      END IF;
      
      -- Unlock venue using JamBase venue_id
      IF event_record.venue_name IS NOT NULL THEN
        PERFORM public.unlock_passport_venue(
          review_record.user_id,
          event_record.venue_id, -- Use JamBase ID instead of UUID
          event_record.venue_name
        );
        unlocked_count := unlocked_count + 1;
      END IF;
      
      -- Unlock artist (use name even if ID is null)
      IF event_record.artist_name IS NOT NULL THEN
        PERFORM public.unlock_passport_artist(
          review_record.user_id,
          COALESCE(event_record.artist_id::TEXT, NULL),
          event_record.artist_name
        );
        unlocked_count := unlocked_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Completed review backfill. Processed % passport unlocks.', unlocked_count;
END $$;

-- Backfill from event interests (cities only for interests)
DO $$
DECLARE
  interest_record RECORD;
  event_record RECORD;
  unlocked_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting passport backfill from event interests...';
  
  -- Process all event interests that haven't been covered by reviews
  FOR interest_record IN
    SELECT DISTINCT
      uer.user_id,
      uer.event_id
    FROM public.user_event_relationships uer
    WHERE uer.relationship_type = 'interest'
      AND uer.event_id IS NOT NULL
      -- Only process if user doesn't already have a review for this event
      AND NOT EXISTS (
        SELECT 1
        FROM public.reviews r
        WHERE r.user_id = uer.user_id
          AND r.event_id = uer.event_id
          AND r.is_draft = false
      )
  LOOP
    -- Get event details
    SELECT 
      e.venue_city,
      e.venue_state,
      e.venue_uuid,
      e.venue_name,
      e.artist_id,
      e.artist_name
    INTO event_record
    FROM public.events e
    WHERE e.id = interest_record.event_id;
    
    IF event_record IS NOT NULL THEN
      -- Unlock city (skip if "Unknown")
      IF event_record.venue_city IS NOT NULL 
         AND LOWER(TRIM(event_record.venue_city)) != 'unknown' THEN
        PERFORM public.unlock_passport_city(
          interest_record.user_id,
          event_record.venue_city,
          event_record.venue_state
        );
        unlocked_count := unlocked_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Completed interest backfill. Processed % city unlocks.', unlocked_count;
END $$;

-- Summary query to show what was backfilled
DO $$
DECLARE
  total_entries INTEGER;
  cities_count INTEGER;
  venues_count INTEGER;
  artists_count INTEGER;
  scenes_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_entries FROM public.passport_entries;
  SELECT COUNT(*) INTO cities_count FROM public.passport_entries WHERE type = 'city';
  SELECT COUNT(*) INTO venues_count FROM public.passport_entries WHERE type = 'venue';
  SELECT COUNT(*) INTO artists_count FROM public.passport_entries WHERE type = 'artist';
  SELECT COUNT(*) INTO scenes_count FROM public.passport_entries WHERE type = 'scene';
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Passport Backfill Complete!';
  RAISE NOTICE 'Total entries: %', total_entries;
  RAISE NOTICE '  - Cities: %', cities_count;
  RAISE NOTICE '  - Venues: %', venues_count;
  RAISE NOTICE '  - Artists: %', artists_count;
  RAISE NOTICE '  - Scenes: %', scenes_count;
  RAISE NOTICE '========================================';
END $$;


-- ============================================
-- Remove Seed/Test Events and Reviews
-- ============================================
-- This migration removes fake/test events and reviews created by seed scripts
-- It identifies test data by jambase_event_id patterns from seed scripts

-- Step 1: Delete user_event_relationships for test events
-- (from both old jambase_events and new events tables)
DELETE FROM public.user_event_relationships
WHERE event_id IN (
  SELECT id FROM public.events
  WHERE jambase_event_id LIKE 'sample_event_%'
     OR jambase_event_id LIKE 'beatles-%'
     OR jambase_event_id LIKE 'radiohead-%'
     OR jambase_event_id LIKE 'pinkfloyd-%'
     OR jambase_event_id LIKE 'goose-%'
     OR jambase_event_id LIKE 'taylorswift-%'
     OR jambase_event_id LIKE 'drake-%'
     OR jambase_event_id LIKE 'billie-%'
     OR jambase_event_id LIKE 'weeknd-%'
     OR jambase_event_id LIKE 'ariana-%'
     OR jambase_event_id LIKE 'taylor-swift-msg-2024'
     OR jambase_event_id LIKE 'drake-rogers-2024'
     OR jambase_event_id LIKE 'billie-eilish-%'
     OR jambase_event_id LIKE 'the-weeknd-%'
     OR jambase_event_id LIKE 'ariana-grande-%'
     OR jambase_event_id LIKE 'metallica-%'
     OR jambase_event_id = 'past-1'
     OR jambase_event_id = 'past-2'
);

-- Step 2: Delete reviews for test events
DELETE FROM public.reviews
WHERE event_id IN (
  SELECT id FROM public.events
  WHERE jambase_event_id LIKE 'sample_event_%'
     OR jambase_event_id LIKE 'beatles-%'
     OR jambase_event_id LIKE 'radiohead-%'
     OR jambase_event_id LIKE 'pinkfloyd-%'
     OR jambase_event_id LIKE 'goose-%'
     OR jambase_event_id LIKE 'taylorswift-%'
     OR jambase_event_id LIKE 'drake-%'
     OR jambase_event_id LIKE 'billie-%'
     OR jambase_event_id LIKE 'weeknd-%'
     OR jambase_event_id LIKE 'ariana-%'
     OR jambase_event_id LIKE 'taylor-swift-msg-2024'
     OR jambase_event_id LIKE 'drake-rogers-2024'
     OR jambase_event_id LIKE 'billie-eilish-%'
     OR jambase_event_id LIKE 'the-weeknd-%'
     OR jambase_event_id LIKE 'ariana-grande-%'
     OR jambase_event_id LIKE 'metallica-%'
     OR jambase_event_id = 'past-1'
     OR jambase_event_id = 'past-2'
);

-- Step 3: Delete test events from the new events table
DELETE FROM public.events
WHERE jambase_event_id LIKE 'sample_event_%'
   OR jambase_event_id LIKE 'beatles-%'
   OR jambase_event_id LIKE 'radiohead-%'
   OR jambase_event_id LIKE 'pinkfloyd-%'
   OR jambase_event_id LIKE 'goose-%'
   OR jambase_event_id LIKE 'taylorswift-%'
   OR jambase_event_id LIKE 'drake-%'
   OR jambase_event_id LIKE 'billie-%'
   OR jambase_event_id LIKE 'weeknd-%'
   OR jambase_event_id LIKE 'ariana-%'
   OR jambase_event_id LIKE 'taylor-swift-msg-2024'
   OR jambase_event_id LIKE 'drake-rogers-2024'
   OR jambase_event_id LIKE 'billie-eilish-%'
   OR jambase_event_id LIKE 'the-weeknd-%'
   OR jambase_event_id LIKE 'ariana-grande-%'
   OR jambase_event_id LIKE 'metallica-%'
   OR jambase_event_id = 'past-1'
   OR jambase_event_id = 'past-2';

-- Step 4: Also clean up old jambase_events table if it still exists
-- (for backward compatibility)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jambase_events') THEN
    DELETE FROM public.jambase_events
    WHERE jambase_event_id LIKE 'sample_event_%'
       OR jambase_event_id LIKE 'beatles-%'
       OR jambase_event_id LIKE 'radiohead-%'
       OR jambase_event_id LIKE 'pinkfloyd-%'
       OR jambase_event_id LIKE 'goose-%'
       OR jambase_event_id LIKE 'taylorswift-%'
       OR jambase_event_id LIKE 'drake-%'
       OR jambase_event_id LIKE 'billie-%'
       OR jambase_event_id LIKE 'weeknd-%'
       OR jambase_event_id LIKE 'ariana-%'
       OR jambase_event_id LIKE 'taylor-swift-msg-2024'
       OR jambase_event_id LIKE 'drake-rogers-2024'
       OR jambase_event_id LIKE 'billie-eilish-%'
       OR jambase_event_id LIKE 'the-weeknd-%'
       OR jambase_event_id LIKE 'ariana-grande-%'
       OR jambase_event_id LIKE 'metallica-%'
       OR jambase_event_id = 'past-1'
       OR jambase_event_id = 'past-2';
  END IF;
END $$;

-- Return summary of what was deleted
DO $$
DECLARE
  events_deleted INT;
  reviews_deleted INT;
  relationships_deleted INT;
BEGIN
  -- Count what was deleted (approximate, since we can't count after deletion)
  SELECT COUNT(*) INTO events_deleted
  FROM public.events
  WHERE jambase_event_id LIKE 'sample_event_%'
     OR jambase_event_id LIKE 'beatles-%'
     OR jambase_event_id LIKE 'radiohead-%'
     OR jambase_event_id LIKE 'pinkfloyd-%'
     OR jambase_event_id LIKE 'goose-%'
     OR jambase_event_id LIKE 'taylorswift-%'
     OR jambase_event_id LIKE 'drake-%'
     OR jambase_event_id LIKE 'billie-%'
     OR jambase_event_id LIKE 'weeknd-%'
     OR jambase_event_id LIKE 'ariana-%'
     OR jambase_event_id LIKE 'taylor-swift-msg-2024'
     OR jambase_event_id LIKE 'drake-rogers-2024'
     OR jambase_event_id LIKE 'billie-eilish-%'
     OR jambase_event_id LIKE 'the-weeknd-%'
     OR jambase_event_id LIKE 'ariana-grande-%'
     OR jambase_event_id LIKE 'metallica-%'
     OR jambase_event_id = 'past-1'
     OR jambase_event_id = 'past-2';
  
  RAISE NOTICE 'Test data cleanup complete. Remaining test events: %', events_deleted;
END $$;


-- Backfill missing artist_id and venue_id in user_reviews
-- This migration populates the artist_id and venue_id UUID columns in user_reviews
-- by querying the related jambase_events records

-- Backfill artist_id from jambase_events.artist_uuid (simple case)
UPDATE user_reviews ur
SET artist_id = je.artist_uuid
FROM jambase_events je
WHERE ur.event_id = je.id
  AND ur.artist_id IS NULL
  AND je.artist_uuid IS NOT NULL;

-- Backfill venue_id from jambase_events.venue_uuid (where not already set)
UPDATE user_reviews ur
SET venue_id = je.venue_uuid
FROM jambase_events je
WHERE ur.event_id = je.id
  AND ur.venue_id IS NULL
  AND je.venue_uuid IS NOT NULL;

-- Log the results
DO $$
DECLARE
  artist_count INTEGER;
  venue_count INTEGER;
BEGIN
  -- Count how many records were updated
  SELECT COUNT(*) INTO artist_count
  FROM user_reviews ur
  JOIN jambase_events je ON ur.event_id = je.id
  WHERE ur.artist_id = je.artist_uuid
    AND je.artist_uuid IS NOT NULL;
  
  SELECT COUNT(*) INTO venue_count
  FROM user_reviews ur
  JOIN jambase_events je ON ur.event_id = je.id
  WHERE ur.venue_id = je.venue_uuid
    AND je.venue_uuid IS NOT NULL;
  
  RAISE NOTICE 'Backfilled % reviews with artist_id', artist_count;
  RAISE NOTICE 'Backfilled % reviews with venue_id', venue_count;
END $$;





-- ============================================
-- NORMALIZE jambase_events TABLE (FIXED VERSION)
-- Properly link artist_uuid and ensure venue_id is correctly set
-- ============================================

-- Step 1: Check current state and ensure artist_uuid exists
DO $$
BEGIN
  -- Add artist_uuid column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'jambase_events' AND column_name = 'artist_uuid'
  ) THEN
    ALTER TABLE public.jambase_events 
    ADD COLUMN artist_uuid UUID REFERENCES public.artists(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_jambase_events_artist_uuid 
      ON public.jambase_events(artist_uuid);
    RAISE NOTICE 'Created artist_uuid column and index';
  END IF;

  -- Note: venue_id already exists as UUID in your schema, so we don't need venue_uuid
  -- Just ensure the index exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'jambase_events' AND indexname = 'idx_jambase_events_venue_id'
  ) THEN
    CREATE INDEX idx_jambase_events_venue_id ON public.jambase_events(venue_id);
    RAISE NOTICE 'Created venue_id index';
  END IF;
END $$;

-- Step 2: Create or replace function to populate artist_uuid and venue_id
CREATE OR REPLACE FUNCTION public.populate_artist_venue_uuids_from_jambase()
RETURNS TABLE(
  events_total INT,
  events_with_artist INT,
  events_with_venue INT,
  artist_name_matches INT,
  artist_id_matches INT,
  venue_name_matches INT,
  venue_id_matches INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_total INT;
  v_with_artist INT;
  v_with_venue INT;
  v_artist_name_matches INT := 0;
  v_artist_id_matches INT := 0;
  v_venue_name_matches INT := 0;
  v_venue_id_matches INT := 0;
BEGIN
  -- Count totals
  SELECT COUNT(*) INTO v_total FROM public.jambase_events;
  
  -- Update artist_uuid by matching artist_name (case-insensitive, trimmed)
  WITH updated AS (
    UPDATE public.jambase_events je
    SET artist_uuid = a.id
    FROM public.artists a
    WHERE LOWER(TRIM(je.artist_name)) = LOWER(TRIM(a.name))
      AND je.artist_uuid IS NULL
      AND je.artist_name IS NOT NULL
      AND TRIM(je.artist_name) != ''
    RETURNING je.id
  )
  SELECT COUNT(*) INTO v_artist_name_matches FROM updated;
  
  -- Match by jambase_artist_id (text field in artists table)
  -- Note: artist_id in jambase_events is TEXT type
  WITH updated AS (
    UPDATE public.jambase_events je
    SET artist_uuid = a.id
    FROM public.artists a
    WHERE je.artist_id = a.jambase_artist_id
      AND je.artist_uuid IS NULL
      AND je.artist_id IS NOT NULL
      AND a.jambase_artist_id IS NOT NULL
      AND TRIM(je.artist_id) != ''
    RETURNING je.id
  )
  SELECT COUNT(*) INTO v_artist_id_matches FROM updated;
  
  -- Update venue_id by matching venue_name (case-insensitive, trimmed)
  -- venue_id is already UUID type in jambase_events
  WITH updated AS (
    UPDATE public.jambase_events je
    SET venue_id = v.id
    FROM public.venues v
    WHERE LOWER(TRIM(je.venue_name)) = LOWER(TRIM(v.name))
      AND je.venue_id IS NULL
      AND je.venue_name IS NOT NULL
      AND TRIM(je.venue_name) != ''
    RETURNING je.id
  )
  SELECT COUNT(*) INTO v_venue_name_matches FROM updated;
  
  -- Match venues by jambase_venue_id if available
  -- Note: This depends on whether jambase_events has a text field for jambase venue ID
  -- Your schema doesn't show one, so commenting this out
  /*
  WITH updated AS (
    UPDATE public.jambase_events je
    SET venue_id = v.id
    FROM public.venues v
    WHERE je.jambase_venue_id = v.jambase_venue_id
      AND je.venue_id IS NULL
      AND je.jambase_venue_id IS NOT NULL
    RETURNING je.id
  )
  SELECT COUNT(*) INTO v_venue_id_matches FROM updated;
  */
  
  -- Count final results
  SELECT COUNT(*) INTO v_with_artist 
  FROM public.jambase_events 
  WHERE artist_uuid IS NOT NULL;
  
  SELECT COUNT(*) INTO v_with_venue 
  FROM public.jambase_events 
  WHERE venue_id IS NOT NULL;
  
  RAISE NOTICE 'Populated artist_uuid and venue_id';
  RAISE NOTICE 'Total events: %', v_total;
  RAISE NOTICE 'Artist matches by name: %', v_artist_name_matches;
  RAISE NOTICE 'Artist matches by ID: %', v_artist_id_matches;
  RAISE NOTICE 'Venue matches by name: %', v_venue_name_matches;
  RAISE NOTICE 'Events with artist_uuid: % (%.2f%%)', 
    v_with_artist, 
    ROUND(v_with_artist * 100.0 / NULLIF(v_total, 0), 2);
  RAISE NOTICE 'Events with venue_id: % (%.2f%%)', 
    v_with_venue,
    ROUND(v_with_venue * 100.0 / NULLIF(v_total, 0), 2);
  
  RETURN QUERY SELECT 
    v_total, 
    v_with_artist, 
    v_with_venue,
    v_artist_name_matches,
    v_artist_id_matches,
    v_venue_name_matches,
    v_venue_id_matches;
END;
$$;

-- Step 3: Run the population function and show results
DO $$
DECLARE
  result RECORD;
BEGIN
  SELECT * INTO result FROM public.populate_artist_venue_uuids_from_jambase();
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '=== NORMALIZATION RESULTS ===';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total events: %', result.events_total;
  RAISE NOTICE '';
  RAISE NOTICE 'ARTIST LINKING:';
  RAISE NOTICE '  - Matched by name: %', result.artist_name_matches;
  RAISE NOTICE '  - Matched by ID: %', result.artist_id_matches;
  RAISE NOTICE '  - Total with artist_uuid: % (%.2f%%)', 
    result.events_with_artist,
    ROUND(result.events_with_artist * 100.0 / NULLIF(result.events_total, 0), 2);
  RAISE NOTICE '';
  RAISE NOTICE 'VENUE LINKING:';
  RAISE NOTICE '  - Matched by name: %', result.venue_name_matches;
  RAISE NOTICE '  - Total with venue_id: % (%.2f%%)', 
    result.events_with_venue,
    ROUND(result.events_with_venue * 100.0 / NULLIF(result.events_total, 0), 2);
  RAISE NOTICE '========================================';
END $$;

-- Step 4: Add comments for documentation
COMMENT ON COLUMN public.jambase_events.artist_id IS 
  'JamBase API artist ID (TEXT) - kept for API compatibility and matching';
COMMENT ON COLUMN public.jambase_events.artist_uuid IS 
  'Foreign key to artists table (UUID) - ALWAYS use this for joins';
COMMENT ON COLUMN public.jambase_events.venue_id IS 
  'Foreign key to venues table (UUID) - ALWAYS use this for joins';
COMMENT ON COLUMN public.jambase_events.artist_name IS 
  'Denormalized artist name - kept for quick queries and display';
COMMENT ON COLUMN public.jambase_events.venue_name IS 
  'Denormalized venue name - kept for quick queries and display';

-- Step 5: Verification queries
-- Run these to check the status and find unmatched records

-- Check overall matching status
SELECT 
  'Events with artist_uuid' as metric,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM jambase_events), 2) as percentage
FROM jambase_events 
WHERE artist_uuid IS NOT NULL

UNION ALL

SELECT 
  'Events with venue_id' as metric,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM jambase_events), 2) as percentage
FROM jambase_events 
WHERE venue_id IS NOT NULL

UNION ALL

SELECT 
  'Total events' as metric,
  COUNT(*) as count,
  100.00 as percentage
FROM jambase_events;

-- Find events without artist matches (for troubleshooting)
/*
SELECT 
  artist_name,
  artist_id,
  COUNT(*) as event_count
FROM jambase_events
WHERE artist_uuid IS NULL
  AND artist_name IS NOT NULL
GROUP BY artist_name, artist_id
ORDER BY event_count DESC
LIMIT 20;
*/

-- Find events without venue matches (for troubleshooting)
/*
SELECT 
  venue_name,
  venue_city,
  venue_state,
  COUNT(*) as event_count
FROM jambase_events
WHERE venue_id IS NULL
  AND venue_name IS NOT NULL
GROUP BY venue_name, venue_city, venue_state
ORDER BY event_count DESC
LIMIT 20;
*/

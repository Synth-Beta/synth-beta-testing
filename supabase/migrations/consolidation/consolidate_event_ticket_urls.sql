-- ============================================
-- CONSOLIDATE event_ticket_urls INTO event_tickets
-- ============================================
-- This script migrates data from event_ticket_urls to event_tickets
-- Extracts provider information from URLs and sets appropriate defaults

-- ============================================
-- PART A: CREATE HELPER FUNCTION TO EXTRACT PROVIDER FROM URL
-- ============================================
CREATE OR REPLACE FUNCTION extract_ticket_provider_from_url(url TEXT)
RETURNS TEXT AS $$
BEGIN
  IF url IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Extract provider from URL based on common patterns
  IF url ILIKE '%ticketmaster%' THEN
    RETURN 'ticketmaster';
  ELSIF url ILIKE '%seatgeek%' THEN
    RETURN 'seatgeek';
  ELSIF url ILIKE '%stubhub%' THEN
    RETURN 'stubhub';
  ELSIF url ILIKE '%viagogo%' THEN
    RETURN 'viagogo';
  ELSIF url ILIKE '%axs%' THEN
    RETURN 'axs';
  ELSIF url ILIKE '%eventbrite%' THEN
    RETURN 'eventbrite';
  ELSIF url ILIKE '%dice%' THEN
    RETURN 'dice';
  ELSIF url ILIKE '%ticketweb%' THEN
    RETURN 'ticketweb';
  ELSIF url ILIKE '%ticketfly%' THEN
    RETURN 'ticketfly';
  ELSIF url ILIKE '%brownpapertickets%' THEN
    RETURN 'brownpapertickets';
  ELSE
    RETURN 'other';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- PART B: MIGRATE DATA FROM event_ticket_urls TO event_tickets
-- ============================================
DO $$
DECLARE
  migrated_count INTEGER;
  source_count INTEGER;
  skipped_count INTEGER;
BEGIN
  -- Get source count
  SELECT COUNT(*) INTO source_count FROM public.event_ticket_urls;
  
  RAISE NOTICE 'Starting migration of % rows from event_ticket_urls to event_tickets', source_count;
  
  -- Migrate data
  INSERT INTO public.event_tickets (
    event_id,
    ticket_provider,
    ticket_url,
    ticket_type,
    price_min,
    price_max,
    currency,
    available_from,
    available_until,
    is_primary,
    created_at,
    updated_at
  )
  SELECT 
    etu.event_id,
    extract_ticket_provider_from_url(etu.ticket_url) as ticket_provider,
    etu.ticket_url,
    NULL as ticket_type, -- Not available in source
    NULL as price_min, -- Not available in source
    NULL as price_max, -- Not available in source
    'USD' as currency, -- Default currency
    NULL as available_from, -- Not available in source
    NULL as available_until, -- Not available in source
    false as is_primary, -- Default to false, can be updated later
    COALESCE(etu.created_at, NOW()) as created_at,
    COALESCE(etu.updated_at, NOW()) as updated_at
  FROM public.event_ticket_urls etu
  WHERE NOT EXISTS (
    -- Skip if URL already exists in event_tickets for the same event
    SELECT 1 FROM public.event_tickets et
    WHERE et.event_id = etu.event_id
      AND et.ticket_url = etu.ticket_url
  );
  
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  skipped_count := source_count - migrated_count;
  
  RAISE NOTICE 'Migration complete:';
  RAISE NOTICE '  - Migrated: % rows', migrated_count;
  RAISE NOTICE '  - Skipped (duplicates): % rows', skipped_count;
  RAISE NOTICE '  - Source total: % rows', source_count;
END $$;

-- ============================================
-- PART C: SET PRIMARY TICKET FOR EACH EVENT
-- ============================================
-- For events with multiple tickets, set the first one (by created_at) as primary
-- This can be updated later if needed
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Reset all primary flags
  UPDATE public.event_tickets SET is_primary = false;
  
  -- Set primary flag for the first ticket of each event (by created_at)
  UPDATE public.event_tickets et
  SET is_primary = true
  WHERE EXISTS (
    SELECT 1
    FROM (
      SELECT event_id, MIN(created_at) as first_created_at
      FROM public.event_tickets
      GROUP BY event_id
    ) first_tickets
    WHERE first_tickets.event_id = et.event_id
      AND first_tickets.first_created_at = et.created_at
      -- Only set if there's more than one ticket, or if it's the only one
      AND (
        (SELECT COUNT(*) FROM public.event_tickets et2 WHERE et2.event_id = et.event_id) = 1
        OR et.id = (
          SELECT id FROM public.event_tickets et3
          WHERE et3.event_id = et.event_id
          ORDER BY et3.created_at ASC
          LIMIT 1
        )
      )
  );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Set primary ticket flag for % events', updated_count;
END $$;

-- ============================================
-- PART D: VERIFICATION QUERIES
-- ============================================
SELECT 
  'Migration Verification' as verification_type,
  'event_ticket_urls' as source_table,
  (SELECT COUNT(*) FROM public.event_ticket_urls) as source_row_count,
  'event_tickets (from event_ticket_urls)' as target_table,
  (
    SELECT COUNT(*) 
    FROM public.event_tickets et
    WHERE EXISTS (
      SELECT 1 FROM public.event_ticket_urls etu
      WHERE etu.ticket_url = et.ticket_url
    )
  ) as target_row_count,
  (
    SELECT COUNT(DISTINCT etu.event_id) 
    FROM public.event_ticket_urls etu
    WHERE EXISTS (
      SELECT 1 FROM public.event_tickets et
      WHERE et.event_id = etu.event_id
        AND et.ticket_url = etu.ticket_url
    )
  ) as unique_events_migrated;

-- Check provider distribution
SELECT 
  'Provider Distribution' as analysis_type,
  ticket_provider,
  COUNT(*) as ticket_count,
  COUNT(DISTINCT event_id) as unique_events
FROM public.event_tickets
WHERE EXISTS (
  SELECT 1 FROM public.event_ticket_urls etu
  WHERE etu.ticket_url = event_tickets.ticket_url
)
GROUP BY ticket_provider
ORDER BY ticket_count DESC;

-- Check for any unmigrated URLs
SELECT 
  'Unmigrated URLs Check' as check_type,
  COUNT(*) as unmigrated_count
FROM public.event_ticket_urls etu
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_tickets et
  WHERE et.event_id = etu.event_id
    AND et.ticket_url = etu.ticket_url
);

-- ============================================
-- PART E: DROP HELPER FUNCTION (optional)
-- ============================================
-- Keep the function in case we need it later for URL processing
-- DROP FUNCTION IF EXISTS extract_ticket_provider_from_url(TEXT);


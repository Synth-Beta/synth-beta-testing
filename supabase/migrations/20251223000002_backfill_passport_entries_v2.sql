-- Improved backfill with better error handling and direct inserts
-- This version directly inserts into passport_entries instead of using functions

-- First, let's test that the table exists and we can insert
DO $$
DECLARE
  test_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO test_count FROM public.passport_entries;
  RAISE NOTICE 'Current passport entries count: %', test_count;
END $$;

-- Backfill venues and artists from reviews
INSERT INTO public.passport_entries (user_id, type, entity_id, entity_name, metadata)
SELECT DISTINCT
  r.user_id,
  'venue' as type,
  CASE 
    WHEN e.venue_id IS NOT NULL THEN e.venue_id::TEXT -- Use JamBase venue_id
    ELSE LOWER(REPLACE(TRIM(COALESCE(e.venue_name, 'Unknown Venue')), ' ', '_'))
  END as entity_id,
  e.venue_name as entity_name,
  '{}'::jsonb as metadata
FROM public.reviews r
JOIN public.events e ON e.id = r.event_id
WHERE r.is_draft = false
  AND (r.was_there = true OR r.review_text IS NOT NULL)
  AND r.event_id IS NOT NULL
  AND e.venue_name IS NOT NULL
ON CONFLICT (user_id, type, entity_id) DO NOTHING;

-- Get count after venue insert
DO $$
DECLARE
  venue_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO venue_count FROM public.passport_entries WHERE type = 'venue';
  RAISE NOTICE 'Venues inserted: %', venue_count;
END $$;

-- Backfill artists from reviews
INSERT INTO public.passport_entries (user_id, type, entity_id, entity_name, metadata)
SELECT DISTINCT
  r.user_id,
  'artist' as type,
  CASE 
    WHEN e.artist_id IS NOT NULL THEN e.artist_id::TEXT
    ELSE LOWER(REPLACE(TRIM(COALESCE(e.artist_name, 'Unknown Artist')), ' ', '_'))
  END as entity_id,
  e.artist_name as entity_name,
  '{}'::jsonb as metadata
FROM public.reviews r
JOIN public.events e ON e.id = r.event_id
WHERE r.is_draft = false
  AND (r.was_there = true OR r.review_text IS NOT NULL)
  AND r.event_id IS NOT NULL
  AND e.artist_name IS NOT NULL
ON CONFLICT (user_id, type, entity_id) DO NOTHING;

-- Get count after artist insert
DO $$
DECLARE
  artist_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO artist_count FROM public.passport_entries WHERE type = 'artist';
  RAISE NOTICE 'Artists inserted: %', artist_count;
END $$;

-- Backfill cities from reviews (skip "Unknown")
INSERT INTO public.passport_entries (user_id, type, entity_id, entity_name, metadata)
SELECT DISTINCT
  r.user_id,
  'city' as type,
  LOWER(COALESCE(e.venue_city, '') || COALESCE('_' || e.venue_state, '')) as entity_id,
  COALESCE(e.venue_city, 'Unknown City') as entity_name,
  jsonb_build_object('state', e.venue_state) as metadata
FROM public.reviews r
JOIN public.events e ON e.id = r.event_id
WHERE r.is_draft = false
  AND (r.was_there = true OR r.review_text IS NOT NULL)
  AND r.event_id IS NOT NULL
  AND e.venue_city IS NOT NULL
  AND LOWER(TRIM(e.venue_city)) != 'unknown'
ON CONFLICT (user_id, type, entity_id) DO NOTHING;

-- Final summary
DO $$
DECLARE
  total_entries INTEGER;
  cities_count INTEGER;
  venues_count INTEGER;
  artists_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_entries FROM public.passport_entries;
  SELECT COUNT(*) INTO cities_count FROM public.passport_entries WHERE type = 'city';
  SELECT COUNT(*) INTO venues_count FROM public.passport_entries WHERE type = 'venue';
  SELECT COUNT(*) INTO artists_count FROM public.passport_entries WHERE type = 'artist';
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Passport Backfill Complete!';
  RAISE NOTICE 'Total entries: %', total_entries;
  RAISE NOTICE '  - Cities: %', cities_count;
  RAISE NOTICE '  - Venues: %', venues_count;
  RAISE NOTICE '  - Artists: %', artists_count;
  RAISE NOTICE '========================================';
END $$;


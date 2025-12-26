-- ============================================
-- FIX: Populate null venue_id for events
-- ============================================
-- This script attempts to match events with null venue_id to venues
-- by matching on venue_name

BEGIN;

-- First, let's see what we're working with
-- Check which table these IDs belong to and their venue_name
SELECT 
  'events' as table_name,
  id,
  venue_id,
  venue_name,
  event_name,
  event_date
FROM public.events
WHERE id IN (
  '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',
  '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',
  'e1dafc56-ae68-4a65-ad17-5f24c8652000',
  'd1bef15e-e420-4def-8614-ac5e2bfa7094',
  '8a3c9c37-3622-4326-b685-4307697dc37e'
)
ORDER BY created_at DESC;

-- Check if matching venues exist
SELECT 
  e.id as event_id,
  e.venue_name as event_venue_name,
  v.id as venue_id,
  v.name as venue_name,
  v.jambase_venue_id
FROM public.events e
LEFT JOIN public.venues v ON LOWER(TRIM(v.name)) = LOWER(TRIM(e.venue_name))
WHERE e.id IN (
  '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',
  '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',
  'e1dafc56-ae68-4a65-ad17-5f24c8652000',
  'd1bef15e-e420-4def-8614-ac5e2bfa7094',
  '8a3c9c37-3622-4326-b685-4307697dc37e'
)
AND e.venue_id IS NULL;

-- Fix: Update events with null venue_id by matching venue_name
UPDATE public.events e
SET venue_id = v.id,
    updated_at = NOW()
FROM public.venues v
WHERE e.venue_id IS NULL
  AND e.venue_name IS NOT NULL
  AND LOWER(TRIM(v.name)) = LOWER(TRIM(e.venue_name))
  AND e.id IN (
    '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',
    '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',
    'e1dafc56-ae68-4a65-ad17-5f24c8652000',
    'd1bef15e-e420-4def-8614-ac5e2bfa7094',
    '8a3c9c37-3622-4326-b685-4307697dc37e'
  );

-- Verify the fix
SELECT 
  id,
  venue_id,
  venue_name,
  event_name
FROM public.events
WHERE id IN (
  '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',
  '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',
  'e1dafc56-ae68-4a65-ad17-5f24c8652000',
  'd1bef15e-e420-4def-8614-ac5e2bfa7094',
  '8a3c9c37-3622-4326-b685-4307697dc37e'
)
ORDER BY created_at DESC;

-- If the above doesn't work, try matching on jambase_venue_id from jambase_events
-- (if these events have a jambase_event_id)
UPDATE public.events e
SET venue_id = v.id,
    updated_at = NOW()
FROM public.jambase_events je
JOIN public.venues v ON v.jambase_venue_id = je.venue_id
WHERE e.venue_id IS NULL
  AND e.jambase_event_id = je.jambase_event_id
  AND je.venue_id IS NOT NULL
  AND e.id IN (
    '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',
    '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',
    'e1dafc56-ae68-4a65-ad17-5f24c8652000',
    'd1bef15e-e420-4def-8614-ac5e2bfa7094',
    '8a3c9c37-3622-4326-b685-4307697dc37e'
  );

COMMIT;

-- ============================================
-- GENERAL FIX: For ALL events with null venue_id
-- ============================================
-- Uncomment and run this if you want to fix ALL events, not just these 5

/*
BEGIN;

-- Match by venue_name
UPDATE public.events e
SET venue_id = v.id,
    updated_at = NOW()
FROM public.venues v
WHERE e.venue_id IS NULL
  AND e.venue_name IS NOT NULL
  AND LOWER(TRIM(v.name)) = LOWER(TRIM(e.venue_name));

-- Match by jambase_venue_id if venue_name match didn't work
UPDATE public.events e
SET venue_id = v.id,
    updated_at = NOW()
FROM public.jambase_events je
JOIN public.venues v ON v.jambase_venue_id = je.venue_id
WHERE e.venue_id IS NULL
  AND e.jambase_event_id = je.jambase_event_id
  AND je.venue_id IS NOT NULL;

COMMIT;
*/


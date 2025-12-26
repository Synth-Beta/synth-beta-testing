-- ============================================
-- FIX: Populate venue_id for events updated Dec 25, 2025
-- ============================================
-- This script attempts to match events with null venue_id to venues
-- by matching on venue_name or via jambase_events

BEGIN;

-- Step 1: Match by venue_name (exact match)
UPDATE public.events e
SET venue_id = v.id,
    updated_at = NOW()
FROM public.venues v
WHERE DATE(e.updated_at) = '2025-12-25'
  AND e.venue_id IS NULL
  AND e.venue_name IS NOT NULL
  AND LOWER(TRIM(v.name)) = LOWER(TRIM(e.venue_name));

-- Check how many were fixed
SELECT 
  'After venue_name match' as step,
  COUNT(*) as remaining_null_venue_id
FROM public.events
WHERE DATE(updated_at) = '2025-12-25' 
  AND venue_id IS NULL;

-- Step 2: Match via jambase_events if venue_name match didn't work
UPDATE public.events e
SET venue_id = v.id,
    updated_at = NOW()
FROM public.jambase_events je
JOIN public.venues v ON v.jambase_venue_id = je.venue_id
WHERE DATE(e.updated_at) = '2025-12-25'
  AND e.venue_id IS NULL
  AND e.jambase_event_id IS NOT NULL
  AND e.jambase_event_id = je.jambase_event_id
  AND je.venue_id IS NOT NULL;

-- Check how many were fixed
SELECT 
  'After jambase_events match' as step,
  COUNT(*) as remaining_null_venue_id
FROM public.events
WHERE DATE(updated_at) = '2025-12-25' 
  AND venue_id IS NULL;

-- Step 3: Try matching by venue_uuid if it exists
UPDATE public.events e
SET venue_id = e.venue_uuid,
    updated_at = NOW()
WHERE DATE(e.updated_at) = '2025-12-25'
  AND e.venue_id IS NULL
  AND e.venue_uuid IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.venues v WHERE v.id = e.venue_uuid
  );

-- Final check: Show remaining events that couldn't be matched
SELECT 
  id,
  venue_id,
  venue_name,
  venue_uuid,
  jambase_event_id,
  event_name,
  updated_at
FROM public.events
WHERE DATE(updated_at) = '2025-12-25' 
  AND venue_id IS NULL
ORDER BY updated_at DESC;

-- Summary
SELECT 
  COUNT(*) as total_events_dec_25,
  COUNT(venue_id) as events_with_venue_id,
  COUNT(*) - COUNT(venue_id) as events_still_null
FROM public.events
WHERE DATE(updated_at) = '2025-12-25';

COMMIT;

-- ============================================
-- ROOT CAUSE INVESTIGATION
-- ============================================
-- If events are still null after the fix, check:

-- 1. Are the venues missing from the venues table?
SELECT DISTINCT
  e.venue_name,
  COUNT(*) as event_count
FROM public.events e
WHERE DATE(e.updated_at) = '2025-12-25'
  AND e.venue_id IS NULL
  AND e.venue_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.venues v 
    WHERE LOWER(TRIM(v.name)) = LOWER(TRIM(e.venue_name))
  )
GROUP BY e.venue_name
ORDER BY event_count DESC;

-- 2. Check if there's a trigger or function that should be setting venue_id
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'events'
  AND (trigger_name LIKE '%venue%' OR action_statement LIKE '%venue_id%')
ORDER BY trigger_name;


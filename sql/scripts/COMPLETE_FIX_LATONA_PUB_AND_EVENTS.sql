-- ============================================
-- COMPLETE FIX: Latona Pub Duplicate + Leif Totusek Events
-- ============================================
-- Run this script to:
-- 1. Merge duplicate Latona Pub venues
-- 2. Fix Leif Totusek events with null venue_id
-- ============================================

BEGIN;

-- ============================================
-- PART 1: MERGE LATONA PUB DUPLICATES
-- ============================================

-- Keep: 725a0c7f-dfd2-43e6-90e5-0c690eb377e4 (oldest)
-- Merge: 8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001 (newer, will be deleted)

-- Step 1: Merge data from newer venue into older venue
UPDATE public.venues v_keep
SET 
  jambase_venue_id = COALESCE(v_keep.jambase_venue_id, v_merge.jambase_venue_id),
  address = COALESCE(NULLIF(v_keep.address, ''), NULLIF(v_merge.address, '')),
  city = COALESCE(NULLIF(v_keep.city, ''), NULLIF(v_merge.city, '')),
  state = COALESCE(NULLIF(v_keep.state, ''), NULLIF(v_merge.state, '')),
  zip = COALESCE(NULLIF(v_keep.zip, ''), NULLIF(v_merge.zip, '')),
  country = COALESCE(NULLIF(v_keep.country, ''), NULLIF(v_merge.country, '')),
  latitude = COALESCE(v_keep.latitude, v_merge.latitude),
  longitude = COALESCE(v_keep.longitude, v_merge.longitude),
  owner_user_id = COALESCE(v_keep.owner_user_id, v_merge.owner_user_id),
  verified = v_keep.verified OR v_merge.verified,
  claimed_at = COALESCE(v_keep.claimed_at, v_merge.claimed_at),
  updated_at = NOW()
FROM public.venues v_merge
WHERE v_keep.id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
  AND v_merge.id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

-- Step 2: Update all foreign key references
UPDATE public.events
SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4', updated_at = NOW()
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

UPDATE public.user_venues
SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_venues uv2
    WHERE uv2.user_id = user_venues.user_id
      AND uv2.venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
  );

DELETE FROM public.user_venues
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

UPDATE public.user_reviews
SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4', updated_at = NOW()
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

UPDATE public.user_venue_interactions
SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

-- Update jambase_events if it has venue_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jambase_events' AND column_name = 'venue_id'
  ) THEN
    UPDATE public.jambase_events
    SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
    WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
  END IF;
END $$;

-- Update jambase_events if it has venue_uuid
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jambase_events' AND column_name = 'venue_uuid'
  ) THEN
    UPDATE public.jambase_events
    SET venue_uuid = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
    WHERE venue_uuid = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
  END IF;
END $$;

-- Update scenes if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'scenes'
  ) THEN
    UPDATE public.scenes
    SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
    WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
  END IF;
END $$;

-- Step 3: Recalculate num_upcoming_events
UPDATE public.venues
SET num_upcoming_events = (
  SELECT COUNT(*)
  FROM public.events
  WHERE events.venue_id = venues.id
    AND events.event_date >= NOW()
    AND events.event_status IS DISTINCT FROM 'EventCancelled'
)
WHERE id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4';

-- Step 4: Delete the duplicate venue
DELETE FROM public.venues
WHERE id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

-- ============================================
-- PART 2: FIX LEIF TOTUSEK EVENTS
-- ============================================

-- Fix events by extracting venue name from title and matching to venues
UPDATE public.events e
SET venue_id = v.id,
    updated_at = NOW()
FROM public.venues v
WHERE e.venue_id IS NULL
  AND e.title LIKE '% at %'
  AND LOWER(TRIM(v.name)) = LOWER(TRIM(SUBSTRING(e.title FROM 'at (.+)$')))
  AND e.id IN (
    '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',  -- Pono Ranch
    '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',  -- Latona Pub
    'e1dafc56-ae68-4a65-ad17-5f24c8652000',  -- Latona Pub
    'd1bef15e-e420-4def-8614-ac5e2bfa7094',  -- Latona Pub
    '8a3c9c37-3622-4326-b685-4307697dc37e'   -- Cloudview Farm
  );

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify Latona Pub duplicate is resolved
SELECT 
  'Latona Pub venues' as check_type,
  COUNT(*) as count,
  CASE WHEN COUNT(*) = 1 THEN '✅ FIXED' ELSE '❌ STILL DUPLICATE' END as status
FROM public.venues
WHERE LOWER(TRIM(name)) = LOWER(TRIM('Latona Pub'));

-- Verify Leif Totusek events are fixed
SELECT 
  'Leif Totusek events' as check_type,
  COUNT(*) as total_events,
  COUNT(venue_id) as events_with_venue_id,
  CASE 
    WHEN COUNT(*) = COUNT(venue_id) THEN '✅ ALL FIXED'
    ELSE '❌ SOME STILL NULL'
  END as status
FROM public.events
WHERE id IN (
  '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',
  '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',
  'e1dafc56-ae68-4a65-ad17-5f24c8652000',
  'd1bef15e-e420-4def-8614-ac5e2bfa7094',
  '8a3c9c37-3622-4326-b685-4307697dc37e'
);

-- Show final state of fixed events
SELECT 
  id,
  title,
  venue_id,
  SUBSTRING(title FROM 'at (.+)$') as extracted_venue_name,
  CASE 
    WHEN venue_id IS NOT NULL THEN '✅ FIXED'
    ELSE '❌ STILL NULL'
  END as status
FROM public.events
WHERE id IN (
  '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',
  '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',
  'e1dafc56-ae68-4a65-ad17-5f24c8652000',
  'd1bef15e-e420-4def-8614-ac5e2bfa7094',
  '8a3c9c37-3622-4326-b685-4307697dc37e'
)
ORDER BY title;

COMMIT;


-- ============================================
-- MERGE: Latona Pub duplicate venues
-- ============================================
-- Strategy: Keep the OLDEST venue (725a0c7f-dfd2-43e6-90e5-0c690eb377e4)
--          Merge all data from NEWER venue (8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001)
--          Update all foreign key references
--          Delete the duplicate

BEGIN;

-- Set variables for the venues
-- KEEP: Oldest venue (will be the canonical one)
-- MERGE: Newer venue (will be deleted after merging)
DO $$
DECLARE
  v_keep_venue_id UUID := '725a0c7f-dfd2-43e6-90e5-0c690eb377e4';
  v_merge_venue_id UUID := '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
BEGIN
  -- Step 1: Show what we're working with
  RAISE NOTICE 'KEEP venue: %', v_keep_venue_id;
  RAISE NOTICE 'MERGE venue: %', v_merge_venue_id;
END $$;

-- Step 1: Check current state of both venues
SELECT 
  'BEFORE MERGE' as status,
  id,
  name,
  jambase_venue_id,
  address,
  city,
  state,
  zip,
  country,
  latitude,
  longitude,
  owner_user_id,
  verified,
  claimed_at,
  num_upcoming_events,
  created_at
FROM public.venues
WHERE id IN ('725a0c7f-dfd2-43e6-90e5-0c690eb377e4', '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001')
ORDER BY created_at;

-- Step 2: Merge data from newer venue into older venue
-- (Keep the older venue's data, but fill in any NULLs from newer venue)
UPDATE public.venues v_keep
SET 
  -- Merge jambase_venue_id if keep doesn't have one
  jambase_venue_id = COALESCE(v_keep.jambase_venue_id, v_merge.jambase_venue_id),
  -- Merge address fields (prefer keep, but use merge if keep is null)
  address = COALESCE(NULLIF(v_keep.address, ''), NULLIF(v_merge.address, '')),
  city = COALESCE(NULLIF(v_keep.city, ''), NULLIF(v_merge.city, '')),
  state = COALESCE(NULLIF(v_keep.state, ''), NULLIF(v_merge.state, '')),
  zip = COALESCE(NULLIF(v_keep.zip, ''), NULLIF(v_merge.zip, '')),
  country = COALESCE(NULLIF(v_keep.country, ''), NULLIF(v_merge.country, '')),
  latitude = COALESCE(v_keep.latitude, v_merge.latitude),
  longitude = COALESCE(v_keep.longitude, v_merge.longitude),
  -- Merge ownership (prefer keep, but use merge if keep doesn't have owner)
  owner_user_id = COALESCE(v_keep.owner_user_id, v_merge.owner_user_id),
  verified = v_keep.verified OR v_merge.verified,  -- If either is verified, keep it verified
  claimed_at = COALESCE(v_keep.claimed_at, v_merge.claimed_at),
  -- Update timestamp
  updated_at = NOW()
FROM public.venues v_merge
WHERE v_keep.id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
  AND v_merge.id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

-- Step 3: Update all foreign key references from merge venue to keep venue

-- 3a. Update events table
UPDATE public.events
SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4',
    updated_at = NOW()
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

-- 3b. Update user_venues table
UPDATE public.user_venues
SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001'
  -- Handle potential duplicates (if user already has the keep venue)
  AND NOT EXISTS (
    SELECT 1 FROM public.user_venues uv2
    WHERE uv2.user_id = user_venues.user_id
      AND uv2.venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
  );

-- Delete any remaining duplicates after the update
DELETE FROM public.user_venues
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

-- 3c. Update user_reviews table
UPDATE public.user_reviews
SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4',
    updated_at = NOW()
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

-- 3d. Update user_venue_interactions table
UPDATE public.user_venue_interactions
SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

-- 3e. Update jambase_events table (if it has venue_id column)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'jambase_events' 
      AND column_name = 'venue_id'
  ) THEN
    UPDATE public.jambase_events
    SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
    WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
  END IF;
END $$;

-- 3f. Update jambase_events table (if it has venue_uuid column)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'jambase_events' 
      AND column_name = 'venue_uuid'
  ) THEN
    UPDATE public.jambase_events
    SET venue_uuid = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
    WHERE venue_uuid = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
  END IF;
END $$;

-- 3g. Update scenes table (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'scenes'
  ) THEN
    UPDATE public.scenes
    SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
    WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
  END IF;
END $$;

-- Step 4: Recalculate num_upcoming_events for the kept venue
UPDATE public.venues
SET num_upcoming_events = (
  SELECT COUNT(*)
  FROM public.events
  WHERE events.venue_id = venues.id
    AND events.event_date >= NOW()
    AND events.event_status IS DISTINCT FROM 'EventCancelled'
)
WHERE id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4';

-- Step 5: Delete the duplicate venue
DELETE FROM public.venues
WHERE id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

-- Step 6: Verify the merge
SELECT 
  'AFTER MERGE' as status,
  id,
  name,
  jambase_venue_id,
  address,
  city,
  state,
  zip,
  country,
  latitude,
  longitude,
  owner_user_id,
  verified,
  claimed_at,
  num_upcoming_events,
  created_at,
  updated_at
FROM public.venues
WHERE id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4';

-- Step 7: Verify no references to deleted venue remain
SELECT 
  'events' as table_name,
  COUNT(*) as remaining_references
FROM public.events
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001'
UNION ALL
SELECT 
  'user_venues' as table_name,
  COUNT(*) as remaining_references
FROM public.user_venues
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001'
UNION ALL
SELECT 
  'user_reviews' as table_name,
  COUNT(*) as remaining_references
FROM public.user_reviews
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001'
UNION ALL
SELECT 
  'user_venue_interactions' as table_name,
  COUNT(*) as remaining_references
FROM public.user_venue_interactions
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

-- Step 8: Verify duplicate is gone
SELECT 
  COUNT(*) as latona_pub_count,
  STRING_AGG(id::text, ', ') as venue_ids
FROM public.venues
WHERE LOWER(TRIM(name)) = LOWER(TRIM('Latona Pub'));

COMMIT;


-- ============================================
-- STEP 1: MERGE LATONA PUB DUPLICATE VENUES
-- ============================================
-- This script merges the duplicate Latona Pub venues:
-- - KEEPS: 725a0c7f-dfd2-43e6-90e5-0c690eb377e4 (oldest)
-- - DELETES: 8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001 (newer)
-- ============================================
-- 
-- FILES TO RUN IN ORDER:
-- 1. This file (01_merge_latona_pub_duplicates.sql)
-- 2. sql/scripts/02_fix_leif_totusek_events.sql
-- 3. sql/scripts/03_verify_fixes.sql
-- ============================================

BEGIN;

-- Step 1: Merge data from newer venue into older venue (using actual schema)
UPDATE public.venues v_keep
SET 
  street_address = COALESCE(NULLIF(v_keep.street_address, ''), NULLIF(v_merge.street_address, '')),
  state = COALESCE(NULLIF(v_keep.state, ''), NULLIF(v_merge.state, '')),
  zip = COALESCE(NULLIF(v_keep.zip, ''), NULLIF(v_merge.zip, '')),
  country = COALESCE(NULLIF(v_keep.country, ''), NULLIF(v_merge.country, '')),
  latitude = COALESCE(v_keep.latitude, v_merge.latitude),
  longitude = COALESCE(v_keep.longitude, v_merge.longitude),
  url = COALESCE(NULLIF(v_keep.url, ''), NULLIF(v_merge.url, '')),
  image_url = COALESCE(NULLIF(v_keep.image_url, ''), NULLIF(v_merge.image_url, '')),
  owner_user_id = COALESCE(v_keep.owner_user_id, v_merge.owner_user_id),
  verified = v_keep.verified OR v_merge.verified,
  claimed_at = COALESCE(v_keep.claimed_at, v_merge.claimed_at),
  geo = COALESCE(v_keep.geo, v_merge.geo),
  same_as = COALESCE(v_keep.same_as, v_merge.same_as),
  maximum_attendee_capacity = COALESCE(v_keep.maximum_attendee_capacity, v_merge.maximum_attendee_capacity),
  updated_at = NOW()
FROM public.venues v_merge
WHERE v_keep.id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
  AND v_merge.id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

-- Step 2: Update all foreign key references from merge venue to keep venue

-- 2a. Update events table
UPDATE public.events
SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4',
    updated_at = NOW()
WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';

-- 1b. Update user_venues table (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_venues'
  ) THEN
    -- Update references, handling duplicates
    UPDATE public.user_venues
    SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
    WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001'
      AND NOT EXISTS (
        SELECT 1 FROM public.user_venues uv2
        WHERE uv2.user_id = user_venues.user_id
          AND uv2.venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
      );
    
    -- Delete any remaining duplicates after the update
    DELETE FROM public.user_venues
    WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
  END IF;
END $$;

-- 2c. Update user_reviews table (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_reviews'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_reviews' AND column_name = 'venue_id'
  ) THEN
    UPDATE public.user_reviews
    SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
    WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
    
    -- Update updated_at if column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'user_reviews' AND column_name = 'updated_at'
    ) THEN
      UPDATE public.user_reviews
      SET updated_at = NOW()
      WHERE venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4';
    END IF;
  END IF;
END $$;

-- 1d. Update user_venue_interactions table (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_venue_interactions'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_venue_interactions' AND column_name = 'venue_id'
  ) THEN
    UPDATE public.user_venue_interactions
    SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
    WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
  END IF;
END $$;

-- 1e. Update jambase_events if it exists and has venue_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'jambase_events'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jambase_events' AND column_name = 'venue_id'
  ) THEN
    UPDATE public.jambase_events
    SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
    WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
  END IF;
END $$;

-- 1f. Update jambase_events if it has venue_uuid
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'jambase_events'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jambase_events' AND column_name = 'venue_uuid'
  ) THEN
    UPDATE public.jambase_events
    SET venue_uuid = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
    WHERE venue_uuid = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
  END IF;
END $$;

-- 1g. Update scenes if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'scenes'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'scenes' AND column_name = 'venue_id'
  ) THEN
    UPDATE public.scenes
    SET venue_id = '725a0c7f-dfd2-43e6-90e5-0c690eb377e4'
    WHERE venue_id = '8ec7a9e9-a4e8-4a1d-8cbe-77734a86a001';
  END IF;
END $$;

-- Step 3: Recalculate num_upcoming_events for the kept venue
-- (The trigger should handle this, but we'll update it manually to be sure)
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

COMMIT;

-- Verification: Check that duplicate is gone
SELECT 
  'Latona Pub venues after merge' as check_type,
  COUNT(*) as count,
  CASE WHEN COUNT(*) = 1 THEN '✅ FIXED' ELSE '❌ STILL DUPLICATE' END as status
FROM public.venues
WHERE LOWER(TRIM(name)) = LOWER(TRIM('Latona Pub'));

-- ============================================
-- ✅ STEP 1 COMPLETE
-- ============================================
-- Next: Run 02_fix_leif_totusek_events.sql
-- File: sql/scripts/02_fix_leif_totusek_events.sql
-- ============================================


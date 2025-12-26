-- ============================================
-- STEP 2: FIX LEIF TOTUSEK EVENTS
-- ============================================
-- This script fixes the 5 Leif Totusek events that have null venue_id
-- by extracting the venue name from the title and matching to venues table
-- ============================================
-- 
-- FILES TO RUN IN ORDER:
-- 1. sql/scripts/01_merge_latona_pub_duplicates.sql (run first)
-- 2. This file (02_fix_leif_totusek_events.sql)
-- 3. sql/scripts/03_verify_fixes.sql (run next)
-- ============================================

BEGIN;

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

COMMIT;

-- Verification: Check that events are fixed
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

-- ============================================
-- ✅ STEP 2 COMPLETE
-- ============================================
-- Next: Run 03_verify_fixes.sql
-- File: sql/scripts/03_verify_fixes.sql
-- ============================================


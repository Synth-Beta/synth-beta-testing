-- ============================================
-- FIX: Populate venue_id for Leif Totusek events updated Dec 25
-- ============================================
-- These events have venue names in the title but null venue_id
-- We'll match them to venues by extracting venue name from title
--
-- IMPORTANT: Run merge_latona_pub_duplicates.sql FIRST to handle
--            the duplicate Latona Pub venues before fixing these events

BEGIN;

-- First, let's see the full event data and potential venue matches
SELECT 
  e.id,
  e.title,
  e.venue_id,
  -- Extract venue name from title (everything after "at ")
  SUBSTRING(e.title FROM 'at (.+)$') as extracted_venue_name,
  e.venue_city,
  e.venue_state,
  e.updated_at,
  -- Try to find matching venue
  v.id as matching_venue_id,
  v.name as matching_venue_name
FROM public.events e
LEFT JOIN public.venues v ON LOWER(TRIM(v.name)) = LOWER(TRIM(SUBSTRING(e.title FROM 'at (.+)$')))
WHERE e.id IN (
  '0b658a8a-d8d4-4b09-a9bb-b65c87fbe0c1',  -- Pono Ranch
  '33e42b5d-e243-44a0-b1c9-3b2c655ba4e1',  -- Latona Pub
  'e1dafc56-ae68-4a65-ad17-5f24c8652000',  -- Latona Pub
  'd1bef15e-e420-4def-8614-ac5e2bfa7094',  -- Latona Pub
  '8a3c9c37-3622-4326-b685-4307697dc37e'   -- Cloudview Farm
)
ORDER BY e.title;

-- Fix: Extract venue name from title and match to venues table
-- Note: After running merge_latona_pub_duplicates.sql, there should only be one Latona Pub
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

-- Verify the fix
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

-- Check if venues exist for these venue names (shows duplicates)
SELECT 
  'Pono Ranch' as venue_name,
  COUNT(*) as venue_count,
  STRING_AGG(id::text, ', ') as venue_ids,
  STRING_AGG(created_at::text, ', ') as created_dates
FROM public.venues
WHERE LOWER(TRIM(name)) = LOWER(TRIM('Pono Ranch'))
UNION ALL
SELECT 
  'Latona Pub' as venue_name,
  COUNT(*) as venue_count,
  STRING_AGG(id::text, ', ') as venue_ids,
  STRING_AGG(created_at::text, ', ') as created_dates
FROM public.venues
WHERE LOWER(TRIM(name)) = LOWER(TRIM('Latona Pub'))
UNION ALL
SELECT 
  'Cloudview Farm' as venue_name,
  COUNT(*) as venue_count,
  STRING_AGG(id::text, ', ') as venue_ids,
  STRING_AGG(created_at::text, ', ') as created_dates
FROM public.venues
WHERE LOWER(TRIM(name)) = LOWER(TRIM('Cloudview Farm'));

-- Show which venue_id will be used for Latona Pub (the oldest one)
SELECT 
  id,
  name,
  created_at,
  'Will be used for Latona Pub events' as note
FROM public.venues
WHERE LOWER(TRIM(name)) = LOWER(TRIM('Latona Pub'))
ORDER BY created_at ASC
LIMIT 1;

COMMIT;


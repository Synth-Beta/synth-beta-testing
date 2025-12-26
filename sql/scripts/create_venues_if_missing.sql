-- ============================================
-- CREATE MISSING VENUES for Leif Totusek events
-- ============================================
-- If venues don't exist, create them first, then run the fix

BEGIN;

-- Check which venues are missing
SELECT 
  venue_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.venues v 
      WHERE LOWER(TRIM(v.name)) = LOWER(TRIM(venues.venue_name))
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END as status
FROM (
  SELECT 'Pono Ranch' as venue_name
  UNION ALL SELECT 'Latona Pub'
  UNION ALL SELECT 'Cloudview Farm'
) venues;

-- Create missing venues (only if they don't exist)
INSERT INTO public.venues (
  jambase_venue_id,
  name,
  identifier,
  created_at,
  updated_at
)
SELECT 
  'manual_' || md5(venue_name) as jambase_venue_id,
  venue_name as name,
  LOWER(REPLACE(REPLACE(venue_name, ' ', '_'), '''', '')) as identifier,
  NOW() as created_at,
  NOW() as updated_at
FROM (
  SELECT 'Pono Ranch' as venue_name
  UNION ALL SELECT 'Latona Pub'
  UNION ALL SELECT 'Cloudview Farm'
) new_venues
WHERE NOT EXISTS (
  SELECT 1 FROM public.venues v 
  WHERE LOWER(TRIM(v.name)) = LOWER(TRIM(new_venues.venue_name))
)
ON CONFLICT (jambase_venue_id) DO NOTHING;

-- Verify venues were created
SELECT 
  id,
  name,
  jambase_venue_id,
  created_at
FROM public.venues
WHERE LOWER(TRIM(name)) IN (
  LOWER(TRIM('Pono Ranch')),
  LOWER(TRIM('Latona Pub')),
  LOWER(TRIM('Cloudview Farm'))
)
ORDER BY name;

COMMIT;


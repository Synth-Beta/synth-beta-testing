-- Verification queries for passport backfill
-- Run these to check if passport entries were created and diagnose issues

-- 1. Check total passport entries created
SELECT 
  COUNT(*) as total_entries,
  COUNT(DISTINCT user_id) as unique_users
FROM public.passport_entries;

-- 2. Breakdown by type
SELECT 
  type,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as unique_users
FROM public.passport_entries
GROUP BY type
ORDER BY type;

-- 3. Check if we have reviews to backfill from
SELECT 
  COUNT(*) as total_reviews,
  COUNT(DISTINCT user_id) as users_with_reviews,
  COUNT(*) FILTER (WHERE is_draft = false AND (was_there = true OR review_text IS NOT NULL)) as eligible_reviews
FROM public.reviews
WHERE event_id IS NOT NULL;

-- 4. Check if we have event interests to backfill from
SELECT 
  COUNT(*) as total_interests,
  COUNT(DISTINCT user_id) as users_with_interests
FROM public.user_event_relationships
WHERE relationship_type = 'interest'
  AND event_id IS NOT NULL;

-- 5. Check if events table has the data we need
SELECT 
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE venue_city IS NOT NULL) as events_with_city,
  COUNT(*) FILTER (WHERE venue_uuid IS NOT NULL) as events_with_venue_uuid,
  COUNT(*) FILTER (WHERE artist_id IS NOT NULL) as events_with_artist_id
FROM public.events;

-- 6. Sample of reviews that should have created passport entries
SELECT 
  r.id,
  r.user_id,
  r.event_id,
  r.is_draft,
  r.was_there,
  r.review_text IS NOT NULL as has_review_text,
  e.venue_city,
  e.venue_uuid,
  e.artist_id
FROM public.reviews r
LEFT JOIN public.events e ON e.id = r.event_id
WHERE r.is_draft = false
  AND (r.was_there = true OR r.review_text IS NOT NULL)
  AND r.event_id IS NOT NULL
LIMIT 10;

-- 7. Check if passport entries exist for a specific user (replace with your user_id)
-- SELECT 
--   pe.*,
--   e.venue_city,
--   e.venue_name,
--   e.artist_name
-- FROM public.passport_entries pe
-- LEFT JOIN public.events e ON (
--   (pe.type = 'venue' AND e.venue_uuid::TEXT = pe.entity_id) OR
--   (pe.type = 'artist' AND e.artist_id::TEXT = pe.entity_id)
-- )
-- WHERE pe.user_id = 'YOUR_USER_ID_HERE'
-- ORDER BY pe.unlocked_at DESC;

-- 8. Find reviews without corresponding passport entries (diagnostic)
SELECT 
  r.user_id,
  r.event_id,
  e.venue_city,
  e.venue_uuid,
  e.artist_id,
  CASE 
    WHEN pe_city.id IS NULL AND e.venue_city IS NOT NULL THEN 'Missing city'
    WHEN pe_venue.id IS NULL AND e.venue_uuid IS NOT NULL THEN 'Missing venue'
    WHEN pe_artist.id IS NULL AND e.artist_id IS NOT NULL THEN 'Missing artist'
    ELSE 'All entries exist'
  END as missing_entries
FROM public.reviews r
JOIN public.events e ON e.id = r.event_id
LEFT JOIN public.passport_entries pe_city ON (
  pe_city.user_id = r.user_id 
  AND pe_city.type = 'city'
  AND pe_city.entity_id = LOWER(COALESCE(e.venue_city, '') || COALESCE('_' || e.venue_state, ''))
)
LEFT JOIN public.passport_entries pe_venue ON (
  pe_venue.user_id = r.user_id 
  AND pe_venue.type = 'venue'
  AND pe_venue.entity_id = e.venue_uuid::TEXT
)
LEFT JOIN public.passport_entries pe_artist ON (
  pe_artist.user_id = r.user_id 
  AND pe_artist.type = 'artist'
  AND pe_artist.entity_id = e.artist_id::TEXT
)
WHERE r.is_draft = false
  AND (r.was_there = true OR r.review_text IS NOT NULL)
  AND r.event_id IS NOT NULL
  AND (
    (pe_city.id IS NULL AND e.venue_city IS NOT NULL) OR
    (pe_venue.id IS NULL AND e.venue_uuid IS NOT NULL) OR
    (pe_artist.id IS NULL AND e.artist_id IS NOT NULL)
  )
LIMIT 20;


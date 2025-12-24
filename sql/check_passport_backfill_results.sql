-- Quick check: Did passport entries get created?
SELECT 
  COUNT(*) as total_passport_entries,
  COUNT(*) FILTER (WHERE type = 'city') as cities,
  COUNT(*) FILTER (WHERE type = 'venue') as venues,
  COUNT(*) FILTER (WHERE type = 'artist') as artists,
  COUNT(*) FILTER (WHERE type = 'scene') as scenes
FROM public.passport_entries;

-- If the above shows 0, check if we have reviews to process:
SELECT 
  COUNT(*) as total_reviews,
  COUNT(*) FILTER (WHERE is_draft = false) as published_reviews,
  COUNT(*) FILTER (WHERE is_draft = false AND was_there = true) as reviews_with_attendance,
  COUNT(*) FILTER (WHERE is_draft = false AND review_text IS NOT NULL) as reviews_with_text
FROM public.reviews
WHERE event_id IS NOT NULL;

-- Check if events table has the columns we need:
SELECT 
  column_name
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'events'
  AND column_name IN ('venue_city', 'venue_state', 'venue_uuid', 'venue_name', 'artist_id', 'artist_name')
ORDER BY column_name;

-- Sample: Find reviews that should have created passport entries
SELECT 
  r.id as review_id,
  r.user_id,
  r.event_id,
  r.is_draft,
  r.was_there,
  e.venue_city,
  e.venue_uuid,
  e.artist_id,
  e.venue_name,
  e.artist_name
FROM public.reviews r
LEFT JOIN public.events e ON e.id = r.event_id
WHERE r.is_draft = false
  AND (r.was_there = true OR r.review_text IS NOT NULL)
  AND r.event_id IS NOT NULL
LIMIT 5;


-- Test passport unlock functions manually
-- Replace with an actual user_id and event data

-- Test 1: Check if we can manually unlock a venue
SELECT public.unlock_passport_venue(
  '349bda34-7878-4c10-9f86-ec5888e55571'::uuid,  -- Your user_id
  NULL::uuid,  -- venue_uuid (null)
  'Enterprise Center'  -- venue_name
) as venue_entry_id;

-- Test 2: Check if we can manually unlock an artist
SELECT public.unlock_passport_artist(
  '349bda34-7878-4c10-9f86-ec5888e55571'::uuid,  -- Your user_id
  NULL::text,  -- artist_id (null)
  'John Mayer'  -- artist_name
) as artist_entry_id;

-- Check if entries were created
SELECT * FROM public.passport_entries 
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571';

-- Test 3: Debug - Check what data the backfill would see
SELECT 
  r.id as review_id,
  r.user_id,
  r.event_id,
  r.is_draft,
  r.was_there,
  e.venue_city,
  e.venue_uuid,
  e.venue_name,
  e.artist_id,
  e.artist_name,
  -- Check conditions
  (r.is_draft = false) as is_not_draft,
  (r.was_there = true OR r.review_text IS NOT NULL) as has_attendance_or_text,
  (e.venue_city IS NOT NULL AND LOWER(TRIM(e.venue_city)) != 'unknown') as can_unlock_city,
  (e.venue_name IS NOT NULL) as can_unlock_venue,
  (e.artist_name IS NOT NULL) as can_unlock_artist
FROM public.reviews r
LEFT JOIN public.events e ON e.id = r.event_id
WHERE r.is_draft = false
  AND (r.was_there = true OR r.review_text IS NOT NULL)
  AND r.event_id IS NOT NULL
LIMIT 10;


-- Debug script to find review attendance issues
-- Run this in Supabase SQL Editor to investigate

-- 1. Check if you have any reviews for "Dogs in a Pile at The Factory"
SELECT 
  ur.id,
  ur.user_id,
  ur.event_id,
  ur.rating,
  ur.review_text,
  ur.was_there,
  ur.created_at,
  je.title as event_title,
  je.artist_name,
  je.venue_name,
  je.event_date
FROM public.user_reviews ur
LEFT JOIN public.jambase_events je ON ur.event_id = je.id
WHERE je.title ILIKE '%Dogs in a Pile%' 
   OR je.venue_name ILIKE '%The Factory%'
   OR je.artist_name ILIKE '%Dogs in a Pile%'
ORDER BY ur.created_at DESC;

-- 2. Check all your recent reviews to see event IDs
SELECT 
  ur.id,
  ur.user_id,
  ur.event_id,
  ur.rating,
  ur.review_text,
  ur.was_there,
  ur.created_at,
  je.title as event_title,
  je.artist_name,
  je.venue_name
FROM public.user_reviews ur
LEFT JOIN public.jambase_events je ON ur.event_id = je.id
WHERE ur.user_id = 'YOUR_USER_ID_HERE'  -- Replace with your actual user ID
ORDER BY ur.created_at DESC
LIMIT 10;

-- 3. Find the specific event ID for "Dogs in a Pile at The Factory"
SELECT 
  id,
  title,
  artist_name,
  venue_name,
  event_date,
  created_at
FROM public.jambase_events
WHERE title ILIKE '%Dogs in a Pile%' 
   OR (artist_name ILIKE '%Dogs in a Pile%' AND venue_name ILIKE '%The Factory%')
ORDER BY created_at DESC;

-- 4. Check if there are multiple events with similar names
SELECT 
  id,
  title,
  artist_name,
  venue_name,
  event_date,
  jambase_event_id
FROM public.jambase_events
WHERE artist_name ILIKE '%Dogs in a Pile%'
ORDER BY event_date DESC;

-- 5. Fix any reviews that should have was_there = true
UPDATE public.user_reviews 
SET was_there = true 
WHERE review_text IS NOT NULL 
  AND review_text != 'ATTENDANCE_ONLY' 
  AND review_text != ''
  AND (was_there IS NULL OR was_there = false);

-- 6. Verify the fix
SELECT 
  COUNT(*) as total_reviews,
  COUNT(*) FILTER (WHERE was_there = true) as marked_attended,
  COUNT(*) FILTER (WHERE was_there = false) as not_attended,
  COUNT(*) FILTER (WHERE review_text IS NOT NULL AND review_text != 'ATTENDANCE_ONLY' AND was_there = true) as reviews_with_attendance
FROM public.user_reviews;

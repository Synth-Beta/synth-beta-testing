-- Debug script to check ATTENDANCE_ONLY records in the database
-- This will help us understand why they're showing up in the feed

-- Check all ATTENDANCE_ONLY records
SELECT 
  id,
  user_id,
  event_id,
  rating,
  review_text,
  is_public,
  is_draft,
  was_there,
  created_at,
  updated_at
FROM user_reviews 
WHERE review_text = 'ATTENDANCE_ONLY'
ORDER BY created_at DESC
LIMIT 10;

-- Check if any ATTENDANCE_ONLY records are marked as public
SELECT 
  COUNT(*) as total_attendance_only,
  COUNT(CASE WHEN is_public = true THEN 1 END) as public_attendance_only,
  COUNT(CASE WHEN is_public = false THEN 1 END) as private_attendance_only
FROM user_reviews 
WHERE review_text = 'ATTENDANCE_ONLY';

-- Check recent reviews to see the pattern
SELECT 
  id,
  user_id,
  event_id,
  rating,
  review_text,
  is_public,
  is_draft,
  was_there,
  created_at
FROM user_reviews 
WHERE user_id = (SELECT user_id FROM user_reviews WHERE review_text = 'ATTENDANCE_ONLY' LIMIT 1)
ORDER BY created_at DESC
LIMIT 5;

-- Check the public_reviews_with_profiles view to see if ATTENDANCE_ONLY records appear there
SELECT 
  id,
  user_id,
  review_text,
  rating,
  is_public,
  created_at
FROM public_reviews_with_profiles 
WHERE review_text = 'ATTENDANCE_ONLY'
ORDER BY created_at DESC
LIMIT 5;

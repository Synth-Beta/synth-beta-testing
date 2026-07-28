-- Fix existing reviews to mark attendance as true
-- All reviews should imply attendance

-- Update all existing reviews to have was_there = true
-- This includes both full reviews and attendance-only records
UPDATE public.user_reviews 
SET was_there = true 
WHERE was_there IS NULL OR was_there = false;

-- Verify the changes
SELECT 
  COUNT(*) as total_reviews,
  COUNT(*) FILTER (WHERE was_there = true) as marked_attended,
  COUNT(*) FILTER (WHERE was_there = false) as not_attended,
  COUNT(*) FILTER (WHERE was_there IS NULL) as null_attendance
FROM public.user_reviews;

-- Show breakdown by review type
SELECT 
  CASE 
    WHEN review_text = 'ATTENDANCE_ONLY' THEN 'Attendance Only'
    WHEN review_text IS NOT NULL AND review_text != '' THEN 'Full Review'
    ELSE 'No Review Text'
  END as review_type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE was_there = true) as marked_attended
FROM public.user_reviews
GROUP BY 
  CASE 
    WHEN review_text = 'ATTENDANCE_ONLY' THEN 'Attendance Only'
    WHEN review_text IS NOT NULL AND review_text != '' THEN 'Full Review'
    ELSE 'No Review Text'
  END
ORDER BY count DESC;

-- Show sample of updated records
SELECT 
  id,
  user_id,
  event_id,
  rating,
  CASE 
    WHEN review_text = 'ATTENDANCE_ONLY' THEN 'Attendance Only'
    WHEN review_text IS NOT NULL AND review_text != '' THEN 'Full Review'
    ELSE 'No Review Text'
  END as review_type,
  was_there,
  created_at
FROM public.user_reviews
ORDER BY created_at DESC
LIMIT 10;

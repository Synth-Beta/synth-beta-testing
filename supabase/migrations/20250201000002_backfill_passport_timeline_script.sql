-- ============================================
-- PASSPORT TIMELINE BACKFILL SCRIPT
-- Run this to populate timeline for all existing users
-- Safe to run multiple times (idempotent)
-- ============================================

-- This script calls the backfill function to process all users
-- It will add timeline highlights for:
-- - First reviews, first artists, first venues, first cities
-- - Milestones (10th, 50th, 100th reviews/events)
-- - High-quality reviews (4+ stars, with photos, detailed)
-- - Special events (with setlists, tour events)
-- - Achievement unlocks

DO $$
DECLARE
  v_result RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Starting passport timeline backfill...';
  RAISE NOTICE 'This may take a while depending on number of users';
  RAISE NOTICE '========================================';
  
  -- Call the backfill function
  SELECT * INTO v_result
  FROM public.backfill_passport_timeline();
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Backfill complete!';
  RAISE NOTICE 'Users processed: %', v_result.users_processed;
  RAISE NOTICE 'Total highlights added: %', v_result.total_highlights_added;
  RAISE NOTICE '========================================';
END $$;

-- Optional: Check results for a specific user
-- Uncomment and replace USER_ID to test a single user
/*
DO $$
DECLARE
  v_result RECORD;
  v_user_id UUID := '349bda34-7878-4c10-9f86-ec5888e55571'; -- Replace with actual user_id
BEGIN
  SELECT * INTO v_result
  FROM public.auto_populate_passport_timeline(v_user_id);
  
  RAISE NOTICE 'User: %', v_user_id;
  RAISE NOTICE 'Highlights added: %', v_result.highlights_added;
  RAISE NOTICE 'Firsts: %', v_result.firsts_count;
  RAISE NOTICE 'Milestones: %', v_result.milestones_count;
  RAISE NOTICE 'Quality reviews: %', v_result.quality_reviews_count;
  RAISE NOTICE 'Special events: %', v_result.special_events_count;
  RAISE NOTICE 'Achievements: %', v_result.achievements_count;
END $$;
*/

-- Optional: View timeline entries for a specific user
-- Uncomment and replace USER_ID to see results
/*
SELECT 
  pt.id,
  pt.event_id,
  pt.review_id,
  pt.is_pinned,
  pt.is_auto_selected,
  pt.significance,
  pt.created_at,
  e.artist_name,
  e.venue_name,
  e.event_date,
  r.rating,
  r.review_text
FROM public.passport_timeline pt
LEFT JOIN public.events e ON e.id = pt.event_id
LEFT JOIN public.reviews r ON r.id = pt.review_id
WHERE pt.user_id = '349bda34-7878-4c10-9f86-ec5888e55571' -- Replace with actual user_id
ORDER BY pt.created_at DESC;
*/


-- ============================================
-- QUICK ANALYTICS CHECK
-- ============================================
-- This version is easier - just set your user_id once at the top!

-- 🔧 STEP 1: SET YOUR USER ID HERE (get it from GET_YOUR_USER_ID.sql)
-- Replace the value below with your actual UUID
\set my_user_id '00000000-0000-0000-0000-000000000000'

-- If that doesn't work in Supabase, just manually replace it below

-- ============================================
-- CRITICAL CHECKS (Run These First!)
-- ============================================

-- 1. Is tracking working? (Most important!)
SELECT 
  '🔴 TRACKING SYSTEM' as check_name,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ WORKING - ' || COUNT(*) || ' interactions logged'
    ELSE '❌ BROKEN - No interactions found!'
  END as status
FROM user_interactions;

-- 2. Overall health check
SELECT 
  component,
  CASE 
    WHEN count > 0 THEN '✅ ' || count || ' records'
    ELSE '❌ Empty'
  END as status
FROM (
  SELECT '1. User Interactions' as component, COUNT(*)::int as count FROM user_interactions
  UNION ALL
  SELECT '2. User Reviews', COUNT(*)::int FROM user_reviews
  UNION ALL
  SELECT '3. Artist Follows', COUNT(*)::int FROM artist_follows
  UNION ALL
  SELECT '4. Venue Follows', COUNT(*)::int FROM venue_follows
  UNION ALL
  SELECT '5. JamBase Events', COUNT(*)::int FROM jambase_events
  UNION ALL
  SELECT '6. Profiles', COUNT(*)::int FROM profiles
) checks
ORDER BY component;

-- 3. Interaction types breakdown (if tracking is working)
SELECT 
  event_type,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
FROM user_interactions
GROUP BY event_type
ORDER BY count DESC;

-- ============================================
-- YOUR PERSONAL DATA
-- ============================================
-- Replace YOUR_USER_ID_HERE in queries below with your actual UUID
-- Or run GET_YOUR_USER_ID.sql first to find your ID

-- 4. Your interactions summary
SELECT 
  event_type,
  COUNT(*) as count
FROM user_interactions
WHERE user_id = 'YOUR_USER_ID_HERE'  -- 👈 REPLACE THIS
GROUP BY event_type
ORDER BY count DESC;

-- 5. Your achievements data
SELECT 
  COUNT(*) FILTER (WHERE is_draft = false AND review_text != 'ATTENDANCE_ONLY') as completed_reviews,
  COUNT(*) FILTER (WHERE is_draft = true) as drafts,
  COUNT(*) FILTER (WHERE review_text = 'ATTENDANCE_ONLY') as attendance_only,
  COUNT(*) as total_attended,
  COUNT(DISTINCT je.venue_name) as unique_venues
FROM user_reviews ur
LEFT JOIN jambase_events je ON ur.jambase_event_id = je.id
WHERE ur.user_id = 'YOUR_USER_ID_HERE';  -- 👈 REPLACE THIS

-- 6. Your follows
SELECT 
  (SELECT COUNT(*) FROM artist_follows WHERE user_id = 'YOUR_USER_ID_HERE') as artist_follows,  -- 👈 REPLACE THIS
  (SELECT COUNT(*) FROM venue_follows WHERE user_id = 'YOUR_USER_ID_HERE') as venue_follows,   -- 👈 REPLACE THIS
  (SELECT COUNT(*) FROM user_jambase_events WHERE user_id = 'YOUR_USER_ID_HERE' AND interest = 'going') as interested_events;  -- 👈 REPLACE THIS

-- ============================================
-- PLATFORM-WIDE STATS (Admin View)
-- ============================================

-- 7. Platform summary
SELECT 
  'Total Users' as metric,
  COUNT(*)::text as value
FROM profiles
UNION ALL
SELECT 
  'Total Events',
  COUNT(*)::text
FROM jambase_events
UNION ALL
SELECT 
  'Total Reviews',
  COUNT(*)::text
FROM user_reviews
WHERE is_draft = false
UNION ALL
SELECT 
  'Total Interactions',
  COUNT(*)::text
FROM user_interactions
UNION ALL
SELECT 
  'Estimated Revenue',
  '$' || (COUNT(*) * 50)::text
FROM user_interactions
WHERE event_type = 'click_ticket';


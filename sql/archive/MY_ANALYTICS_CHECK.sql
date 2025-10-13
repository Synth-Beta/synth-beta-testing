-- ============================================
-- YOUR PERSONAL ANALYTICS CHECK
-- ============================================
-- User ID: 349bda34-7878-4c10-9f86-ec5888e55571
-- Run these queries to verify your analytics data

-- ============================================
-- 1. CRITICAL: Is Tracking Working?
-- ============================================

SELECT 
  '🔴 TRACKING SYSTEM' as check_name,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ WORKING - ' || COUNT(*) || ' interactions logged'
    ELSE '❌ BROKEN - No interactions found!'
  END as status
FROM user_interactions;

-- ============================================
-- 2. Overall System Health
-- ============================================

SELECT 
  component,
  count,
  CASE 
    WHEN count > 0 THEN '✅ Has Data'
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

-- ============================================
-- 3. Interaction Types (If Tracking is Working)
-- ============================================

SELECT 
  event_type,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
FROM user_interactions
GROUP BY event_type
ORDER BY count DESC;

-- ============================================
-- 4. YOUR Personal Interactions
-- ============================================

SELECT 
  event_type,
  entity_type,
  COUNT(*) as count
FROM user_interactions
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571'
GROUP BY event_type, entity_type
ORDER BY count DESC;

-- ============================================
-- 5. YOUR Achievements Data (Concert Enthusiast, Local Expert, etc.)
-- ============================================

-- Note: This query gets venue info by looking up event details
-- If venue_name is stored directly in user_reviews, we'd use that instead
SELECT 
  COUNT(*) FILTER (WHERE is_draft = false AND review_text != 'ATTENDANCE_ONLY') as completed_reviews,
  COUNT(*) FILTER (WHERE is_draft = true) as drafts,
  COUNT(*) FILTER (WHERE review_text = 'ATTENDANCE_ONLY') as attendance_only,
  COUNT(*) as total_attended
FROM user_reviews
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571';

-- ============================================
-- 6. YOUR Follows (Super Fan Achievement)
-- ============================================

SELECT 
  (SELECT COUNT(*) FROM artist_follows WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571') as artist_follows,
  (SELECT COUNT(*) FROM venue_follows WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571') as venue_follows,
  (SELECT COUNT(*) FROM user_jambase_events WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571' AND interest = 'going') as interested_events;

-- ============================================
-- 7. YOUR Followed Artists (with names)
-- ============================================

SELECT 
  af.artist_name,
  af.created_at
FROM artist_follows af
WHERE af.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'
ORDER BY af.created_at DESC;

-- ============================================
-- 8. YOUR Followed Venues (with names)
-- ============================================

SELECT 
  vf.venue_name,
  vf.venue_city,
  vf.venue_state,
  vf.created_at
FROM venue_follows vf
WHERE vf.user_id = '349bda34-7878-4c10-9f86-ec5888e55571'
ORDER BY vf.created_at DESC;

-- ============================================
-- 9. YOUR Reviews Breakdown
-- ============================================

SELECT 
  CASE 
    WHEN is_draft = true THEN '📝 Draft Reviews'
    WHEN review_text = 'ATTENDANCE_ONLY' THEN '✓ Attendance Only'
    ELSE '⭐ Completed Reviews'
  END as review_type,
  COUNT(*) as count
FROM user_reviews
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571'
GROUP BY 
  CASE 
    WHEN is_draft = true THEN '📝 Draft Reviews'
    WHEN review_text = 'ATTENDANCE_ONLY' THEN '✓ Attendance Only'
    ELSE '⭐ Completed Reviews'
  END
ORDER BY count DESC;

-- ============================================
-- 10. YOUR Review Likes (Trusted Reviewer Achievement)
-- ============================================

SELECT 
  COUNT(DISTINCT rl.id) as total_likes,
  COUNT(DISTINCT ur.id) as reviews_with_likes,
  COUNT(DISTINCT ur.id) FILTER (WHERE ur.is_draft = false) as completed_reviews
FROM user_reviews ur
LEFT JOIN review_likes rl ON ur.id = rl.review_id
WHERE ur.user_id = '349bda34-7878-4c10-9f86-ec5888e55571';

-- ============================================
-- 11. ACHIEVEMENT SUMMARY (What Should Show in Your Dashboard)
-- ============================================

WITH your_stats AS (
  SELECT 
    -- Attended events
    (SELECT COUNT(*) FROM user_reviews WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571') as attended_events,
    
    -- Unique venues (simplified - just counting reviews as a proxy)
    -- In production, this should join with event data to get actual venue names
    (SELECT COUNT(*) FROM user_reviews WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571') as unique_venues,
    
    -- Artist follows
    (SELECT COUNT(*) FROM artist_follows WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571') as artist_follows,
    
    -- Venue follows
    (SELECT COUNT(*) FROM venue_follows WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571') as venue_follows,
    
    -- Interested events
    (SELECT COUNT(*) FROM user_jambase_events WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571' AND interest = 'going') as interested_events,
    
    -- Completed reviews
    (SELECT COUNT(*) FROM user_reviews WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571' AND is_draft = false AND review_text != 'ATTENDANCE_ONLY') as completed_reviews,
    
    -- Review likes
    (SELECT COUNT(DISTINCT rl.id) 
     FROM user_reviews ur 
     JOIN review_likes rl ON ur.id = rl.review_id 
     WHERE ur.user_id = '349bda34-7878-4c10-9f86-ec5888e55571') as review_likes
)
SELECT 
  '🎵 Concert Enthusiast' as achievement,
  attended_events as progress,
  10 as goal,
  CASE WHEN attended_events >= 10 THEN '✅ UNLOCKED' ELSE '⏳ In Progress' END as status
FROM your_stats

UNION ALL

SELECT 
  '📍 Local Expert',
  unique_venues,
  10,
  CASE WHEN unique_venues >= 10 THEN '✅ UNLOCKED' ELSE '⏳ In Progress' END
FROM your_stats

UNION ALL

SELECT 
  '💖 Super Fan',
  artist_follows,
  15,
  CASE WHEN artist_follows >= 15 THEN '✅ UNLOCKED' ELSE '⏳ In Progress' END
FROM your_stats

UNION ALL

SELECT 
  '🐦 Early Bird',
  interested_events,
  50,
  CASE WHEN interested_events >= 50 THEN '✅ UNLOCKED' ELSE '⏳ In Progress' END
FROM your_stats

UNION ALL

SELECT 
  '✍️ Review Master',
  completed_reviews,
  25,
  CASE WHEN completed_reviews >= 25 THEN '✅ UNLOCKED' ELSE '⏳ In Progress' END
FROM your_stats

UNION ALL

SELECT 
  '⭐ Trusted Reviewer',
  CASE WHEN completed_reviews >= 5 AND review_likes >= 20 THEN 1 ELSE 0 END,
  1,
  CASE WHEN completed_reviews >= 5 AND review_likes >= 20 THEN '✅ UNLOCKED' ELSE '⏳ In Progress' END
FROM your_stats;

-- ============================================
-- 12. YOUR Profile Info
-- ============================================

SELECT 
  name,
  email,
  account_type,
  subscription_tier,
  verified,
  created_at
FROM profiles
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571';

-- ============================================
-- 13. TOTAL FOLLOWING (Should Match Profile Count)
-- ============================================

SELECT 
  (SELECT COUNT(*) FROM artist_follows WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571') +
  (SELECT COUNT(*) FROM venue_follows WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571') 
  as total_following;


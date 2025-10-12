-- ============================================
-- SIMPLE ANALYTICS CHECK
-- ============================================
-- Your User ID: 349bda34-7878-4c10-9f86-ec5888e55571

-- ============================================
-- 1. Is Tracking Working?
-- ============================================
SELECT 
  COUNT(*) as total_interactions,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ TRACKING IS WORKING!'
    ELSE '❌ TRACKING IS BROKEN - No data!'
  END as status
FROM user_interactions;

-- ============================================
-- 2. YOUR Personal Interactions
-- ============================================
SELECT 
  event_type,
  COUNT(*) as count
FROM user_interactions
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571'
GROUP BY event_type
ORDER BY count DESC;

-- ============================================
-- 3. YOUR Reviews (For Concert Enthusiast Achievement)
-- ============================================
SELECT 
  COUNT(*) as total_reviews,
  COUNT(*) FILTER (WHERE is_draft = false AND review_text != 'ATTENDANCE_ONLY') as completed_reviews,
  COUNT(*) FILTER (WHERE is_draft = true) as drafts,
  COUNT(*) FILTER (WHERE review_text = 'ATTENDANCE_ONLY') as attendance_only
FROM user_reviews
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571';

-- ============================================
-- 4. YOUR Artist Follows (For Super Fan Achievement)
-- ============================================
SELECT COUNT(*) as artist_follows
FROM artist_follows
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571';

-- ============================================
-- 5. YOUR Venue Follows
-- ============================================
SELECT COUNT(*) as venue_follows
FROM venue_follows
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571';

-- ============================================
-- 6. YOUR Total Following (Should Match Profile)
-- ============================================
SELECT 
  (SELECT COUNT(*) FROM artist_follows WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571') +
  (SELECT COUNT(*) FROM venue_follows WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571') 
  as total_following;

-- ============================================
-- 7. YOUR Interested Events (For Early Bird Achievement)
-- ============================================
SELECT COUNT(*) as interested_events
FROM user_jambase_events
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571';

-- ============================================
-- 8. YOUR Achievement Progress Summary
-- ============================================
SELECT 
  '🎵 Concert Enthusiast' as achievement,
  (SELECT COUNT(*) FROM user_reviews WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571') as progress,
  10 as goal,
  CASE 
    WHEN (SELECT COUNT(*) FROM user_reviews WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571') >= 10 
    THEN '✅ UNLOCKED' 
    ELSE '⏳ In Progress' 
  END as status

UNION ALL

SELECT 
  '💖 Super Fan',
  (SELECT COUNT(*) FROM artist_follows WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571'),
  15,
  CASE 
    WHEN (SELECT COUNT(*) FROM artist_follows WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571') >= 15 
    THEN '✅ UNLOCKED' 
    ELSE '⏳ In Progress' 
  END

UNION ALL

SELECT 
  '🐦 Early Bird',
  (SELECT COUNT(*) FROM user_jambase_events WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571'),
  50,
  CASE 
    WHEN (SELECT COUNT(*) FROM user_jambase_events WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571') >= 50 
    THEN '✅ UNLOCKED' 
    ELSE '⏳ In Progress' 
  END

UNION ALL

SELECT 
  '✍️ Review Master',
  (SELECT COUNT(*) FROM user_reviews WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571' AND is_draft = false AND review_text != 'ATTENDANCE_ONLY'),
  25,
  CASE 
    WHEN (SELECT COUNT(*) FROM user_reviews WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571' AND is_draft = false AND review_text != 'ATTENDANCE_ONLY') >= 25 
    THEN '✅ UNLOCKED' 
    ELSE '⏳ In Progress' 
  END;

-- ============================================
-- 9. Platform-Wide Stats (Admin View)
-- ============================================
SELECT 
  (SELECT COUNT(*) FROM profiles) as total_users,
  (SELECT COUNT(*) FROM jambase_events) as total_events,
  (SELECT COUNT(*) FROM user_reviews WHERE is_draft = false) as total_reviews,
  (SELECT COUNT(*) FROM user_interactions) as total_interactions,
  (SELECT COUNT(*) FROM artist_follows) as total_artist_follows,
  (SELECT COUNT(*) FROM venue_follows) as total_venue_follows;


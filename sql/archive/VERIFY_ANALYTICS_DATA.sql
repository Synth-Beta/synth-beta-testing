-- ============================================
-- ANALYTICS DATA VERIFICATION QUERIES
-- ============================================
-- Run these in Supabase SQL Editor to verify your analytics data is accurate
-- Replace 'YOUR_USER_ID' with your actual user ID

-- ============================================
-- CRITICAL: Check if tracking is working
-- ============================================

-- 1. Total interactions (should be > 0 if tracking is working)
SELECT COUNT(*) as total_interactions 
FROM user_interactions;

-- 2. Break down by event type
SELECT 
  event_type,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM user_interactions
GROUP BY event_type
ORDER BY count DESC;

-- ============================================
-- USER ANALYTICS VERIFICATION
-- ============================================

-- 3. Your personal interaction counts (replace YOUR_USER_ID)
SELECT 
  event_type,
  entity_type,
  COUNT(*) as count
FROM user_interactions
WHERE user_id = 'YOUR_USER_ID'
GROUP BY event_type, entity_type
ORDER BY count DESC;

-- 4. Attended events breakdown (should match "Concert Enthusiast" achievement)
SELECT 
  COUNT(*) FILTER (WHERE is_draft = false AND review_text != 'ATTENDANCE_ONLY') as completed_reviews,
  COUNT(*) FILTER (WHERE is_draft = true) as draft_reviews,
  COUNT(*) FILTER (WHERE review_text = 'ATTENDANCE_ONLY') as attendance_only,
  COUNT(*) as total_attended
FROM user_reviews
WHERE user_id = 'YOUR_USER_ID';

-- 5. Unique venues attended (should match "Local Expert" achievement)
SELECT 
  COUNT(DISTINCT je.venue_name) as unique_venues,
  STRING_AGG(DISTINCT je.venue_name, ', ' ORDER BY je.venue_name) as venue_names
FROM user_reviews ur
JOIN jambase_events je ON ur.jambase_event_id = je.id
WHERE ur.user_id = 'YOUR_USER_ID';

-- 6. Artist follows (should match "Super Fan" achievement progress)
SELECT 
  COUNT(*) as artist_follows_count,
  STRING_AGG(artist_name, ', ' ORDER BY artist_name) as followed_artists
FROM artist_follows
WHERE user_id = 'YOUR_USER_ID';

-- 7. Venue follows
SELECT 
  COUNT(*) as venue_follows_count,
  STRING_AGG(venue_name, ', ' ORDER BY venue_name) as followed_venues
FROM venue_follows
WHERE user_id = 'YOUR_USER_ID';

-- 8. Interested events (should match "Early Bird" achievement progress)
SELECT COUNT(*) as interested_events
FROM user_jambase_events
WHERE user_id = 'YOUR_USER_ID'
  AND interest = 'going';

-- 9. Completed reviews only (should match "Review Master" achievement)
SELECT COUNT(*) as completed_reviews
FROM user_reviews
WHERE user_id = 'YOUR_USER_ID'
  AND is_draft = false
  AND review_text != 'ATTENDANCE_ONLY';

-- 10. Review likes (should match "Trusted Reviewer" / "Influencer" achievements)
SELECT 
  COUNT(DISTINCT rl.id) as total_likes,
  COUNT(DISTINCT ur.id) as reviews_with_likes
FROM user_reviews ur
LEFT JOIN review_likes rl ON ur.id = rl.review_id
WHERE ur.user_id = 'YOUR_USER_ID'
  AND ur.is_draft = false;

-- ============================================
-- CREATOR ANALYTICS VERIFICATION
-- ============================================

-- 11. Check if you have a creator profile
SELECT 
  user_id,
  name,
  account_type,
  business_info->>'artist_name' as artist_name,
  business_info->>'artist_id' as artist_id
FROM profiles
WHERE user_id = 'YOUR_USER_ID';

-- 12. Events for a specific artist (replace 'Artist Name')
SELECT 
  COUNT(*) as event_count,
  STRING_AGG(DISTINCT venue_name, ', ') as venues
FROM jambase_events
WHERE artist_name ILIKE '%Artist Name%';

-- 13. Followers for an artist (replace 'Artist Name')
SELECT COUNT(*) as follower_count
FROM artist_follows
WHERE artist_name = 'Artist Name';

-- 14. Reviews for an artist's events (replace 'Artist Name')
SELECT COUNT(*) as review_count
FROM user_reviews ur
JOIN jambase_events je ON ur.jambase_event_id = je.id
WHERE je.artist_name ILIKE '%Artist Name%';

-- ============================================
-- BUSINESS ANALYTICS VERIFICATION
-- ============================================

-- 15. Events at a specific venue (replace 'Venue Name')
SELECT 
  COUNT(*) as event_count,
  STRING_AGG(DISTINCT artist_name, ', ') as artists_performed
FROM jambase_events
WHERE venue_name = 'Venue Name';

-- 16. Attendance at a venue (replace 'Venue Name')
SELECT COUNT(*) as total_attendance
FROM user_reviews ur
JOIN jambase_events je ON ur.jambase_event_id = je.id
WHERE je.venue_name = 'Venue Name';

-- 17. Venue followers (replace 'Venue Name')
SELECT COUNT(*) as follower_count
FROM venue_follows
WHERE venue_name = 'Venue Name';

-- ============================================
-- ADMIN ANALYTICS VERIFICATION
-- ============================================

-- 18. Platform-wide user stats
SELECT 
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as new_users_this_month,
  COUNT(*) FILTER (WHERE account_type = 'user') as regular_users,
  COUNT(*) FILTER (WHERE account_type = 'creator') as creators,
  COUNT(*) FILTER (WHERE account_type = 'business') as businesses,
  COUNT(*) FILTER (WHERE account_type = 'admin') as admins
FROM profiles;

-- 19. Platform-wide content stats
SELECT 
  (SELECT COUNT(*) FROM jambase_events) as total_events,
  (SELECT COUNT(*) FROM jambase_events WHERE created_at >= NOW() - INTERVAL '30 days') as events_this_month,
  (SELECT COUNT(*) FROM artists) as total_artists,
  (SELECT COUNT(*) FROM venues) as total_venues,
  (SELECT COUNT(*) FROM user_reviews WHERE is_draft = false) as total_reviews,
  (SELECT ROUND(AVG(rating), 2) FROM user_reviews WHERE rating IS NOT NULL) as avg_rating;

-- 20. Platform-wide engagement stats
SELECT 
  COUNT(*) as total_interactions,
  COUNT(*) FILTER (WHERE event_type = 'view') as total_views,
  COUNT(*) FILTER (WHERE event_type = 'click') as total_clicks,
  COUNT(*) FILTER (WHERE event_type = 'click_ticket') as total_ticket_clicks,
  COUNT(*) FILTER (WHERE event_type = 'search') as total_searches,
  COUNT(DISTINCT user_id) as unique_users_interacting
FROM user_interactions;

-- 21. Today's active users
SELECT 
  COUNT(DISTINCT user_id) as active_users_today
FROM user_interactions
WHERE occurred_at >= CURRENT_DATE;

-- 22. User growth by day (last 30 days)
SELECT 
  DATE(created_at) as date,
  COUNT(*) as new_users
FROM profiles
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 23. Daily active users (last 30 days)
SELECT 
  DATE(occurred_at) as date,
  COUNT(DISTINCT user_id) as active_users
FROM user_interactions
WHERE occurred_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(occurred_at)
ORDER BY date DESC;

-- 24. Estimated revenue (ticket clicks * $50)
SELECT 
  COUNT(*) FILTER (WHERE event_type = 'click_ticket') as ticket_clicks,
  COUNT(*) FILTER (WHERE event_type = 'click_ticket') * 50 as estimated_revenue_usd
FROM user_interactions;

-- ============================================
-- DATA QUALITY CHECKS
-- ============================================

-- 25. Check for orphaned data
SELECT 
  'Reviews without events' as issue,
  COUNT(*) as count
FROM user_reviews ur
LEFT JOIN jambase_events je ON ur.jambase_event_id = je.id
WHERE je.id IS NULL

UNION ALL

SELECT 
  'Artist follows without artist' as issue,
  COUNT(*) as count
FROM artist_follows af
LEFT JOIN artists a ON af.artist_name = a.name
LEFT JOIN artist_profile ap ON af.artist_name = ap.name
WHERE a.id IS NULL AND ap.id IS NULL

UNION ALL

SELECT 
  'Interactions without user' as issue,
  COUNT(*) as count
FROM user_interactions ui
LEFT JOIN profiles p ON ui.user_id = p.user_id
WHERE p.user_id IS NULL;

-- 26. Check for duplicate data
SELECT 
  'Duplicate artist follows' as issue,
  COUNT(*) as count
FROM (
  SELECT user_id, artist_name, COUNT(*) as dup_count
  FROM artist_follows
  GROUP BY user_id, artist_name
  HAVING COUNT(*) > 1
) dups;

-- ============================================
-- SUMMARY REPORT
-- ============================================

-- 27. Overall health check
SELECT 
  '✅ Tracking System' as component,
  CASE 
    WHEN (SELECT COUNT(*) FROM user_interactions) > 0 THEN 'Working ✓'
    ELSE 'NOT WORKING ✗'
  END as status,
  (SELECT COUNT(*) FROM user_interactions) as count
  
UNION ALL

SELECT 
  '✅ User Reviews' as component,
  CASE 
    WHEN (SELECT COUNT(*) FROM user_reviews) > 0 THEN 'Has Data ✓'
    ELSE 'Empty ✗'
  END as status,
  (SELECT COUNT(*) FROM user_reviews) as count

UNION ALL

SELECT 
  '✅ Artist Follows' as component,
  CASE 
    WHEN (SELECT COUNT(*) FROM artist_follows) > 0 THEN 'Has Data ✓'
    ELSE 'Empty ✗'
  END as status,
  (SELECT COUNT(*) FROM artist_follows) as count

UNION ALL

SELECT 
  '✅ Venue Follows' as component,
  CASE 
    WHEN (SELECT COUNT(*) FROM venue_follows) > 0 THEN 'Has Data ✓'
    ELSE 'Empty ✗'
  END as status,
  (SELECT COUNT(*) FROM venue_follows) as count

UNION ALL

SELECT 
  '✅ Events' as component,
  'Has Data ✓' as status,
  (SELECT COUNT(*) FROM jambase_events) as count

UNION ALL

SELECT 
  '✅ Users' as component,
  'Has Data ✓' as status,
  (SELECT COUNT(*) FROM profiles) as count;


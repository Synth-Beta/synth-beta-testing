-- ============================================
-- CRITICAL PERFORMANCE OPTIMIZATIONS
-- ============================================
-- Run these SQL commands to fix database performance issues

-- ============================================
-- PART 1: REGULAR INDEXES (can run in transaction)
-- ============================================

-- 1. Events table - Basic indexes for common queries
CREATE INDEX IF NOT EXISTS idx_jambase_events_event_date_asc
ON jambase_events(event_date);

CREATE INDEX IF NOT EXISTS idx_jambase_events_event_date_desc
ON jambase_events(event_date DESC);

-- 2. Events table - Artist name searches
CREATE INDEX IF NOT EXISTS idx_jambase_events_artist_name
ON jambase_events(artist_name);

-- 3. Events table - Venue name searches
CREATE INDEX IF NOT EXISTS idx_jambase_events_venue_name
ON jambase_events(venue_name);

-- 4. Events table - Location coordinates
CREATE INDEX IF NOT EXISTS idx_jambase_events_latitude_longitude
ON jambase_events(latitude, longitude);

-- 5. Events table - Created by user
CREATE INDEX IF NOT EXISTS idx_jambase_events_created_by_user_id
ON jambase_events(created_by_user_id);

-- 6. Events table - Claimed by creator
CREATE INDEX IF NOT EXISTS idx_jambase_events_claimed_by_creator_id
ON jambase_events(claimed_by_creator_id);

-- 7. Events table - Event status
CREATE INDEX IF NOT EXISTS idx_jambase_events_event_status
ON jambase_events(event_status);

-- 8. Events table - Promotion tier
CREATE INDEX IF NOT EXISTS idx_jambase_events_promotion_tier
ON jambase_events(promotion_tier);

-- ============================================
-- PART 2: PROMOTION SYSTEM INDEXES
-- ============================================

-- 9. Event promotions - Event ID
CREATE INDEX IF NOT EXISTS idx_event_promotions_event_id
ON event_promotions(event_id);

-- 10. Event promotions - Promoted by user
CREATE INDEX IF NOT EXISTS idx_event_promotions_promoted_by_user_id
ON event_promotions(promoted_by_user_id);

-- 11. Event promotions - Promotion status
CREATE INDEX IF NOT EXISTS idx_event_promotions_promotion_status
ON event_promotions(promotion_status);

-- 12. Event promotions - Promotion tier
CREATE INDEX IF NOT EXISTS idx_event_promotions_promotion_tier
ON event_promotions(promotion_tier);

-- 13. Event promotions - Created at
CREATE INDEX IF NOT EXISTS idx_event_promotions_created_at
ON event_promotions(created_at);

-- ============================================
-- PART 3: USER INTERACTIONS INDEXES
-- ============================================

-- 14. User events - User ID
CREATE INDEX IF NOT EXISTS idx_user_jambase_events_user_id
ON user_jambase_events(user_id);

-- 15. User events - Event ID
CREATE INDEX IF NOT EXISTS idx_user_jambase_events_jambase_event_id
ON user_jambase_events(jambase_event_id);

-- 16. User events - Created at
CREATE INDEX IF NOT EXISTS idx_user_jambase_events_created_at
ON user_jambase_events(created_at);

-- ============================================
-- PART 4: REVIEW SYSTEM INDEXES
-- ============================================

-- 17. User reviews - Event ID
CREATE INDEX IF NOT EXISTS idx_user_reviews_event_id
ON user_reviews(event_id);

-- 18. User reviews - User ID
CREATE INDEX IF NOT EXISTS idx_user_reviews_user_id
ON user_reviews(user_id);

-- 19. User reviews - Artist ID
CREATE INDEX IF NOT EXISTS idx_user_reviews_artist_id
ON user_reviews(artist_id);

-- 20. User reviews - Venue ID
CREATE INDEX IF NOT EXISTS idx_user_reviews_venue_id
ON user_reviews(venue_id);

-- 21. User reviews - Is public
CREATE INDEX IF NOT EXISTS idx_user_reviews_is_public
ON user_reviews(is_public);

-- 22. User reviews - Created at
CREATE INDEX IF NOT EXISTS idx_user_reviews_created_at
ON user_reviews(created_at);

-- ============================================
-- PART 5: ANALYTICS INDEXES
-- ============================================

-- 23. User interactions - Entity ID
CREATE INDEX IF NOT EXISTS idx_user_interactions_entity_id
ON user_interactions(entity_id);

-- 24. User interactions - Entity type
CREATE INDEX IF NOT EXISTS idx_user_interactions_entity_type
ON user_interactions(entity_type);

-- 25. User interactions - Event type
CREATE INDEX IF NOT EXISTS idx_user_interactions_event_type
ON user_interactions(event_type);

-- 26. User interactions - User ID
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_id
ON user_interactions(user_id);

-- 27. User interactions - Occurred at
CREATE INDEX IF NOT EXISTS idx_user_interactions_occurred_at
ON user_interactions(occurred_at);

-- ============================================
-- PART 6: FRIENDS SYSTEM INDEXES
-- ============================================

-- 28. Friends - User 1 ID
CREATE INDEX IF NOT EXISTS idx_friends_user1_id
ON friends(user1_id);

-- 29. Friends - User 2 ID
CREATE INDEX IF NOT EXISTS idx_friends_user2_id
ON friends(user2_id);

-- 30. Friends - Remove status index (friends table has no status column)

-- 31. Friends - Created at
CREATE INDEX IF NOT EXISTS idx_friends_created_at
ON friends(created_at);

-- ============================================
-- PART 7: NOTIFICATIONS INDEXES
-- ============================================

-- 32. Notifications - User ID
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
ON notifications(user_id);

-- 33. Notifications - Type
CREATE INDEX IF NOT EXISTS idx_notifications_type
ON notifications(type);

-- 34. Notifications - Is read
CREATE INDEX IF NOT EXISTS idx_notifications_is_read
ON notifications(is_read);

-- 35. Notifications - Created at
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
ON notifications(created_at);

-- ============================================
-- PART 8: PROFILES INDEXES
-- ============================================

-- 36. Profiles - User ID
CREATE INDEX IF NOT EXISTS idx_profiles_user_id
ON profiles(user_id);

-- 37. Profiles - Account type
CREATE INDEX IF NOT EXISTS idx_profiles_account_type
ON profiles(account_type);

-- 38. Profiles - Created at
CREATE INDEX IF NOT EXISTS idx_profiles_created_at
ON profiles(created_at);

-- ============================================
-- PART 11: PERFORMANCE MONITORING
-- ============================================

-- Create a function to monitor slow queries
CREATE OR REPLACE FUNCTION log_slow_queries()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- This function can be used to log slow queries
  -- Implementation depends on your monitoring setup
  NULL;
END;
$$;

-- ============================================
-- PART 12: VERIFICATION QUERIES
-- ============================================

-- Check index creation status
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Check table sizes and index usage
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================
-- COMPLETION MESSAGE
-- ============================================

SELECT 
  'Database Performance Optimization Complete' as status,
  'All critical indexes have been created' as message,
  NOW() as completed_at;

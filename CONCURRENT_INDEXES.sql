-- ============================================
-- CONCURRENT INDEX CREATION
-- ============================================
-- Run these commands ONE BY ONE (not in a transaction)
-- These indexes are created concurrently to avoid blocking the database

-- 1. Events table - Active events by date (most common query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jambase_events_active_date 
ON jambase_events(event_date, event_status) 
WHERE event_status = 'published';

-- 2. Events table - Location-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jambase_events_location_date
ON jambase_events(latitude, longitude, event_date)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- 3. Events table - Artist name searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jambase_events_artist_date
ON jambase_events(artist_name, event_date);

-- 4. Events table - Venue searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jambase_events_venue_date
ON jambase_events(venue_name, event_date);

-- 5. Events table - Genre filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jambase_events_genres
ON jambase_events USING GIN(genres)
WHERE genres IS NOT NULL;

-- 6. Events table - Created by user
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jambase_events_created_by_date
ON jambase_events(created_by_user_id, event_date)
WHERE created_by_user_id IS NOT NULL;

-- 7. Events table - Claimed events
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jambase_events_claimed_by_date
ON jambase_events(claimed_by_creator_id, event_date)
WHERE claimed_by_creator_id IS NOT NULL;

-- 8. Event promotions - Active promotions composite index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_promotions_active_composite
ON event_promotions(promotion_status, expires_at, starts_at, promotion_tier)
WHERE promotion_status = 'active';

-- 9. Event promotions - User promotions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_promotions_user_status
ON event_promotions(promoted_by_user_id, promotion_status, created_at);

-- 10. Event promotions - Pending promotions for admin review
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_promotions_pending_admin
ON event_promotions(promotion_status, created_at)
WHERE promotion_status = 'pending';

-- 11. User events - User interested events
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_jambase_events_user_date
ON user_jambase_events(user_id, created_at);

-- 12. User events - Event popularity
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_jambase_events_event_count
ON user_jambase_events(jambase_event_id);

-- 13. User reviews - Event reviews
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_reviews_event_public
ON user_reviews(event_id, is_public, created_at)
WHERE is_public = true;

-- 14. User reviews - User review history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_reviews_user_date
ON user_reviews(user_id, created_at);

-- 15. User reviews - Artist reviews
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_reviews_artist_public
ON user_reviews(artist_id, is_public, created_at)
WHERE is_public = true AND artist_id IS NOT NULL;

-- 16. User reviews - Venue reviews
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_reviews_venue_public
ON user_reviews(venue_id, is_public, created_at)
WHERE is_public = true AND venue_id IS NOT NULL;

-- 17. User interactions - Event interactions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_interactions_event_type
ON user_interactions(entity_id, event_type, occurred_at)
WHERE entity_type = 'event';

-- 18. User interactions - User activity
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_interactions_user_date
ON user_interactions(user_id, occurred_at);

-- 19. Friends - User friendships
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_friends_user1_created
ON friends(user1_id, created_at);

-- 20. Friends - User friendships (reverse)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_friends_user2_created
ON friends(user2_id, created_at);

-- 21. Notifications - User notifications
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_unread
ON notifications(user_id, is_read, created_at)
WHERE is_read = false;

-- 22. Notifications - Notification types
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_type_date
ON notifications(type, created_at);

-- 23. Analytics - User daily stats
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_user_daily_user_date
ON analytics_user_daily(user_id, date DESC);

-- 24. Analytics - Event daily stats
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_event_daily_event_date
ON analytics_event_daily(event_id, date DESC);

-- 25. Analytics - Artist daily stats
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_artist_daily_artist_date
ON analytics_artist_daily(artist_name, date DESC);

-- 26. Analytics - Venue daily stats
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_venue_daily_venue_date
ON analytics_venue_daily(venue_name, date DESC);

-- 27. Profiles - Account type filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_account_type
ON profiles(account_type, created_at);

-- 28. Profiles - User profile lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_user_id
ON profiles(user_id);

-- 29. Artist profiles - Name searches (requires trigram extension)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_artist_profile_name_trgm
ON artist_profile USING gin(name gin_trgm_ops);

-- 30. Venue profiles - Name searches (requires trigram extension)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venue_profile_name_trgm
ON venue_profile USING gin(name gin_trgm_ops);

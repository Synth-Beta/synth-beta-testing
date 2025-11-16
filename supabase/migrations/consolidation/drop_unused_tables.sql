-- ============================================
-- DROP UNUSED TABLES AFTER CONSOLIDATION
-- ============================================
-- Drops tables that have been consolidated into new structure
-- Run this AFTER migration is complete and verified

-- ============================================
-- 1. DROP OLD RELATIONSHIP TABLES
-- ============================================

-- Drop friends table (consolidated into user_relationships)
DROP TABLE IF EXISTS public.friends CASCADE;

-- Drop friend_requests table (consolidated into user_relationships)
DROP TABLE IF EXISTS public.friend_requests CASCADE;

-- Drop matches table (consolidated into user_relationships)
DROP TABLE IF EXISTS public.matches CASCADE;

-- Drop user_swipes table (if not needed - matching is now in user_relationships)
DROP TABLE IF EXISTS public.user_swipes CASCADE;

-- ============================================
-- 2. DROP OLD FOLLOW TABLES
-- ============================================

-- Drop artist_follows table (consolidated into follows)
DROP TABLE IF EXISTS public.artist_follows CASCADE;

-- Drop venue_follows table (consolidated into follows)
DROP TABLE IF EXISTS public.venue_follows CASCADE;

-- Note: user follows were in relationships, now in follows

-- ============================================
-- 3. DROP OLD EVENT INTEREST TABLES
-- ============================================

-- Drop user_jambase_events table (consolidated into relationships for events)
DROP TABLE IF EXISTS public.user_jambase_events CASCADE;

-- Drop event_interests table (if it exists, consolidated into relationships)
DROP TABLE IF EXISTS public.event_interests CASCADE;

-- ============================================
-- 4. DROP GENRE INTERACTION TABLES
-- ============================================

-- Drop user_genre_interactions table (consolidated into user_genre_preferences)
DROP TABLE IF EXISTS public.user_genre_interactions CASCADE;

-- ============================================
-- 5. DROP BACKUP/TEMP TABLES
-- ============================================

-- Drop old backup tables
DROP TABLE IF EXISTS public.relationships_old CASCADE;
DROP TABLE IF EXISTS public.relationships_new CASCADE;
DROP TABLE IF EXISTS public.friends_old CASCADE;
DROP TABLE IF EXISTS public.matches_old CASCADE;
DROP TABLE IF EXISTS public.artist_follows_old CASCADE;
DROP TABLE IF EXISTS public.venue_follows_old CASCADE;

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- Verify which tables still exist (should not include dropped ones)
SELECT 
  'Verification: Remaining tables' as check_type,
  COUNT(*) FILTER (WHERE table_name IN ('friends', 'friend_requests', 'matches', 'user_swipes', 
                                         'artist_follows', 'venue_follows', 
                                         'user_jambase_events', 'event_interests',
                                         'user_genre_interactions')) as old_tables_remaining,
  COUNT(*) FILTER (WHERE table_name IN ('follows', 'user_relationships', 'relationships', 
                                         'user_genre_preferences')) as new_tables_exist
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';


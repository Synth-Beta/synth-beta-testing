-- ============================================
-- DROP OLD POLYMORPHIC RELATIONSHIPS TABLES
-- ============================================
-- ONLY run this after:
-- 1. ✅ All code has been updated to use 3NF tables
-- 2. ✅ All database functions have been updated
-- 3. ✅ Data has been migrated (verified with 20250327000002_final_3nf_verification.sql)
-- 4. ✅ Application has been tested and works correctly
--
-- This will permanently delete the old tables!
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Final Verification Before Dropping
-- ============================================
DO $$
DECLARE
  old_artist_count INTEGER;
  new_artist_count INTEGER;
  old_venue_count INTEGER;
  new_venue_count INTEGER;
  old_event_count INTEGER;
  new_event_count INTEGER;
  old_friend_count INTEGER;
  new_friend_count INTEGER;
  old_match_count INTEGER;
  new_match_count INTEGER;
BEGIN
  -- Count old relationships
  SELECT COUNT(*) INTO old_artist_count FROM relationships WHERE related_entity_type = 'artist' AND relationship_type = 'follow';
  SELECT COUNT(*) INTO old_venue_count FROM relationships WHERE related_entity_type = 'venue' AND relationship_type = 'follow';
  SELECT COUNT(*) INTO old_event_count FROM relationships WHERE related_entity_type = 'event' AND relationship_type IN ('interest', 'going', 'maybe', 'not_going');
  SELECT COUNT(*) INTO old_friend_count FROM relationships WHERE related_entity_type = 'user' AND relationship_type = 'friend' AND status = 'accepted';
  SELECT COUNT(*) INTO old_match_count FROM relationships WHERE related_entity_type = 'user' AND relationship_type = 'match';
  
  -- Count new 3NF tables
  SELECT COUNT(*) INTO new_artist_count FROM artist_follows;
  SELECT COUNT(*) INTO new_venue_count FROM user_venue_relationships;
  SELECT COUNT(*) INTO new_event_count FROM user_event_relationships;
  SELECT COUNT(*) INTO new_friend_count FROM user_relationships WHERE relationship_type = 'friend' AND status = 'accepted';
  SELECT COUNT(*) INTO new_match_count FROM user_relationships WHERE relationship_type = 'match';
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'FINAL DATA VERIFICATION BEFORE DROP';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Artist follows: % (old) → % (new)', old_artist_count, new_artist_count;
  RAISE NOTICE 'Venue follows: % (old) → % (new)', old_venue_count, new_venue_count;
  RAISE NOTICE 'Event RSVPs: % (old) → % (new)', old_event_count, new_event_count;
  RAISE NOTICE 'Friendships: % (old) → % (new)', old_friend_count, new_friend_count;
  RAISE NOTICE 'Matches: % (old) → % (new)', old_match_count, new_match_count;
  RAISE NOTICE '================================================';
  
  -- Check if all data has been migrated
  IF new_artist_count < old_artist_count THEN
    RAISE EXCEPTION 'Data migration incomplete: Artist follows not fully migrated (% < %)', new_artist_count, old_artist_count;
  END IF;
  
  IF new_venue_count < old_venue_count THEN
    RAISE EXCEPTION 'Data migration incomplete: Venue follows not fully migrated (% < %)', new_venue_count, old_venue_count;
  END IF;
  
  IF new_event_count < old_event_count THEN
    RAISE EXCEPTION 'Data migration incomplete: Event RSVPs not fully migrated (% < %)', new_event_count, old_event_count;
  END IF;
  
  IF new_friend_count < old_friend_count THEN
    RAISE EXCEPTION 'Data migration incomplete: Friendships not fully migrated (% < %)', new_friend_count, old_friend_count;
  END IF;
  
  IF new_match_count < old_match_count THEN
    RAISE EXCEPTION 'Data migration incomplete: Matches not fully migrated (% < %)', new_match_count, old_match_count;
  END IF;
  
  RAISE NOTICE '✅ All data verified! Proceeding with table drop...';
END $$;

-- ============================================
-- STEP 2: Drop Old Tables
-- ============================================
-- Drop relationships table (polymorphic, replaced by 3NF tables)
DROP TABLE IF EXISTS public.relationships CASCADE;

-- Drop venue_follows table (name-based, replaced by user_venue_relationships with FK)
DROP TABLE IF EXISTS public.venue_follows CASCADE;

-- ============================================
-- STEP 3: Verification After Drop
-- ============================================
DO $$
DECLARE
  relationships_exists BOOLEAN;
  venue_follows_exists BOOLEAN;
BEGIN
  -- Check if tables were successfully dropped
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'relationships'
  ) INTO relationships_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'venue_follows'
  ) INTO venue_follows_exists;
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'DROP VERIFICATION';
  RAISE NOTICE '================================================';
  
  IF relationships_exists THEN
    RAISE WARNING '⚠️ relationships table still exists!';
  ELSE
    RAISE NOTICE '✅ relationships table successfully dropped';
  END IF;
  
  IF venue_follows_exists THEN
    RAISE WARNING '⚠️ venue_follows table still exists!';
  ELSE
    RAISE NOTICE '✅ venue_follows table successfully dropped';
  END IF;
  
  RAISE NOTICE '================================================';
  RAISE NOTICE '✅ 3NF Migration Complete!';
  RAISE NOTICE 'All relationships now use proper foreign keys:';
  RAISE NOTICE '  - artist_follows (user → artist)';
  RAISE NOTICE '  - user_venue_relationships (user → venue)';
  RAISE NOTICE '  - user_event_relationships (user → event)';
  RAISE NOTICE '  - user_relationships (user → user)';
  RAISE NOTICE '================================================';
END $$;

COMMIT;

-- ============================================
-- POST-DROP VERIFICATION QUERIES
-- ============================================
-- Run these to confirm everything is working:
--
-- 1. Check new table counts:
--    SELECT COUNT(*) FROM artist_follows;
--    SELECT COUNT(*) FROM user_venue_relationships;
--    SELECT COUNT(*) FROM user_event_relationships;
--    SELECT COUNT(*) FROM user_relationships;
--
-- 2. Verify old tables are gone:
--    SELECT table_name FROM information_schema.tables 
--    WHERE table_schema = 'public' 
--    AND table_name IN ('relationships', 'venue_follows');
--
-- 3. Test a function that uses the new tables:
--    SELECT * FROM get_personalized_feed_v3(
--      'your-user-id-here'::UUID,
--      10, 0, NULL, NULL, 50
--    ) LIMIT 5;


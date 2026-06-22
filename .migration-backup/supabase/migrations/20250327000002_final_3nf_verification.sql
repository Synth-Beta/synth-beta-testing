-- ============================================
-- FINAL 3NF VERIFICATION (POST-MIGRATION)
-- ============================================
-- Run this to verify all code and functions are updated
-- Works both BEFORE and AFTER dropping old tables

BEGIN;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- 1. Check for any remaining references to relationships table in functions
DO $$
DECLARE
  func_count INTEGER;
  r RECORD;
BEGIN
  SELECT COUNT(*) INTO func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.prosrc LIKE '%FROM relationships%'
    AND p.prosrc NOT LIKE '%FROM user_relationships%'
    AND p.prosrc NOT LIKE '%FROM artist_follows%'
    AND p.prosrc NOT LIKE '%FROM user_event_relationships%'
    AND p.prosrc NOT LIKE '%FROM user_venue_relationships%';
  
  IF func_count > 0 THEN
    RAISE WARNING 'Found % function(s) that still reference relationships table', func_count;
    RAISE NOTICE 'Functions that need updating:';
    FOR r IN 
      SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.prosrc LIKE '%FROM relationships%'
        AND p.prosrc NOT LIKE '%FROM user_relationships%'
        AND p.prosrc NOT LIKE '%FROM artist_follows%'
        AND p.prosrc NOT LIKE '%FROM user_event_relationships%'
        AND p.prosrc NOT LIKE '%FROM user_venue_relationships%'
    LOOP
      RAISE NOTICE '  - %(%)', r.proname, r.args;
    END LOOP;
  ELSE
    RAISE NOTICE '✅ No functions found that reference old relationships table';
  END IF;
END $$;

-- 2. Check for views that reference relationships
DO $$
DECLARE
  view_count INTEGER;
  r RECORD;
BEGIN
  SELECT COUNT(*) INTO view_count
  FROM information_schema.views
  WHERE table_schema = 'public'
    AND view_definition LIKE '%FROM relationships%'
    AND view_definition NOT LIKE '%FROM user_relationships%'
    AND view_definition NOT LIKE '%FROM artist_follows%'
    AND view_definition NOT LIKE '%FROM user_event_relationships%'
    AND view_definition NOT LIKE '%FROM user_venue_relationships%';
  
  IF view_count > 0 THEN
    RAISE WARNING 'Found % view(s) that still reference relationships table', view_count;
    RAISE NOTICE 'Views that need updating:';
    FOR r IN 
      SELECT table_name, view_definition
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND view_definition LIKE '%FROM relationships%'
        AND view_definition NOT LIKE '%FROM user_relationships%'
        AND view_definition NOT LIKE '%FROM artist_follows%'
        AND view_definition NOT LIKE '%FROM user_event_relationships%'
        AND view_definition NOT LIKE '%FROM user_venue_relationships%'
    LOOP
      RAISE NOTICE '  - %', r.table_name;
    END LOOP;
  ELSE
    RAISE NOTICE '✅ No views found that reference old relationships table';
  END IF;
END $$;

-- 3. Verify data migration counts (handles case where old tables are already dropped)
DO $$
DECLARE
  old_artist_count INTEGER := 0;
  new_artist_count INTEGER;
  old_venue_count INTEGER := 0;
  new_venue_count INTEGER;
  old_event_count INTEGER := 0;
  new_event_count INTEGER;
  old_friend_count INTEGER := 0;
  new_friend_count INTEGER;
  relationships_exists BOOLEAN;
  venue_follows_exists BOOLEAN;
BEGIN
  -- Check if old tables still exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'relationships'
  ) INTO relationships_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'venue_follows'
  ) INTO venue_follows_exists;
  
  -- Count old relationships (only if table exists)
  IF relationships_exists THEN
    SELECT COUNT(*) INTO old_artist_count FROM relationships WHERE related_entity_type = 'artist' AND relationship_type = 'follow';
    SELECT COUNT(*) INTO old_venue_count FROM relationships WHERE related_entity_type = 'venue' AND relationship_type = 'follow';
    SELECT COUNT(*) INTO old_event_count FROM relationships WHERE related_entity_type = 'event' AND relationship_type IN ('interest', 'going', 'maybe', 'not_going');
    SELECT COUNT(*) INTO old_friend_count FROM relationships WHERE related_entity_type = 'user' AND relationship_type = 'friend' AND status = 'accepted';
  END IF;
  
  -- Count new 3NF tables
  SELECT COUNT(*) INTO new_artist_count FROM artist_follows;
  SELECT COUNT(*) INTO new_venue_count FROM user_venue_relationships;
  SELECT COUNT(*) INTO new_event_count FROM user_event_relationships;
  SELECT COUNT(*) INTO new_friend_count FROM user_relationships WHERE relationship_type = 'friend' AND status = 'accepted';
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'DATA MIGRATION VERIFICATION';
  RAISE NOTICE '================================================';
  
  IF relationships_exists THEN
    RAISE NOTICE 'Old tables still exist - comparing counts:';
    RAISE NOTICE 'Artist follows: % (old) → % (new)', old_artist_count, new_artist_count;
    RAISE NOTICE 'Venue follows: % (old) → % (new)', old_venue_count, new_venue_count;
    RAISE NOTICE 'Event RSVPs: % (old) → % (new)', old_event_count, new_event_count;
    RAISE NOTICE 'Friendships: % (old) → % (new)', old_friend_count, new_friend_count;
    
    IF new_artist_count >= old_artist_count AND 
       new_venue_count >= old_venue_count AND 
       new_event_count >= old_event_count AND
       new_friend_count >= old_friend_count THEN
      RAISE NOTICE '✅ Data migration looks good!';
    ELSE
      RAISE WARNING '⚠️ Some data may not have been migrated. Check counts above.';
    END IF;
  ELSE
    RAISE NOTICE '✅ Old relationships table has been dropped';
    RAISE NOTICE 'Current 3NF table counts:';
    RAISE NOTICE 'Artist follows: %', new_artist_count;
    RAISE NOTICE 'Venue follows: %', new_venue_count;
    RAISE NOTICE 'Event RSVPs: %', new_event_count;
    RAISE NOTICE 'Friendships: %', new_friend_count;
    RAISE NOTICE '✅ Migration complete - old tables removed';
  END IF;
  
  IF venue_follows_exists THEN
    RAISE WARNING '⚠️ Old venue_follows table still exists (should be dropped)';
  ELSE
    RAISE NOTICE '✅ Old venue_follows table has been dropped';
  END IF;
  
  RAISE NOTICE '================================================';
END $$;

COMMIT;

-- ============================================
-- VERIFICATION COMPLETE
-- ============================================
-- This script verifies:
-- 1. No functions reference old relationships table
-- 2. No views reference old relationships table
-- 3. Data migration counts (or confirms old tables are dropped)
--
-- If old tables still exist and you want to drop them:
--    BEGIN;
--    DROP TABLE IF EXISTS relationships CASCADE;
--    DROP TABLE IF EXISTS venue_follows CASCADE;
--    COMMIT;
--
-- Note: CASCADE will drop any remaining dependencies (views, functions, etc.)
-- Make sure you've updated everything first!


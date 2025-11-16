-- ============================================
-- FINAL VERIFICATION SCRIPT
-- Database Consolidation Migration
-- ============================================
-- Run this AFTER all migrations and TypeScript updates are complete
-- This verifies that the consolidation was successful

-- ============================================
-- 1. TABLE EXISTENCE AND ROW COUNTS
-- ============================================

-- Check if consolidated tables exist (both with and without _new suffix)
SELECT 
  'Table Existence Check' as check_category,
  table_name,
  CASE 
    WHEN table_name IN ('users', 'users_new') THEN 'Users table'
    WHEN table_name IN ('events', 'events_new') THEN 'Events table'
    WHEN table_name IN ('artists', 'artists_new') THEN 'Artists table'
    WHEN table_name IN ('venues', 'venues_new') THEN 'Venues table'
    WHEN table_name IN ('relationships', 'relationships_new') THEN 'Relationships table'
    WHEN table_name IN ('reviews', 'reviews_new') THEN 'Reviews table'
    WHEN table_name IN ('comments', 'comments_new') THEN 'Comments table'
    WHEN table_name IN ('engagements', 'engagements_new') THEN 'Engagements table'
    WHEN table_name IN ('interactions', 'interactions_new') THEN 'Interactions table'
    WHEN table_name IN ('analytics_daily', 'analytics_daily_new') THEN 'Analytics table'
    WHEN table_name IN ('user_preferences', 'user_preferences_new') THEN 'User Preferences table'
    WHEN table_name IN ('chats', 'chats_new') THEN 'Chats table'
    WHEN table_name IN ('messages', 'messages_new') THEN 'Messages table'
    WHEN table_name IN ('notifications', 'notifications_new') THEN 'Notifications table'
    WHEN table_name IN ('account_permissions', 'account_permissions_new') THEN 'Account Permissions table'
    ELSE 'Other table'
  END as table_description,
  'EXISTS' as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'users_new',
    'events', 'events_new',
    'artists', 'artists_new',
    'venues', 'venues_new',
    'relationships', 'relationships_new',
    'reviews', 'reviews_new',
    'comments', 'comments_new',
    'engagements', 'engagements_new',
    'interactions', 'interactions_new',
    'analytics_daily', 'analytics_daily_new',
    'user_preferences', 'user_preferences_new',
    'chats', 'chats_new',
    'messages', 'messages_new',
    'notifications', 'notifications_new',
    'account_permissions', 'account_permissions_new'
  )
ORDER BY 
  CASE WHEN table_name LIKE '%_new' THEN 2 ELSE 1 END,
  table_name;

-- Get row counts for consolidated tables (prefer final names, fallback to _new)
DO $$
DECLARE
  v_table_name TEXT;
  v_row_count INTEGER;
  v_table_exists BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== ROW COUNT VERIFICATION ===';
  
  FOR v_table_name IN 
    SELECT unnest(ARRAY['users', 'events', 'artists', 'venues', 'relationships', 'reviews', 
                       'comments', 'engagements', 'interactions', 'analytics_daily', 
                       'user_preferences', 'chats', 'messages', 'notifications', 'account_permissions'])
  LOOP
    -- Check if final table exists
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = v_table_name
    ) INTO v_table_exists;
    
    IF v_table_exists THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', v_table_name) INTO v_row_count;
      RAISE NOTICE '%: % rows', v_table_name, v_row_count;
    ELSE
      -- Check if _new version exists
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = v_table_name || '_new'
      ) INTO v_table_exists;
      
      IF v_table_exists THEN
        EXECUTE format('SELECT COUNT(*) FROM public.%I', v_table_name || '_new') INTO v_row_count;
        RAISE NOTICE '% (still has _new suffix): % rows', v_table_name, v_row_count;
      ELSE
        RAISE WARNING '%: TABLE NOT FOUND', v_table_name;
      END IF;
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
END $$;

-- ============================================
-- 2. CHECK OLD TABLES STILL EXIST
-- ============================================

SELECT 
  'Old Table Check' as check_category,
  table_name,
  'Should be dropped after migration' as note,
  CASE 
    WHEN table_name IN ('users', 'events', 'artists', 'venues', 'relationships', 
                        'reviews', 'comments', 'engagements', 'interactions',
                        'analytics_daily', 'user_preferences') 
    THEN 'WARNING: This is a consolidated table name - check if this is an old table or consolidated table'
    ELSE 'Old table - should be dropped'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'profiles_old',
    'jambase_events', 'jambase_events_old',
    'artist_profile', 'venue_profile',
    'user_reviews', 'user_event_reviews',
    'event_comments', 'review_comments',
    'event_likes', 'review_likes', 'review_shares',
    'user_swipes', 'matches',
    'friends', 'friend_requests',
    'artist_follows', 'venue_follows',
    'user_jambase_events',
    'user_interactions',
    'analytics_user_daily', 'analytics_event_daily',
    'analytics_artist_daily', 'analytics_venue_daily', 'analytics_campaign_daily',
    'streaming_profiles', 'music_preference_signals',
    'user_recommendations_cache', 'user_streaming_stats_summary',
    'user_blocks', 'comment_likes'
  )
ORDER BY table_name;

-- ============================================
-- 3. DATA INTEGRITY CHECKS
-- ============================================

-- Check for orphaned foreign keys in relationships table
SELECT 
  'Data Integrity Check' as check_category,
  'Orphaned relationships (user)' as check_name,
  COUNT(*) as issue_count,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as status
FROM (
  SELECT r.user_id
  FROM relationships r
  LEFT JOIN users u ON u.user_id = r.user_id
  WHERE u.user_id IS NULL
  LIMIT 1
) orphaned_users
UNION ALL
SELECT 
  'Data Integrity Check' as check_category,
  'Orphaned relationships (related_entity: event)' as check_name,
  COUNT(*) as issue_count,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as status
FROM (
  SELECT r.related_entity_id
  FROM relationships r
  LEFT JOIN events e ON e.id = r.related_entity_id
  WHERE r.related_entity_type = 'event' AND e.id IS NULL
  LIMIT 1
) orphaned_events
UNION ALL
SELECT 
  'Data Integrity Check' as check_category,
  'Orphaned reviews (user)' as check_name,
  COUNT(*) as issue_count,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as status
FROM (
  SELECT r.user_id
  FROM reviews r
  LEFT JOIN users u ON u.user_id = r.user_id
  WHERE u.user_id IS NULL
  LIMIT 1
) orphaned_review_users
UNION ALL
SELECT 
  'Data Integrity Check' as check_category,
  'Orphaned reviews (entity: event)' as check_name,
  COUNT(*) as issue_count,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as status
FROM (
  SELECT r.entity_id
  FROM reviews r
  LEFT JOIN events e ON e.id = r.entity_id
  WHERE r.entity_type = 'event' AND e.id IS NULL
  LIMIT 1
) orphaned_review_events;

-- Check for NULL required fields in relationships
SELECT 
  'Data Integrity Check' as check_category,
  'Relationships with NULL related_entity_type' as check_name,
  COUNT(*) as issue_count,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as status
FROM relationships
WHERE related_entity_type IS NULL
UNION ALL
SELECT 
  'Data Integrity Check' as check_category,
  'Relationships with NULL relationship_type' as check_name,
  COUNT(*) as issue_count,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as status
FROM relationships
WHERE relationship_type IS NULL;

-- Check for NULL required fields in reviews
SELECT 
  'Data Integrity Check' as check_category,
  'Reviews with NULL entity_type' as check_name,
  COUNT(*) as issue_count,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as status
FROM reviews
WHERE entity_type IS NULL
UNION ALL
SELECT 
  'Data Integrity Check' as check_category,
  'Reviews with NULL entity_id' as check_name,
  COUNT(*) as issue_count,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as status
FROM reviews
WHERE entity_id IS NULL;

-- ============================================
-- 4. INDEX VERIFICATION
-- ============================================

SELECT 
  'Index Verification' as check_category,
  tablename as table_name,
  COUNT(*) as index_count,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'WARNING' END as status
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('users', 'events', 'artists', 'venues', 'relationships', 
                         'reviews', 'comments', 'engagements', 'interactions',
                         'analytics_daily', 'user_preferences', 'chats', 
                         'messages', 'notifications', 'account_permissions')
      OR table_name LIKE '%_new' AND table_name IN (
        'users_new', 'events_new', 'artists_new', 'venues_new', 
        'relationships_new', 'reviews_new', 'comments_new', 'engagements_new',
        'interactions_new', 'analytics_daily_new', 'user_preferences_new',
        'chats_new', 'messages_new', 'notifications_new', 'account_permissions_new'
      )
  )
GROUP BY tablename
ORDER BY tablename;

-- ============================================
-- 5. RLS POLICY VERIFICATION
-- ============================================

SELECT 
  'RLS Policy Verification' as check_category,
  tablename as table_name,
  COUNT(*) as policy_count,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'WARNING' END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('users', 'events', 'artists', 'venues', 'relationships', 
                         'reviews', 'comments', 'engagements', 'interactions',
                         'analytics_daily', 'user_preferences', 'chats', 
                         'messages', 'notifications', 'account_permissions')
      OR table_name LIKE '%_new' AND table_name IN (
        'users_new', 'events_new', 'artists_new', 'venues_new', 
        'relationships_new', 'reviews_new', 'comments_new', 'engagements_new',
        'interactions_new', 'analytics_daily_new', 'user_preferences_new',
        'chats_new', 'messages_new', 'notifications_new', 'account_permissions_new'
      )
  )
GROUP BY tablename
ORDER BY tablename;

-- ============================================
-- 6. FUNCTION/VIEW/TRIGGER VERIFICATION
-- ============================================

-- Check functions for old table references
SELECT 
  'Function Check' as check_category,
  routine_name as function_name,
  CASE 
    WHEN routine_definition LIKE '%jambase_events%' THEN 'FAIL: References jambase_events'
    WHEN routine_definition LIKE '%user_reviews%' THEN 'FAIL: References user_reviews'
    WHEN routine_definition LIKE '%profiles%' AND routine_definition NOT LIKE '%users%' THEN 'FAIL: References profiles'
    WHEN routine_definition LIKE '%user_jambase_events%' THEN 'FAIL: References user_jambase_events'
    WHEN routine_definition LIKE '%friends%' AND routine_definition NOT LIKE '%relationships%' THEN 'WARNING: May reference old friends table'
    ELSE 'PASS: No old table references'
  END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
  AND (
    routine_definition LIKE '%jambase_events%' OR
    routine_definition LIKE '%user_reviews%' OR
    (routine_definition LIKE '%profiles%' AND routine_definition NOT LIKE '%users%') OR
    routine_definition LIKE '%user_jambase_events%'
  )
LIMIT 10;

-- Check views for old table references
SELECT 
  'View Check' as check_category,
  table_name as view_name,
  CASE 
    WHEN view_definition LIKE '%jambase_events%' THEN 'FAIL: References jambase_events'
    WHEN view_definition LIKE '%user_reviews%' THEN 'FAIL: References user_reviews'
    WHEN view_definition LIKE '%profiles%' AND view_definition NOT LIKE '%users%' THEN 'FAIL: References profiles'
    WHEN view_definition LIKE '%user_jambase_events%' THEN 'FAIL: References user_jambase_events'
    ELSE 'PASS: No old table references'
  END as status
FROM information_schema.views
WHERE table_schema = 'public'
  AND (
    view_definition LIKE '%jambase_events%' OR
    view_definition LIKE '%user_reviews%' OR
    (view_definition LIKE '%profiles%' AND view_definition NOT LIKE '%users%') OR
    view_definition LIKE '%user_jambase_events%'
  )
LIMIT 10;

-- ============================================
-- 7. SUMMARY REPORT
-- ============================================

DO $$
DECLARE
  v_consolidated_count INTEGER;
  v_old_table_count INTEGER;
  v_tables_with_new_suffix INTEGER;
BEGIN
  -- Count consolidated tables (final names)
  SELECT COUNT(*) INTO v_consolidated_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('users', 'events', 'artists', 'venues', 'relationships', 
                       'reviews', 'comments', 'engagements', 'interactions',
                       'analytics_daily', 'user_preferences', 'chats', 
                       'messages', 'notifications', 'account_permissions');
  
  -- Count consolidated tables with _new suffix
  SELECT COUNT(*) INTO v_tables_with_new_suffix
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('users_new', 'events_new', 'artists_new', 'venues_new', 
                       'relationships_new', 'reviews_new', 'comments_new', 
                       'engagements_new', 'interactions_new', 'analytics_daily_new', 
                       'user_preferences_new', 'chats_new', 'messages_new', 
                       'notifications_new', 'account_permissions_new');
  
  -- Count old tables
  SELECT COUNT(*) INTO v_old_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('profiles', 'profiles_old', 'jambase_events', 'jambase_events_old',
                       'user_reviews', 'user_jambase_events', 'friends', 'friend_requests',
                       'artist_follows', 'venue_follows', 'user_interactions',
                       'event_comments', 'review_comments', 'event_likes', 'review_likes');
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'VERIFICATION SUMMARY';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Consolidated tables (final names): %', v_consolidated_count;
  RAISE NOTICE 'Consolidated tables (_new suffix): %', v_tables_with_new_suffix;
  RAISE NOTICE 'Old tables still present: %', v_old_table_count;
  RAISE NOTICE '';
  
  IF v_consolidated_count = 15 AND v_old_table_count = 0 THEN
    RAISE NOTICE '✅ STATUS: MIGRATION COMPLETE';
    RAISE NOTICE 'All consolidated tables exist with final names';
    RAISE NOTICE 'All old tables have been dropped';
  ELSIF v_consolidated_count < 15 AND v_tables_with_new_suffix > 0 THEN
    RAISE WARNING '⚠️  STATUS: MIGRATION IN PROGRESS';
    RAISE WARNING 'Tables still have _new suffix - run 11_rename_tables_final.sql';
  ELSIF v_old_table_count > 0 THEN
    RAISE WARNING '⚠️  STATUS: CLEANUP NEEDED';
    RAISE WARNING 'Old tables still exist - run 12_drop_old_tables.sql after verification';
  ELSE
    RAISE WARNING '❌ STATUS: UNKNOWN';
    RAISE WARNING 'Unexpected state - check table existence manually';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  IF v_tables_with_new_suffix > 0 THEN
    RAISE NOTICE '1. Run 11_rename_tables_final.sql to rename _new tables';
  END IF;
  IF v_old_table_count > 0 AND v_consolidated_count = 15 THEN
    RAISE NOTICE '2. Verify data integrity above';
    RAISE NOTICE '3. Run 12_drop_old_tables.sql to clean up old tables';
  ELSIF v_consolidated_count = 15 AND v_old_table_count = 0 THEN
    RAISE NOTICE '✅ Migration complete! Run end-to-end tests.';
  END IF;
  RAISE NOTICE '';
END $$;


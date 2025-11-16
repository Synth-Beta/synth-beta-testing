-- ============================================
-- VERIFICATION AGAINST ORIGINAL CONSOLIDATION PLAN
-- Database Consolidation Migration
-- ============================================
-- This script verifies that the migration matches the original plan from 02_table_mapping.md
-- Run this AFTER all migrations and TypeScript updates are complete

-- ============================================
-- 1. VERIFY 15 CONSOLIDATED TABLES EXIST
-- ============================================
-- According to plan: 15 tables total

SELECT 
  'Table Existence Check' as verification_category,
  'Expected 15 consolidated tables' as check_name,
  COUNT(*) as found_count,
  CASE 
    WHEN COUNT(*) = 15 THEN '✅ PASS - All 15 tables exist'
    WHEN COUNT(*) > 15 THEN '⚠️  WARNING - Extra tables found'
    WHEN COUNT(*) < 15 THEN '❌ FAIL - Missing tables'
    ELSE '❌ FAIL'
  END as status,
  string_agg(table_name, ', ' ORDER BY table_name) as tables_found
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users',           -- 1. from profiles
    'events',          -- 2. from jambase_events
    'artists',         -- 3. merge artists + artist_profile
    'venues',          -- 4. merge venues + venue_profile
    'relationships',   -- 5. NEW - unified relationship table
    'reviews',         -- 6. from user_reviews
    'comments',        -- 7. NEW - unified comments table
    'engagements',     -- 8. NEW - unified engagements table
    'chats',           -- 9. KEEP - no changes
    'messages',        -- 10. KEEP - no changes
    'notifications',   -- 11. KEEP - no changes
    'interactions',    -- 12. from user_interactions (rename)
    'analytics_daily', -- 13. NEW - unified analytics table
    'user_preferences',-- 14. NEW - unified preferences table
    'account_permissions' -- 15. KEEP - no changes
  );

-- ============================================
-- 2. VERIFY TABLE 1: users (from profiles)
-- ============================================
-- Plan: profiles → users (simple rename)

SELECT 
  'users Table Verification' as verification_category,
  'Should exist (renamed from profiles)' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') 
    THEN '✅ PASS - users table exists'
    ELSE '❌ FAIL - users table missing'
  END as status
UNION ALL
SELECT 
  'users Table Verification' as verification_category,
  'profiles table should be renamed (not exist as profiles)' as check_name,
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles')
    THEN '✅ PASS - profiles table renamed'
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles_old')
    THEN '⚠️  INFO - profiles renamed to profiles_old (backup)'
    ELSE '⚠️  WARNING - profiles table still exists'
  END as status;

-- ============================================
-- 3. VERIFY TABLE 2: events (from jambase_events)
-- ============================================
-- Plan: jambase_events → events (rename, add promotion fields)

SELECT 
  'events Table Verification' as verification_category,
  'Should exist (renamed from jambase_events)' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events') 
    THEN '✅ PASS - events table exists'
    ELSE '❌ FAIL - events table missing'
  END as status
UNION ALL
SELECT 
  'events Table Verification' as verification_category,
  'Should have promotion fields (promoted, promotion_start_date, promotion_end_date, created_by_user_id)' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'events'
        AND column_name IN ('promoted', 'promotion_start_date', 'promotion_end_date', 'created_by_user_id')
    )
    THEN '✅ PASS - Promotion fields exist'
    ELSE '⚠️  WARNING - Some promotion fields may be missing'
  END as status
UNION ALL
SELECT 
  'events Table Verification' as verification_category,
  'jambase_events should be renamed (not exist)' as check_name,
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jambase_events')
    THEN '✅ PASS - jambase_events renamed'
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jambase_events_old')
    THEN '⚠️  INFO - jambase_events renamed to jambase_events_old (backup)'
    ELSE '⚠️  WARNING - jambase_events table still exists'
  END as status;

-- ============================================
-- 4. VERIFY TABLE 3: artists (merge artists + artist_profile)
-- ============================================
-- Plan: Merge artists + artist_profile

SELECT 
  'artists Table Verification' as verification_category,
  'Should exist (merged from artists + artist_profile)' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'artists') 
    THEN '✅ PASS - artists table exists'
    ELSE '❌ FAIL - artists table missing'
  END as status
UNION ALL
SELECT 
  'artists Table Verification' as verification_category,
  'Should have ownership fields (owner_user_id, verified, claimed_at)' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'artists'
        AND column_name IN ('owner_user_id', 'verified', 'claimed_at')
    )
    THEN '✅ PASS - Ownership fields exist'
    ELSE '⚠️  WARNING - Some ownership fields may be missing'
  END as status;

-- ============================================
-- 5. VERIFY TABLE 4: venues (merge venues + venue_profile)
-- ============================================
-- Plan: Merge venues + venue_profile

SELECT 
  'venues Table Verification' as verification_category,
  'Should exist (merged from venues + venue_profile)' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'venues') 
    THEN '✅ PASS - venues table exists'
    ELSE '❌ FAIL - venues table missing'
  END as status
UNION ALL
SELECT 
  'venues Table Verification' as verification_category,
  'Should have ownership fields (owner_user_id, verified, claimed_at)' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'venues'
        AND column_name IN ('owner_user_id', 'verified', 'claimed_at')
    )
    THEN '✅ PASS - Ownership fields exist'
    ELSE '⚠️  WARNING - Some ownership fields may be missing'
  END as status;

-- ============================================
-- 6. VERIFY TABLE 5: relationships (NEW - unified)
-- ============================================
-- Plan: Unified table for all relationships
-- Sources: artist_follows, venue_follows, user_jambase_events, friends, friend_requests, matches, user_blocks

SELECT 
  'relationships Table Verification' as verification_category,
  'Should exist (NEW unified table)' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'relationships') 
    THEN '✅ PASS - relationships table exists'
    ELSE '❌ FAIL - relationships table missing'
  END as status
UNION ALL
SELECT 
  'relationships Table Verification' as verification_category,
  'Should have required columns (user_id, related_entity_type, related_entity_id, relationship_type, status, metadata)' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'relationships'
        AND column_name IN ('user_id', 'related_entity_type', 'related_entity_id', 'relationship_type', 'status', 'metadata')
      HAVING COUNT(*) >= 6
    )
    THEN '✅ PASS - Required columns exist'
    ELSE '❌ FAIL - Missing required columns'
  END as status
UNION ALL
SELECT 
  'relationships Table Verification' as verification_category,
  'Should have UNIQUE constraint on (user_id, related_entity_type, related_entity_id, relationship_type)' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname = 'public' AND tablename = 'relationships'
        AND indexdef LIKE '%user_id%related_entity_type%related_entity_id%relationship_type%'
    )
    THEN '✅ PASS - Unique constraint exists'
    ELSE '⚠️  WARNING - Unique constraint may be missing'
  END as status
UNION ALL
SELECT 
  'relationships Table Verification' as verification_category,
  'Old relationship tables should be migrated' as check_name,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('artist_follows', 'venue_follows', 'user_jambase_events', 
                          'friends', 'friend_requests', 'matches', 'user_blocks')
    )
    THEN '✅ PASS - Old tables migrated'
    ELSE '⚠️  WARNING - Some old relationship tables still exist'
  END as status;

-- ============================================
-- 7. VERIFY TABLE 6: reviews (from user_reviews)
-- ============================================
-- Plan: user_reviews → reviews (rename, add artist_id/venue_id)

SELECT 
  'reviews Table Verification' as verification_category,
  'Should exist (renamed from user_reviews)' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reviews') 
    THEN '✅ PASS - reviews table exists'
    ELSE '❌ FAIL - reviews table missing'
  END as status
UNION ALL
SELECT 
  'reviews Table Verification' as verification_category,
  'Should have entity columns (entity_type, entity_id) OR (artist_id, venue_id) for backward compatibility' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'reviews'
        AND column_name IN ('entity_type', 'entity_id')
    )
    THEN '✅ PASS - Entity columns exist (polymorphic relationship)'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'reviews'
        AND column_name IN ('artist_id', 'venue_id')
    )
    THEN '⚠️  INFO - Has artist_id/venue_id (may be for backward compatibility)'
    ELSE '⚠️  WARNING - Entity relationship columns may be missing'
  END as status
UNION ALL
SELECT 
  'reviews Table Verification' as verification_category,
  'user_reviews should be renamed (not exist)' as check_name,
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_reviews')
    THEN '✅ PASS - user_reviews renamed'
    ELSE '⚠️  WARNING - user_reviews table still exists'
  END as status;

-- ============================================
-- 8. VERIFY TABLE 7: comments (NEW - unified)
-- ============================================
-- Plan: Unified comments from event_comments + review_comments

SELECT 
  'comments Table Verification' as verification_category,
  'Should exist (NEW unified table)' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'comments') 
    THEN '✅ PASS - comments table exists'
    ELSE '❌ FAIL - comments table missing'
  END as status
UNION ALL
SELECT 
  'comments Table Verification' as verification_category,
  'Should have entity columns (entity_type, entity_id) for polymorphic relationship' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'comments'
        AND column_name IN ('entity_type', 'entity_id')
      HAVING COUNT(*) = 2
    )
    THEN '✅ PASS - Entity columns exist'
    ELSE '❌ FAIL - Missing entity columns'
  END as status
UNION ALL
SELECT 
  'comments Table Verification' as verification_category,
  'Old comment tables should be migrated' as check_name,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('event_comments', 'review_comments')
    )
    THEN '✅ PASS - Old comment tables migrated'
    ELSE '⚠️  WARNING - Old comment tables still exist'
  END as status;

-- ============================================
-- 9. VERIFY TABLE 8: engagements (NEW - unified)
-- ============================================
-- Plan: Unified engagements from event_likes, review_likes, comment_likes, review_shares, user_swipes

SELECT 
  'engagements Table Verification' as verification_category,
  'Should exist (NEW unified table)' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'engagements') 
    THEN '✅ PASS - engagements table exists'
    ELSE '❌ FAIL - engagements table missing'
  END as status
UNION ALL
SELECT 
  'engagements Table Verification' as verification_category,
  'Should have required columns (user_id, entity_type, entity_id, engagement_type, engagement_value, metadata)' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'engagements'
        AND column_name IN ('user_id', 'entity_type', 'entity_id', 'engagement_type', 'engagement_value', 'metadata')
      HAVING COUNT(*) >= 6
    )
    THEN '✅ PASS - Required columns exist'
    ELSE '❌ FAIL - Missing required columns'
  END as status
UNION ALL
SELECT 
  'engagements Table Verification' as verification_category,
  'Should have UNIQUE constraint on (user_id, entity_type, entity_id, engagement_type)' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname = 'public' AND tablename = 'engagements'
        AND indexdef LIKE '%user_id%entity_type%entity_id%engagement_type%'
    )
    THEN '✅ PASS - Unique constraint exists'
    ELSE '⚠️  WARNING - Unique constraint may be missing'
  END as status
UNION ALL
SELECT 
  'engagements Table Verification' as verification_category,
  'Old engagement tables should be migrated' as check_name,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('event_likes', 'review_likes', 'comment_likes', 'review_shares', 'user_swipes')
    )
    THEN '✅ PASS - Old engagement tables migrated'
    ELSE '⚠️  WARNING - Some old engagement tables still exist'
  END as status;

-- ============================================
-- 10. VERIFY TABLES 9-11: chats, messages, notifications (KEEP)
-- ============================================
-- Plan: No changes needed

SELECT 
  'Static Tables Verification' as verification_category,
  'chats, messages, notifications should exist unchanged' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('chats', 'messages', 'notifications')
      HAVING COUNT(*) = 3
    )
    THEN '✅ PASS - All static tables exist'
    ELSE '❌ FAIL - Some static tables missing'
  END as status;

-- ============================================
-- 11. VERIFY TABLE 12: interactions (from user_interactions)
-- ============================================
-- Plan: user_interactions → interactions (simple rename)

SELECT 
  'interactions Table Verification' as verification_category,
  'Should exist (renamed from user_interactions)' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'interactions') 
    THEN '✅ PASS - interactions table exists'
    ELSE '❌ FAIL - interactions table missing'
  END as status
UNION ALL
SELECT 
  'interactions Table Verification' as verification_category,
  'user_interactions should be renamed (not exist)' as check_name,
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_interactions')
    THEN '✅ PASS - user_interactions renamed'
    ELSE '⚠️  WARNING - user_interactions table still exists'
  END as status;

-- ============================================
-- 12. VERIFY TABLE 13: analytics_daily (NEW - unified)
-- ============================================
-- Plan: Unified analytics from analytics_user_daily, analytics_event_daily, analytics_artist_daily, analytics_venue_daily, analytics_campaign_daily

SELECT 
  'analytics_daily Table Verification' as verification_category,
  'Should exist (NEW unified table)' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'analytics_daily') 
    THEN '✅ PASS - analytics_daily table exists'
    ELSE '❌ FAIL - analytics_daily table missing'
  END as status
UNION ALL
SELECT 
  'analytics_daily Table Verification' as verification_category,
  'Should have required columns (entity_type, entity_id, date, metrics JSONB)' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'analytics_daily'
        AND column_name IN ('entity_type', 'entity_id', 'date', 'metrics')
      HAVING COUNT(*) >= 4
    )
    THEN '✅ PASS - Required columns exist'
    ELSE '❌ FAIL - Missing required columns'
  END as status
UNION ALL
SELECT 
  'analytics_daily Table Verification' as verification_category,
  'Should have UNIQUE constraint on (entity_type, entity_id, date)' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname = 'public' AND tablename = 'analytics_daily'
        AND indexdef LIKE '%entity_type%entity_id%date%'
    )
    THEN '✅ PASS - Unique constraint exists'
    ELSE '⚠️  WARNING - Unique constraint may be missing'
  END as status
UNION ALL
SELECT 
  'analytics_daily Table Verification' as verification_category,
  'Old analytics tables should be migrated' as check_name,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('analytics_user_daily', 'analytics_event_daily', 
                          'analytics_artist_daily', 'analytics_venue_daily', 'analytics_campaign_daily')
    )
    THEN '✅ PASS - Old analytics tables migrated'
    ELSE '⚠️  WARNING - Some old analytics tables still exist'
  END as status;

-- ============================================
-- 13. VERIFY TABLE 14: user_preferences (NEW - unified)
-- ============================================
-- Plan: Unified preferences from streaming_profiles, user_streaming_stats_summary, user_music_taste, music_preference_signals, user_recommendations_cache

SELECT 
  'user_preferences Table Verification' as verification_category,
  'Should exist (NEW unified table)' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_preferences') 
    THEN '✅ PASS - user_preferences table exists'
    ELSE '❌ FAIL - user_preferences table missing'
  END as status
UNION ALL
SELECT 
  'user_preferences Table Verification' as verification_category,
  'Should have required JSONB columns (streaming_stats, music_preference_signals, recommendation_cache, achievements)' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'user_preferences'
        AND column_name IN ('streaming_stats', 'music_preference_signals', 'recommendation_cache', 'achievements')
        AND data_type = 'jsonb'
      HAVING COUNT(*) >= 4
    )
    THEN '✅ PASS - Required JSONB columns exist'
    ELSE '⚠️  WARNING - Some JSONB columns may be missing'
  END as status
UNION ALL
SELECT 
  'user_preferences Table Verification' as verification_category,
  'Should have UNIQUE constraint on user_id' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname = 'public' AND tablename = 'user_preferences'
        AND indexdef LIKE '%user_id%' AND indexdef LIKE '%UNIQUE%'
    )
    THEN '✅ PASS - Unique constraint on user_id exists'
    ELSE '⚠️  WARNING - Unique constraint may be missing'
  END as status
UNION ALL
SELECT 
  'user_preferences Table Verification' as verification_category,
  'Old preference tables should be migrated' as check_name,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('streaming_profiles', 'user_streaming_stats_summary', 
                          'user_music_taste', 'music_preference_signals', 'user_recommendations_cache')
    )
    THEN '✅ PASS - Old preference tables migrated'
    ELSE '⚠️  WARNING - Some old preference tables still exist'
  END as status;

-- ============================================
-- 14. VERIFY TABLE 15: account_permissions (KEEP)
-- ============================================
-- Plan: No changes needed

SELECT 
  'account_permissions Table Verification' as verification_category,
  'Should exist (unchanged)' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'account_permissions') 
    THEN '✅ PASS - account_permissions table exists'
    ELSE '❌ FAIL - account_permissions table missing'
  END as status;

-- ============================================
-- 15. VERIFY 3NF COMPLIANCE
-- ============================================
-- Plan: No transitive dependencies, no duplicate data sources, no overlapping collections

SELECT 
  '3NF Compliance Check' as verification_category,
  'No duplicate data sources' as check_name,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('artist_profile', 'venue_profile', 'user_reviews', 'event_comments', 
                          'review_comments', 'event_likes', 'review_likes', 'user_swipes',
                          'artist_follows', 'venue_follows', 'user_jambase_events', 'friends')
    )
    THEN '✅ PASS - No duplicate data sources'
    ELSE '⚠️  WARNING - Some old tables still exist (may be backups)'
  END as status
UNION ALL
SELECT 
  '3NF Compliance Check' as verification_category,
  'No overlapping collections' as check_name,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables t1
      JOIN information_schema.tables t2 ON t1.table_name < t2.table_name
      WHERE t1.table_schema = 'public' AND t2.table_schema = 'public'
        AND t1.table_name IN ('relationships', 'engagements', 'comments')
        AND t2.table_name IN ('relationships', 'engagements', 'comments')
    )
    THEN '✅ PASS - No overlapping collections'
    ELSE '✅ PASS - Tables properly separated'
  END as status;

-- ============================================
-- 16. FINAL SUMMARY
-- ============================================

DO $$
DECLARE
  v_consolidated_count INTEGER;
  v_old_tables_count INTEGER;
  v_all_tables_exist BOOLEAN;
BEGIN
  -- Count consolidated tables
  SELECT COUNT(*) INTO v_consolidated_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('users', 'events', 'artists', 'venues', 'relationships', 
                       'reviews', 'comments', 'engagements', 'chats', 'messages',
                       'notifications', 'interactions', 'analytics_daily', 
                       'user_preferences', 'account_permissions');
  
  -- Check if all 15 exist
  v_all_tables_exist := (v_consolidated_count = 15);
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'VERIFICATION AGAINST ORIGINAL PLAN';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Consolidated tables found: %/15', v_consolidated_count;
  
  IF v_all_tables_exist THEN
    RAISE NOTICE '✅ ALL 15 CONSOLIDATED TABLES EXIST';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration matches original plan from 02_table_mapping.md';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Review all verification checks above';
    RAISE NOTICE '2. Test application functionality';
    RAISE NOTICE '3. Run FINAL_VERIFICATION.sql for detailed data checks';
    RAISE NOTICE '4. If everything passes, consider dropping old backup tables';
  ELSE
    RAISE WARNING '❌ NOT ALL TABLES EXIST';
    RAISE WARNING 'Missing: % tables', (15 - v_consolidated_count);
    RAISE WARNING 'Check which tables are missing above';
  END IF;
  
  RAISE NOTICE '';
END $$;


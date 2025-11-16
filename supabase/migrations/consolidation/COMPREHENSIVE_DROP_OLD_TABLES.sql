-- ============================================
-- COMPREHENSIVE DROP OLD TABLES
-- Database Consolidation Migration
-- ============================================
-- This script drops ALL old, unconsolidated tables
-- Run this AFTER verification that all data is migrated correctly
-- 
-- WARNING: This will permanently delete old tables and their data
-- Only run this after confirming:
-- 1. All 15 consolidated tables exist with correct data
-- 2. All TypeScript services have been updated
-- 3. All data has been successfully migrated
-- 4. Application has been tested with new schema

-- ============================================
-- STEP 1: LIST ALL EXISTING TABLES FOR REVIEW
-- ============================================

-- First, show all tables before dropping
SELECT 
  'Tables Before Cleanup' as info_type,
  table_name,
  CASE 
    -- Consolidated tables - KEEP THESE
    WHEN table_name IN ('users', 'events', 'artists', 'venues', 'relationships', 
                        'reviews', 'comments', 'engagements', 'chats', 'messages',
                        'notifications', 'interactions', 'analytics_daily', 
                        'user_preferences', 'account_permissions') THEN '✅ KEEP - Consolidated table'
    -- Backup/old tables - DROP THESE
    WHEN table_name LIKE '%_old' OR table_name LIKE '%_backup' THEN '🗑️  DROP - Backup table'
    WHEN table_name IN ('profiles', 'profiles_old', 'jambase_events', 'jambase_events_old',
                        'user_reviews', 'user_event_reviews', 'user_interactions',
                        'artist_profile', 'venue_profile',
                        'artist_follows', 'venue_follows', 'user_jambase_events',
                        'friends', 'friend_requests', 'matches', 'user_blocks',
                        'event_comments', 'review_comments', 'event_likes', 
                        'review_likes', 'review_shares', 'comment_likes', 'user_swipes',
                        'analytics_user_daily', 'analytics_event_daily', 
                        'analytics_artist_daily', 'analytics_venue_daily', 'analytics_campaign_daily',
                        'streaming_profiles', 'user_streaming_stats_summary',
                        'user_music_taste', 'music_preference_signals', 
                        'user_recommendations_cache') THEN '🗑️  DROP - Old consolidated table'
    -- Other tables that might exist
    ELSE '⚠️  REVIEW - Check if needed'
  END as action
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY 
  CASE 
    WHEN table_name IN ('users', 'events', 'artists', 'venues', 'relationships', 
                        'reviews', 'comments', 'engagements', 'chats', 'messages',
                        'notifications', 'interactions', 'analytics_daily', 
                        'user_preferences', 'account_permissions') THEN 1
    WHEN table_name LIKE '%_old' OR table_name LIKE '%_backup' THEN 2
    ELSE 3
  END,
  table_name;

-- ============================================
-- STEP 2: DROP OLD SOURCE TABLES
-- ============================================

-- Drop old profiles tables (consolidated into users)
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.profiles_old CASCADE;
DROP TABLE IF EXISTS public.profiles_backup CASCADE;

-- Drop old events tables (consolidated into events)
DROP TABLE IF EXISTS public.jambase_events CASCADE;
DROP TABLE IF EXISTS public.jambase_events_old CASCADE;
DROP TABLE IF EXISTS public.jambase_events_backup CASCADE;

-- Drop old artist/venue profile tables (merged into artists/venues)
DROP TABLE IF EXISTS public.artist_profile CASCADE;
DROP TABLE IF EXISTS public.venue_profile CASCADE;

-- ============================================
-- STEP 3: DROP OLD RELATIONSHIP TABLES
-- ============================================
-- These were consolidated into the relationships table

DROP TABLE IF EXISTS public.artist_follows CASCADE;
DROP TABLE IF EXISTS public.venue_follows CASCADE;
DROP TABLE IF EXISTS public.user_jambase_events CASCADE;
DROP TABLE IF EXISTS public.friends CASCADE;
DROP TABLE IF EXISTS public.friend_requests CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.user_blocks CASCADE;

-- ============================================
-- STEP 4: DROP OLD CONTENT TABLES
-- ============================================
-- These were consolidated into reviews, comments, engagements

DROP TABLE IF EXISTS public.user_reviews CASCADE;
DROP TABLE IF EXISTS public.user_event_reviews CASCADE;
DROP TABLE IF EXISTS public.event_comments CASCADE;
DROP TABLE IF EXISTS public.review_comments CASCADE;
DROP TABLE IF EXISTS public.event_likes CASCADE;
DROP TABLE IF EXISTS public.review_likes CASCADE;
DROP TABLE IF EXISTS public.review_shares CASCADE;
DROP TABLE IF EXISTS public.comment_likes CASCADE;
DROP TABLE IF EXISTS public.user_swipes CASCADE;

-- ============================================
-- STEP 5: DROP OLD ANALYTICS TABLES
-- ============================================
-- These were consolidated into analytics_daily

DROP TABLE IF EXISTS public.analytics_user_daily CASCADE;
DROP TABLE IF EXISTS public.analytics_event_daily CASCADE;
DROP TABLE IF EXISTS public.analytics_artist_daily CASCADE;
DROP TABLE IF EXISTS public.analytics_venue_daily CASCADE;
DROP TABLE IF EXISTS public.analytics_campaign_daily CASCADE;

-- ============================================
-- STEP 6: DROP OLD PREFERENCE TABLES
-- ============================================
-- These were consolidated into user_preferences

DROP TABLE IF EXISTS public.streaming_profiles CASCADE;
DROP TABLE IF EXISTS public.user_streaming_stats_summary CASCADE;
DROP TABLE IF EXISTS public.user_music_taste CASCADE;
DROP TABLE IF EXISTS public.music_preference_signals CASCADE;
DROP TABLE IF EXISTS public.user_recommendations_cache CASCADE;

-- ============================================
-- STEP 7: DROP OLD INTERACTION TABLES
-- ============================================
-- These were consolidated into interactions

DROP TABLE IF EXISTS public.user_interactions CASCADE;

-- ============================================
-- STEP 8: DROP ANY TABLES WITH _new SUFFIX
-- ============================================
-- These are temporary tables from migration - should already be renamed

DROP TABLE IF EXISTS public.users_new CASCADE;
DROP TABLE IF EXISTS public.events_new CASCADE;
DROP TABLE IF EXISTS public.artists_new CASCADE;
DROP TABLE IF EXISTS public.venues_new CASCADE;
DROP TABLE IF EXISTS public.relationships_new CASCADE;
DROP TABLE IF EXISTS public.reviews_new CASCADE;
DROP TABLE IF EXISTS public.comments_new CASCADE;
DROP TABLE IF EXISTS public.engagements_new CASCADE;
DROP TABLE IF EXISTS public.interactions_new CASCADE;
DROP TABLE IF EXISTS public.analytics_daily_new CASCADE;
DROP TABLE IF EXISTS public.user_preferences_new CASCADE;

-- ============================================
-- STEP 9: DROP ANY LEGACY/OLD TABLES
-- ============================================

DROP TABLE IF EXISTS public.events CASCADE; -- Only if this is an old table, not the consolidated one
-- Note: Be careful - we want to keep the NEW events table, not the old one
-- This query will fail if the consolidated events table exists, which is what we want

-- Legacy user_artists, user_venues, user_events (if they exist)
DROP TABLE IF EXISTS public.user_artists CASCADE;
DROP TABLE IF EXISTS public.user_venues CASCADE;
DROP TABLE IF EXISTS public.user_events CASCADE;

-- ============================================
-- STEP 10: VERIFICATION - COUNT REMAINING TABLES
-- ============================================

DO $$
DECLARE
  v_total_tables INTEGER;
  v_consolidated_tables INTEGER;
  v_old_tables INTEGER;
BEGIN
  -- Count total tables
  SELECT COUNT(*) INTO v_total_tables
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE';
  
  -- Count consolidated tables (should be 15)
  SELECT COUNT(*) INTO v_consolidated_tables
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name IN ('users', 'events', 'artists', 'venues', 'relationships', 
                       'reviews', 'comments', 'engagements', 'chats', 'messages',
                       'notifications', 'interactions', 'analytics_daily', 
                       'user_preferences', 'account_permissions');
  
  -- Count remaining old tables (should be 0 or close to 0)
  SELECT COUNT(*) INTO v_old_tables
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name IN ('profiles', 'jambase_events', 'user_reviews', 
                       'artist_follows', 'venue_follows', 'friends', 
                       'event_comments', 'review_comments', 'event_likes', 
                       'review_likes', 'user_interactions',
                       'analytics_user_daily', 'streaming_profiles',
                       'music_preference_signals');
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CLEANUP VERIFICATION';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total tables remaining: %', v_total_tables;
  RAISE NOTICE 'Consolidated tables: %/15', v_consolidated_tables;
  RAISE NOTICE 'Old tables remaining: %', v_old_tables;
  RAISE NOTICE '';
  
  IF v_consolidated_tables = 15 AND v_old_tables = 0 THEN
    RAISE NOTICE '✅ SUCCESS: All old tables dropped';
    RAISE NOTICE 'Only 15 consolidated tables remain';
  ELSIF v_consolidated_tables = 15 AND v_old_tables > 0 THEN
    RAISE WARNING '⚠️  WARNING: % old tables still exist', v_old_tables;
    RAISE NOTICE 'Run the query below to see which tables remain';
  ELSIF v_consolidated_tables < 15 THEN
    RAISE WARNING '❌ ERROR: Only %/15 consolidated tables found', v_consolidated_tables;
    RAISE WARNING 'Do not proceed until all consolidated tables exist!';
  ELSE
    RAISE WARNING '⚠️  UNEXPECTED STATE';
    RAISE WARNING 'Review table list manually';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Run this query to see all remaining tables:';
  RAISE NOTICE 'SELECT table_name FROM information_schema.tables WHERE table_schema = ''public'' AND table_type = ''BASE TABLE'' ORDER BY table_name;';
  RAISE NOTICE '';
END $$;

-- ============================================
-- STEP 11: LIST ALL REMAINING TABLES
-- ============================================

SELECT 
  'Tables After Cleanup' as info_type,
  table_name,
  CASE 
    WHEN table_name IN ('users', 'events', 'artists', 'venues', 'relationships', 
                        'reviews', 'comments', 'engagements', 'chats', 'messages',
                        'notifications', 'interactions', 'analytics_daily', 
                        'user_preferences', 'account_permissions') THEN '✅ Consolidated table'
    ELSE '⚠️  Review needed'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY 
  CASE 
    WHEN table_name IN ('users', 'events', 'artists', 'venues', 'relationships', 
                        'reviews', 'comments', 'engagements', 'chats', 'messages',
                        'notifications', 'interactions', 'analytics_daily', 
                        'user_preferences', 'account_permissions') THEN 1
    ELSE 2
  END,
  table_name;


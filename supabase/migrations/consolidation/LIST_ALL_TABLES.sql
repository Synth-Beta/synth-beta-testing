-- ============================================
-- LIST ALL TABLES
-- Database Consolidation Migration
-- ============================================
-- Run this first to see what tables currently exist
-- This will help identify which tables need to be dropped

SELECT 
  table_name,
  CASE 
    -- 15 Consolidated tables - KEEP THESE
    WHEN table_name IN ('users', 'events', 'artists', 'venues', 'relationships', 
                        'reviews', 'comments', 'engagements', 'chats', 'messages',
                        'notifications', 'interactions', 'analytics_daily', 
                        'user_preferences', 'account_permissions') THEN '✅ KEEP - Consolidated'
    -- Backup/old tables - DROP THESE
    WHEN table_name LIKE '%_old' OR table_name LIKE '%_backup' THEN '🗑️  DROP - Backup'
    WHEN table_name LIKE '%_new' THEN '🗑️  DROP - Migration temp table'
    -- Old source tables - DROP THESE
    WHEN table_name IN ('profiles', 'jambase_events', 'user_reviews', 'user_interactions',
                        'artist_profile', 'venue_profile',
                        'artist_follows', 'venue_follows', 'user_jambase_events',
                        'friends', 'friend_requests', 'matches', 'user_blocks',
                        'event_comments', 'review_comments', 'event_likes', 
                        'review_likes', 'review_shares', 'comment_likes', 'user_swipes',
                        'analytics_user_daily', 'analytics_event_daily', 
                        'analytics_artist_daily', 'analytics_venue_daily', 'analytics_campaign_daily',
                        'streaming_profiles', 'user_streaming_stats_summary',
                        'user_music_taste', 'music_preference_signals', 
                        'user_recommendations_cache') THEN '🗑️  DROP - Old consolidated'
    -- Other tables - REVIEW
    ELSE '⚠️  REVIEW'
  END as action,
  CASE 
    WHEN table_name IN ('users', 'events', 'artists', 'venues', 'relationships', 
                        'reviews', 'comments', 'engagements', 'chats', 'messages',
                        'notifications', 'interactions', 'analytics_daily', 
                        'user_preferences', 'account_permissions') THEN 1
    WHEN table_name LIKE '%_old' OR table_name LIKE '%_backup' OR table_name LIKE '%_new' THEN 2
    WHEN table_name IN ('profiles', 'jambase_events', 'user_reviews', 'user_interactions') THEN 3
    ELSE 4
  END as sort_order
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY sort_order, table_name;

-- Count summary
SELECT 
  'Summary' as info_type,
  COUNT(*) FILTER (WHERE table_name IN ('users', 'events', 'artists', 'venues', 'relationships', 
                                        'reviews', 'comments', 'engagements', 'chats', 'messages',
                                        'notifications', 'interactions', 'analytics_daily', 
                                        'user_preferences', 'account_permissions')) as consolidated_tables,
  COUNT(*) FILTER (WHERE table_name LIKE '%_old' OR table_name LIKE '%_backup' OR table_name LIKE '%_new') as backup_temp_tables,
  COUNT(*) FILTER (WHERE table_name IN ('profiles', 'jambase_events', 'user_reviews', 'user_interactions',
                                        'artist_profile', 'venue_profile', 'artist_follows', 'venue_follows',
                                        'user_jambase_events', 'friends', 'friend_requests', 'matches', 
                                        'user_blocks', 'event_comments', 'review_comments', 'event_likes', 
                                        'review_likes', 'review_shares', 'comment_likes', 'user_swipes',
                                        'analytics_user_daily', 'analytics_event_daily', 
                                        'analytics_artist_daily', 'analytics_venue_daily', 'analytics_campaign_daily',
                                        'streaming_profiles', 'user_streaming_stats_summary',
                                        'user_music_taste', 'music_preference_signals', 
                                        'user_recommendations_cache')) as old_source_tables,
  COUNT(*) as total_tables
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';


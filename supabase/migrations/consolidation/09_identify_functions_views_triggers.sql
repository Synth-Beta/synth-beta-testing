-- ============================================
-- DATABASE CONSOLIDATION: PHASE 4 - IDENTIFY FUNCTIONS, VIEWS, TRIGGERS
-- ============================================
-- This script identifies all functions, views, and triggers that reference old table names
-- Run this AFTER Phase 3 (data migration) is complete
-- Use this output to create update scripts for Phase 4

-- ============================================
-- 4.1 IDENTIFY FUNCTIONS REFERENCING OLD TABLES
-- ============================================

-- Find all functions that reference old table names
SELECT 
  'FUNCTION' as object_type,
  p.proname as object_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition,
  string_agg(DISTINCT old_table, ', ') as referenced_old_tables
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
CROSS JOIN LATERAL (
  SELECT 
    CASE 
      WHEN pg_get_functiondef(p.oid) LIKE '%profiles%' THEN 'profiles'
      WHEN pg_get_functiondef(p.oid) LIKE '%jambase_events%' THEN 'jambase_events'
      WHEN pg_get_functiondef(p.oid) LIKE '%artist_profile%' THEN 'artist_profile'
      WHEN pg_get_functiondef(p.oid) LIKE '%venue_profile%' THEN 'venue_profile'
      WHEN pg_get_functiondef(p.oid) LIKE '%artist_follows%' THEN 'artist_follows'
      WHEN pg_get_functiondef(p.oid) LIKE '%venue_follows%' THEN 'venue_follows'
      WHEN pg_get_functiondef(p.oid) LIKE '%user_jambase_events%' THEN 'user_jambase_events'
      WHEN pg_get_functiondef(p.oid) LIKE '%friends%' AND pg_get_functiondef(p.oid) NOT LIKE '%friend_requests%' THEN 'friends'
      WHEN pg_get_functiondef(p.oid) LIKE '%friend_requests%' THEN 'friend_requests'
      WHEN pg_get_functiondef(p.oid) LIKE '%matches%' THEN 'matches'
      WHEN pg_get_functiondef(p.oid) LIKE '%user_blocks%' THEN 'user_blocks'
      WHEN pg_get_functiondef(p.oid) LIKE '%user_reviews%' THEN 'user_reviews'
      WHEN pg_get_functiondef(p.oid) LIKE '%event_comments%' THEN 'event_comments'
      WHEN pg_get_functiondef(p.oid) LIKE '%review_comments%' THEN 'review_comments'
      WHEN pg_get_functiondef(p.oid) LIKE '%event_likes%' THEN 'event_likes'
      WHEN pg_get_functiondef(p.oid) LIKE '%review_likes%' THEN 'review_likes'
      WHEN pg_get_functiondef(p.oid) LIKE '%comment_likes%' THEN 'comment_likes'
      WHEN pg_get_functiondef(p.oid) LIKE '%review_shares%' THEN 'review_shares'
      WHEN pg_get_functiondef(p.oid) LIKE '%user_swipes%' THEN 'user_swipes'
      WHEN pg_get_functiondef(p.oid) LIKE '%user_interactions%' THEN 'user_interactions'
      WHEN pg_get_functiondef(p.oid) LIKE '%analytics_user_daily%' THEN 'analytics_user_daily'
      WHEN pg_get_functiondef(p.oid) LIKE '%analytics_event_daily%' THEN 'analytics_event_daily'
      WHEN pg_get_functiondef(p.oid) LIKE '%analytics_artist_daily%' THEN 'analytics_artist_daily'
      WHEN pg_get_functiondef(p.oid) LIKE '%analytics_venue_daily%' THEN 'analytics_venue_daily'
      WHEN pg_get_functiondef(p.oid) LIKE '%analytics_campaign_daily%' THEN 'analytics_campaign_daily'
      WHEN pg_get_functiondef(p.oid) LIKE '%streaming_profiles%' THEN 'streaming_profiles'
      WHEN pg_get_functiondef(p.oid) LIKE '%user_streaming_stats_summary%' THEN 'user_streaming_stats_summary'
      WHEN pg_get_functiondef(p.oid) LIKE '%music_preference_signals%' THEN 'music_preference_signals'
      WHEN pg_get_functiondef(p.oid) LIKE '%user_recommendations_cache%' THEN 'user_recommendations_cache'
    END as old_table
  WHERE pg_get_functiondef(p.oid) LIKE '%' || CASE 
    WHEN pg_get_functiondef(p.oid) LIKE '%profiles%' THEN 'profiles'
    WHEN pg_get_functiondef(p.oid) LIKE '%jambase_events%' THEN 'jambase_events'
    WHEN pg_get_functiondef(p.oid) LIKE '%artist_profile%' THEN 'artist_profile'
    WHEN pg_get_functiondef(p.oid) LIKE '%venue_profile%' THEN 'venue_profile'
    WHEN pg_get_functiondef(p.oid) LIKE '%artist_follows%' THEN 'artist_follows'
    WHEN pg_get_functiondef(p.oid) LIKE '%venue_follows%' THEN 'venue_follows'
    WHEN pg_get_functiondef(p.oid) LIKE '%user_jambase_events%' THEN 'user_jambase_events'
    WHEN pg_get_functiondef(p.oid) LIKE '%friends%' AND pg_get_functiondef(p.oid) NOT LIKE '%friend_requests%' THEN 'friends'
    WHEN pg_get_functiondef(p.oid) LIKE '%friend_requests%' THEN 'friend_requests'
    WHEN pg_get_functiondef(p.oid) LIKE '%matches%' THEN 'matches'
    WHEN pg_get_functiondef(p.oid) LIKE '%user_blocks%' THEN 'user_blocks'
    WHEN pg_get_functiondef(p.oid) LIKE '%user_reviews%' THEN 'user_reviews'
    WHEN pg_get_functiondef(p.oid) LIKE '%event_comments%' THEN 'event_comments'
    WHEN pg_get_functiondef(p.oid) LIKE '%review_comments%' THEN 'review_comments'
    WHEN pg_get_functiondef(p.oid) LIKE '%event_likes%' THEN 'event_likes'
    WHEN pg_get_functiondef(p.oid) LIKE '%review_likes%' THEN 'review_likes'
    WHEN pg_get_functiondef(p.oid) LIKE '%comment_likes%' THEN 'comment_likes'
    WHEN pg_get_functiondef(p.oid) LIKE '%review_shares%' THEN 'review_shares'
    WHEN pg_get_functiondef(p.oid) LIKE '%user_swipes%' THEN 'user_swipes'
    WHEN pg_get_functiondef(p.oid) LIKE '%user_interactions%' THEN 'user_interactions'
    WHEN pg_get_functiondef(p.oid) LIKE '%analytics_user_daily%' THEN 'analytics_user_daily'
    WHEN pg_get_functiondef(p.oid) LIKE '%analytics_event_daily%' THEN 'analytics_event_daily'
    WHEN pg_get_functiondef(p.oid) LIKE '%analytics_artist_daily%' THEN 'analytics_artist_daily'
    WHEN pg_get_functiondef(p.oid) LIKE '%analytics_venue_daily%' THEN 'analytics_venue_daily'
    WHEN pg_get_functiondef(p.oid) LIKE '%analytics_campaign_daily%' THEN 'analytics_campaign_daily'
    WHEN pg_get_functiondef(p.oid) LIKE '%streaming_profiles%' THEN 'streaming_profiles'
    WHEN pg_get_functiondef(p.oid) LIKE '%user_streaming_stats_summary%' THEN 'user_streaming_stats_summary'
    WHEN pg_get_functiondef(p.oid) LIKE '%music_preference_signals%' THEN 'music_preference_signals'
    WHEN pg_get_functiondef(p.oid) LIKE '%user_recommendations_cache%' THEN 'user_recommendations_cache'
  END || '%'
) old_tables
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND (
    pg_get_functiondef(p.oid) LIKE '%profiles%'
    OR pg_get_functiondef(p.oid) LIKE '%jambase_events%'
    OR pg_get_functiondef(p.oid) LIKE '%artist_profile%'
    OR pg_get_functiondef(p.oid) LIKE '%venue_profile%'
    OR pg_get_functiondef(p.oid) LIKE '%artist_follows%'
    OR pg_get_functiondef(p.oid) LIKE '%venue_follows%'
    OR pg_get_functiondef(p.oid) LIKE '%user_jambase_events%'
    OR pg_get_functiondef(p.oid) LIKE '%friends%'
    OR pg_get_functiondef(p.oid) LIKE '%friend_requests%'
    OR pg_get_functiondef(p.oid) LIKE '%matches%'
    OR pg_get_functiondef(p.oid) LIKE '%user_blocks%'
    OR pg_get_functiondef(p.oid) LIKE '%user_reviews%'
    OR pg_get_functiondef(p.oid) LIKE '%event_comments%'
    OR pg_get_functiondef(p.oid) LIKE '%review_comments%'
    OR pg_get_functiondef(p.oid) LIKE '%event_likes%'
    OR pg_get_functiondef(p.oid) LIKE '%review_likes%'
    OR pg_get_functiondef(p.oid) LIKE '%comment_likes%'
    OR pg_get_functiondef(p.oid) LIKE '%review_shares%'
    OR pg_get_functiondef(p.oid) LIKE '%user_swipes%'
    OR pg_get_functiondef(p.oid) LIKE '%user_interactions%'
    OR pg_get_functiondef(p.oid) LIKE '%analytics_user_daily%'
    OR pg_get_functiondef(p.oid) LIKE '%analytics_event_daily%'
    OR pg_get_functiondef(p.oid) LIKE '%analytics_artist_daily%'
    OR pg_get_functiondef(p.oid) LIKE '%analytics_venue_daily%'
    OR pg_get_functiondef(p.oid) LIKE '%analytics_campaign_daily%'
    OR pg_get_functiondef(p.oid) LIKE '%streaming_profiles%'
    OR pg_get_functiondef(p.oid) LIKE '%user_streaming_stats_summary%'
    OR pg_get_functiondef(p.oid) LIKE '%music_preference_signals%'
    OR pg_get_functiondef(p.oid) LIKE '%user_recommendations_cache%'
  )
GROUP BY p.proname, pg_get_function_arguments(p.oid), pg_get_functiondef(p.oid)
ORDER BY p.proname;

-- ============================================
-- 4.2 IDENTIFY VIEWS REFERENCING OLD TABLES
-- ============================================

-- Find all views that reference old table names
SELECT 
  'VIEW' as object_type,
  table_name as object_name,
  view_definition as definition,
  string_agg(DISTINCT old_table, ', ') as referenced_old_tables
FROM information_schema.views
CROSS JOIN LATERAL (
  SELECT 
    CASE 
      WHEN view_definition LIKE '%profiles%' THEN 'profiles'
      WHEN view_definition LIKE '%jambase_events%' THEN 'jambase_events'
      WHEN view_definition LIKE '%artist_profile%' THEN 'artist_profile'
      WHEN view_definition LIKE '%venue_profile%' THEN 'venue_profile'
      WHEN view_definition LIKE '%artist_follows%' THEN 'artist_follows'
      WHEN view_definition LIKE '%venue_follows%' THEN 'venue_follows'
      WHEN view_definition LIKE '%user_jambase_events%' THEN 'user_jambase_events'
      WHEN view_definition LIKE '%friends%' AND view_definition NOT LIKE '%friend_requests%' THEN 'friends'
      WHEN view_definition LIKE '%friend_requests%' THEN 'friend_requests'
      WHEN view_definition LIKE '%matches%' THEN 'matches'
      WHEN view_definition LIKE '%user_blocks%' THEN 'user_blocks'
      WHEN view_definition LIKE '%user_reviews%' THEN 'user_reviews'
      WHEN view_definition LIKE '%event_comments%' THEN 'event_comments'
      WHEN view_definition LIKE '%review_comments%' THEN 'review_comments'
      WHEN view_definition LIKE '%event_likes%' THEN 'event_likes'
      WHEN view_definition LIKE '%review_likes%' THEN 'review_likes'
      WHEN view_definition LIKE '%comment_likes%' THEN 'comment_likes'
      WHEN view_definition LIKE '%review_shares%' THEN 'review_shares'
      WHEN view_definition LIKE '%user_swipes%' THEN 'user_swipes'
      WHEN view_definition LIKE '%user_interactions%' THEN 'user_interactions'
      WHEN view_definition LIKE '%analytics_user_daily%' THEN 'analytics_user_daily'
      WHEN view_definition LIKE '%analytics_event_daily%' THEN 'analytics_event_daily'
      WHEN view_definition LIKE '%analytics_artist_daily%' THEN 'analytics_artist_daily'
      WHEN view_definition LIKE '%analytics_venue_daily%' THEN 'analytics_venue_daily'
      WHEN view_definition LIKE '%analytics_campaign_daily%' THEN 'analytics_campaign_daily'
      WHEN view_definition LIKE '%streaming_profiles%' THEN 'streaming_profiles'
      WHEN view_definition LIKE '%user_streaming_stats_summary%' THEN 'user_streaming_stats_summary'
      WHEN view_definition LIKE '%music_preference_signals%' THEN 'music_preference_signals'
      WHEN view_definition LIKE '%user_recommendations_cache%' THEN 'user_recommendations_cache'
    END as old_table
  WHERE view_definition LIKE '%' || CASE 
    WHEN view_definition LIKE '%profiles%' THEN 'profiles'
    WHEN view_definition LIKE '%jambase_events%' THEN 'jambase_events'
    WHEN view_definition LIKE '%artist_profile%' THEN 'artist_profile'
    WHEN view_definition LIKE '%venue_profile%' THEN 'venue_profile'
    WHEN view_definition LIKE '%artist_follows%' THEN 'artist_follows'
    WHEN view_definition LIKE '%venue_follows%' THEN 'venue_follows'
    WHEN view_definition LIKE '%user_jambase_events%' THEN 'user_jambase_events'
    WHEN view_definition LIKE '%friends%' AND view_definition NOT LIKE '%friend_requests%' THEN 'friends'
    WHEN view_definition LIKE '%friend_requests%' THEN 'friend_requests'
    WHEN view_definition LIKE '%matches%' THEN 'matches'
    WHEN view_definition LIKE '%user_blocks%' THEN 'user_blocks'
    WHEN view_definition LIKE '%user_reviews%' THEN 'user_reviews'
    WHEN view_definition LIKE '%event_comments%' THEN 'event_comments'
    WHEN view_definition LIKE '%review_comments%' THEN 'review_comments'
    WHEN view_definition LIKE '%event_likes%' THEN 'event_likes'
    WHEN view_definition LIKE '%review_likes%' THEN 'review_likes'
    WHEN view_definition LIKE '%comment_likes%' THEN 'comment_likes'
    WHEN view_definition LIKE '%review_shares%' THEN 'review_shares'
    WHEN view_definition LIKE '%user_swipes%' THEN 'user_swipes'
    WHEN view_definition LIKE '%user_interactions%' THEN 'user_interactions'
    WHEN view_definition LIKE '%analytics_user_daily%' THEN 'analytics_user_daily'
    WHEN view_definition LIKE '%analytics_event_daily%' THEN 'analytics_event_daily'
    WHEN view_definition LIKE '%analytics_artist_daily%' THEN 'analytics_artist_daily'
    WHEN view_definition LIKE '%analytics_venue_daily%' THEN 'analytics_venue_daily'
    WHEN view_definition LIKE '%analytics_campaign_daily%' THEN 'analytics_campaign_daily'
    WHEN view_definition LIKE '%streaming_profiles%' THEN 'streaming_profiles'
    WHEN view_definition LIKE '%user_streaming_stats_summary%' THEN 'user_streaming_stats_summary'
    WHEN view_definition LIKE '%music_preference_signals%' THEN 'music_preference_signals'
    WHEN view_definition LIKE '%user_recommendations_cache%' THEN 'user_recommendations_cache'
  END || '%'
) old_tables
WHERE table_schema = 'public'
  AND (
    view_definition LIKE '%profiles%'
    OR view_definition LIKE '%jambase_events%'
    OR view_definition LIKE '%artist_profile%'
    OR view_definition LIKE '%venue_profile%'
    OR view_definition LIKE '%artist_follows%'
    OR view_definition LIKE '%venue_follows%'
    OR view_definition LIKE '%user_jambase_events%'
    OR view_definition LIKE '%friends%'
    OR view_definition LIKE '%friend_requests%'
    OR view_definition LIKE '%matches%'
    OR view_definition LIKE '%user_blocks%'
    OR view_definition LIKE '%user_reviews%'
    OR view_definition LIKE '%event_comments%'
    OR view_definition LIKE '%review_comments%'
    OR view_definition LIKE '%event_likes%'
    OR view_definition LIKE '%review_likes%'
    OR view_definition LIKE '%comment_likes%'
    OR view_definition LIKE '%review_shares%'
    OR view_definition LIKE '%user_swipes%'
    OR view_definition LIKE '%user_interactions%'
    OR view_definition LIKE '%analytics_user_daily%'
    OR view_definition LIKE '%analytics_event_daily%'
    OR view_definition LIKE '%analytics_artist_daily%'
    OR view_definition LIKE '%analytics_venue_daily%'
    OR view_definition LIKE '%analytics_campaign_daily%'
    OR view_definition LIKE '%streaming_profiles%'
    OR view_definition LIKE '%user_streaming_stats_summary%'
    OR view_definition LIKE '%music_preference_signals%'
    OR view_definition LIKE '%user_recommendations_cache%'
  )
GROUP BY table_name, view_definition
ORDER BY table_name;

-- ============================================
-- 4.3 IDENTIFY TRIGGERS REFERENCING OLD TABLES
-- ============================================

-- Find all triggers that reference old table names
SELECT 
  'TRIGGER' as object_type,
  t.tgname as object_name,
  c.relname as table_name,
  p.proname as function_name,
  pg_get_triggerdef(t.oid) as definition,
  string_agg(DISTINCT old_table, ', ') as referenced_old_tables
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
CROSS JOIN LATERAL (
  SELECT 
    CASE 
      WHEN pg_get_triggerdef(t.oid) LIKE '%profiles%' THEN 'profiles'
      WHEN pg_get_triggerdef(t.oid) LIKE '%jambase_events%' THEN 'jambase_events'
      WHEN pg_get_triggerdef(t.oid) LIKE '%artist_profile%' THEN 'artist_profile'
      WHEN pg_get_triggerdef(t.oid) LIKE '%venue_profile%' THEN 'venue_profile'
      WHEN pg_get_triggerdef(t.oid) LIKE '%artist_follows%' THEN 'artist_follows'
      WHEN pg_get_triggerdef(t.oid) LIKE '%venue_follows%' THEN 'venue_follows'
      WHEN pg_get_triggerdef(t.oid) LIKE '%user_jambase_events%' THEN 'user_jambase_events'
      WHEN pg_get_triggerdef(t.oid) LIKE '%friends%' AND pg_get_triggerdef(t.oid) NOT LIKE '%friend_requests%' THEN 'friends'
      WHEN pg_get_triggerdef(t.oid) LIKE '%friend_requests%' THEN 'friend_requests'
      WHEN pg_get_triggerdef(t.oid) LIKE '%matches%' THEN 'matches'
      WHEN pg_get_triggerdef(t.oid) LIKE '%user_blocks%' THEN 'user_blocks'
      WHEN pg_get_triggerdef(t.oid) LIKE '%user_reviews%' THEN 'user_reviews'
      WHEN pg_get_triggerdef(t.oid) LIKE '%event_comments%' THEN 'event_comments'
      WHEN pg_get_triggerdef(t.oid) LIKE '%review_comments%' THEN 'review_comments'
      WHEN pg_get_triggerdef(t.oid) LIKE '%event_likes%' THEN 'event_likes'
      WHEN pg_get_triggerdef(t.oid) LIKE '%review_likes%' THEN 'review_likes'
      WHEN pg_get_triggerdef(t.oid) LIKE '%comment_likes%' THEN 'comment_likes'
      WHEN pg_get_triggerdef(t.oid) LIKE '%review_shares%' THEN 'review_shares'
      WHEN pg_get_triggerdef(t.oid) LIKE '%user_swipes%' THEN 'user_swipes'
      WHEN pg_get_triggerdef(t.oid) LIKE '%user_interactions%' THEN 'user_interactions'
      WHEN pg_get_triggerdef(t.oid) LIKE '%analytics_user_daily%' THEN 'analytics_user_daily'
      WHEN pg_get_triggerdef(t.oid) LIKE '%analytics_event_daily%' THEN 'analytics_event_daily'
      WHEN pg_get_triggerdef(t.oid) LIKE '%analytics_artist_daily%' THEN 'analytics_artist_daily'
      WHEN pg_get_triggerdef(t.oid) LIKE '%analytics_venue_daily%' THEN 'analytics_venue_daily'
      WHEN pg_get_triggerdef(t.oid) LIKE '%analytics_campaign_daily%' THEN 'analytics_campaign_daily'
      WHEN pg_get_triggerdef(t.oid) LIKE '%streaming_profiles%' THEN 'streaming_profiles'
      WHEN pg_get_triggerdef(t.oid) LIKE '%user_streaming_stats_summary%' THEN 'user_streaming_stats_summary'
      WHEN pg_get_triggerdef(t.oid) LIKE '%music_preference_signals%' THEN 'music_preference_signals'
      WHEN pg_get_triggerdef(t.oid) LIKE '%user_recommendations_cache%' THEN 'user_recommendations_cache'
    END as old_table
  WHERE pg_get_triggerdef(t.oid) LIKE '%' || CASE 
    WHEN pg_get_triggerdef(t.oid) LIKE '%profiles%' THEN 'profiles'
    WHEN pg_get_triggerdef(t.oid) LIKE '%jambase_events%' THEN 'jambase_events'
    WHEN pg_get_triggerdef(t.oid) LIKE '%artist_profile%' THEN 'artist_profile'
    WHEN pg_get_triggerdef(t.oid) LIKE '%venue_profile%' THEN 'venue_profile'
    WHEN pg_get_triggerdef(t.oid) LIKE '%artist_follows%' THEN 'artist_follows'
    WHEN pg_get_triggerdef(t.oid) LIKE '%venue_follows%' THEN 'venue_follows'
    WHEN pg_get_triggerdef(t.oid) LIKE '%user_jambase_events%' THEN 'user_jambase_events'
    WHEN pg_get_triggerdef(t.oid) LIKE '%friends%' AND pg_get_triggerdef(t.oid) NOT LIKE '%friend_requests%' THEN 'friends'
    WHEN pg_get_triggerdef(t.oid) LIKE '%friend_requests%' THEN 'friend_requests'
    WHEN pg_get_triggerdef(t.oid) LIKE '%matches%' THEN 'matches'
    WHEN pg_get_triggerdef(t.oid) LIKE '%user_blocks%' THEN 'user_blocks'
    WHEN pg_get_triggerdef(t.oid) LIKE '%user_reviews%' THEN 'user_reviews'
    WHEN pg_get_triggerdef(t.oid) LIKE '%event_comments%' THEN 'event_comments'
    WHEN pg_get_triggerdef(t.oid) LIKE '%review_comments%' THEN 'review_comments'
    WHEN pg_get_triggerdef(t.oid) LIKE '%event_likes%' THEN 'event_likes'
    WHEN pg_get_triggerdef(t.oid) LIKE '%review_likes%' THEN 'review_likes'
    WHEN pg_get_triggerdef(t.oid) LIKE '%comment_likes%' THEN 'comment_likes'
    WHEN pg_get_triggerdef(t.oid) LIKE '%review_shares%' THEN 'review_shares'
    WHEN pg_get_triggerdef(t.oid) LIKE '%user_swipes%' THEN 'user_swipes'
    WHEN pg_get_triggerdef(t.oid) LIKE '%user_interactions%' THEN 'user_interactions'
    WHEN pg_get_triggerdef(t.oid) LIKE '%analytics_user_daily%' THEN 'analytics_user_daily'
    WHEN pg_get_triggerdef(t.oid) LIKE '%analytics_event_daily%' THEN 'analytics_event_daily'
    WHEN pg_get_triggerdef(t.oid) LIKE '%analytics_artist_daily%' THEN 'analytics_artist_daily'
    WHEN pg_get_triggerdef(t.oid) LIKE '%analytics_venue_daily%' THEN 'analytics_venue_daily'
    WHEN pg_get_triggerdef(t.oid) LIKE '%analytics_campaign_daily%' THEN 'analytics_campaign_daily'
    WHEN pg_get_triggerdef(t.oid) LIKE '%streaming_profiles%' THEN 'streaming_profiles'
    WHEN pg_get_triggerdef(t.oid) LIKE '%user_streaming_stats_summary%' THEN 'user_streaming_stats_summary'
    WHEN pg_get_triggerdef(t.oid) LIKE '%music_preference_signals%' THEN 'music_preference_signals'
    WHEN pg_get_triggerdef(t.oid) LIKE '%user_recommendations_cache%' THEN 'user_recommendations_cache'
  END || '%'
) old_tables
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND (
    pg_get_triggerdef(t.oid) LIKE '%profiles%'
    OR pg_get_triggerdef(t.oid) LIKE '%jambase_events%'
    OR pg_get_triggerdef(t.oid) LIKE '%artist_profile%'
    OR pg_get_triggerdef(t.oid) LIKE '%venue_profile%'
    OR pg_get_triggerdef(t.oid) LIKE '%artist_follows%'
    OR pg_get_triggerdef(t.oid) LIKE '%venue_follows%'
    OR pg_get_triggerdef(t.oid) LIKE '%user_jambase_events%'
    OR pg_get_triggerdef(t.oid) LIKE '%friends%'
    OR pg_get_triggerdef(t.oid) LIKE '%friend_requests%'
    OR pg_get_triggerdef(t.oid) LIKE '%matches%'
    OR pg_get_triggerdef(t.oid) LIKE '%user_blocks%'
    OR pg_get_triggerdef(t.oid) LIKE '%user_reviews%'
    OR pg_get_triggerdef(t.oid) LIKE '%event_comments%'
    OR pg_get_triggerdef(t.oid) LIKE '%review_comments%'
    OR pg_get_triggerdef(t.oid) LIKE '%event_likes%'
    OR pg_get_triggerdef(t.oid) LIKE '%review_likes%'
    OR pg_get_triggerdef(t.oid) LIKE '%comment_likes%'
    OR pg_get_triggerdef(t.oid) LIKE '%review_shares%'
    OR pg_get_triggerdef(t.oid) LIKE '%user_swipes%'
    OR pg_get_triggerdef(t.oid) LIKE '%user_interactions%'
    OR pg_get_triggerdef(t.oid) LIKE '%analytics_user_daily%'
    OR pg_get_triggerdef(t.oid) LIKE '%analytics_event_daily%'
    OR pg_get_triggerdef(t.oid) LIKE '%analytics_artist_daily%'
    OR pg_get_triggerdef(t.oid) LIKE '%analytics_venue_daily%'
    OR pg_get_triggerdef(t.oid) LIKE '%analytics_campaign_daily%'
    OR pg_get_triggerdef(t.oid) LIKE '%streaming_profiles%'
    OR pg_get_triggerdef(t.oid) LIKE '%user_streaming_stats_summary%'
    OR pg_get_triggerdef(t.oid) LIKE '%music_preference_signals%'
    OR pg_get_triggerdef(t.oid) LIKE '%user_recommendations_cache%'
  )
GROUP BY t.tgname, c.relname, p.proname, pg_get_triggerdef(t.oid)
ORDER BY c.relname, t.tgname;

-- ============================================
-- TABLE MAPPING REFERENCE
-- ============================================

-- Reference mapping for updating functions, views, and triggers
SELECT 
  'TABLE MAPPING' as object_type,
  old_table_name,
  new_table_name,
  migration_notes
FROM (VALUES
  ('profiles', 'users_new', 'Rename to users after migration'),
  ('jambase_events', 'events_new', 'Rename to events after migration'),
  ('artist_profile', 'artists_new', 'Merge with artists, rename to artists after migration'),
  ('venue_profile', 'venues_new', 'Merge with venues, rename to venues after migration'),
  ('artists', 'artists_new', 'Merge with artist_profile, rename to artists after migration'),
  ('venues', 'venues_new', 'Merge with venue_profile, rename to venues after migration'),
  ('artist_follows', 'relationships_new', 'Migrate to relationships, rename to relationships after migration'),
  ('venue_follows', 'relationships_new', 'Migrate to relationships, rename to relationships after migration'),
  ('user_jambase_events', 'relationships_new', 'Migrate to relationships, rename to relationships after migration'),
  ('friends', 'relationships_new', 'Migrate to relationships, rename to relationships after migration'),
  ('friend_requests', 'relationships_new', 'Migrate to relationships, rename to relationships after migration'),
  ('matches', 'relationships_new', 'Migrate to relationships, rename to relationships after migration'),
  ('user_blocks', 'relationships_new', 'Migrate to relationships, rename to relationships after migration'),
  ('user_reviews', 'reviews_new', 'Rename to reviews after migration'),
  ('event_comments', 'comments_new', 'Migrate to comments, rename to comments after migration'),
  ('review_comments', 'comments_new', 'Migrate to comments, rename to comments after migration'),
  ('event_likes', 'engagements_new', 'Migrate to engagements, rename to engagements after migration'),
  ('review_likes', 'engagements_new', 'Migrate to engagements, rename to engagements after migration'),
  ('comment_likes', 'engagements_new', 'Migrate to engagements, rename to engagements after migration'),
  ('review_shares', 'engagements_new', 'Migrate to engagements, rename to engagements after migration'),
  ('user_swipes', 'engagements_new', 'Migrate to engagements, rename to engagements after migration'),
  ('user_interactions', 'interactions_new', 'Rename to interactions after migration'),
  ('analytics_user_daily', 'analytics_daily_new', 'Migrate to analytics_daily, rename to analytics_daily after migration'),
  ('analytics_event_daily', 'analytics_daily_new', 'Migrate to analytics_daily, rename to analytics_daily after migration'),
  ('analytics_artist_daily', 'analytics_daily_new', 'Migrate to analytics_daily, rename to analytics_daily after migration'),
  ('analytics_venue_daily', 'analytics_daily_new', 'Migrate to analytics_daily, rename to analytics_daily after migration'),
  ('analytics_campaign_daily', 'analytics_daily_new', 'Migrate to analytics_daily, rename to analytics_daily after migration'),
  ('streaming_profiles', 'user_preferences_new', 'Migrate to user_preferences.streaming_stats JSONB, rename to user_preferences after migration'),
  ('user_streaming_stats_summary', 'user_preferences_new', 'Migrate to user_preferences.streaming_stats JSONB, rename to user_preferences after migration'),
  ('music_preference_signals', 'user_preferences_new', 'Migrate to user_preferences.music_preference_signals JSONB, rename to user_preferences after migration'),
  ('user_recommendations_cache', 'user_preferences_new', 'Migrate to user_preferences.recommendation_cache JSONB, rename to user_preferences after migration')
) AS t(old_table_name, new_table_name, migration_notes)
ORDER BY old_table_name;


-- ============================================
-- DATABASE CONSOLIDATION: PHASE 6 - DROP OLD TABLES
-- ============================================
-- This migration drops all old consolidated tables after verification
-- Run this AFTER Phase 6 (rename tables) is complete and verified
-- WARNING: This permanently deletes old tables. Only run after thorough verification.

-- ============================================
-- 6.2 DROP OLD CONSOLIDATED TABLES
-- ============================================

-- Drop old profiles table (migrated to users)
-- Drop both original and backup versions
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.profiles_old CASCADE;
DROP TABLE IF EXISTS public.profiles_backup CASCADE;

-- Drop old jambase_events table (migrated to events)
-- Drop both original and backup versions
DROP TABLE IF EXISTS public.jambase_events CASCADE;
DROP TABLE IF EXISTS public.jambase_events_old CASCADE;
DROP TABLE IF EXISTS public.jambase_events_backup CASCADE;

-- Drop old artists and artist_profile tables (migrated to artists)
-- Note: If artists/venues tables exist, they might be the OLD ones before merge
-- We should only drop these if they are truly old (have _old suffix or lack new columns)
-- Be careful - the NEW artists/venues tables should have owner_user_id, verified, claimed_at
DROP TABLE IF EXISTS public.artists_old CASCADE;
DROP TABLE IF EXISTS public.venue_profile_old CASCADE;
-- Check if old artist_profile/venue_profile exist (without _old suffix)
DROP TABLE IF EXISTS public.artist_profile CASCADE;
DROP TABLE IF EXISTS public.venue_profile CASCADE;

-- Drop old relationship tables (migrated to relationships)
DROP TABLE IF EXISTS public.artist_follows CASCADE;
DROP TABLE IF EXISTS public.venue_follows CASCADE;
DROP TABLE IF EXISTS public.user_jambase_events CASCADE;
DROP TABLE IF EXISTS public.friends CASCADE;
DROP TABLE IF EXISTS public.friend_requests CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.user_blocks CASCADE;

-- Drop old user_reviews table (migrated to reviews)
-- Drop both original and backup versions
DROP TABLE IF EXISTS public.user_reviews CASCADE;
DROP TABLE IF EXISTS public.user_reviews_old CASCADE;
DROP TABLE IF EXISTS public.user_event_reviews CASCADE;

-- Drop old comment tables (migrated to comments)
-- Drop both original and backup versions
DROP TABLE IF EXISTS public.event_comments CASCADE;
DROP TABLE IF EXISTS public.event_comments_old CASCADE;
DROP TABLE IF EXISTS public.review_comments CASCADE;
DROP TABLE IF EXISTS public.review_comments_old CASCADE;

-- Drop old engagement tables (migrated to engagements)
-- Drop both original and backup versions
DROP TABLE IF EXISTS public.event_likes CASCADE;
DROP TABLE IF EXISTS public.event_likes_old CASCADE;
DROP TABLE IF EXISTS public.review_likes CASCADE;
DROP TABLE IF EXISTS public.review_likes_old CASCADE;
DROP TABLE IF EXISTS public.comment_likes CASCADE;
DROP TABLE IF EXISTS public.comment_likes_old CASCADE;
DROP TABLE IF EXISTS public.review_shares CASCADE;
DROP TABLE IF EXISTS public.review_shares_old CASCADE;
DROP TABLE IF EXISTS public.user_swipes CASCADE;

-- Drop old user_interactions table (migrated to interactions)
-- Drop both original and backup versions
DROP TABLE IF EXISTS public.user_interactions CASCADE;
DROP TABLE IF EXISTS public.user_interactions_old CASCADE;

-- Drop old analytics tables (migrated to analytics_daily)
-- Drop both original and backup versions
DROP TABLE IF EXISTS public.analytics_user_daily CASCADE;
DROP TABLE IF EXISTS public.analytics_user_daily_old CASCADE;
DROP TABLE IF EXISTS public.analytics_event_daily CASCADE;
DROP TABLE IF EXISTS public.analytics_event_daily_old CASCADE;
DROP TABLE IF EXISTS public.analytics_artist_daily CASCADE;
DROP TABLE IF EXISTS public.analytics_artist_daily_old CASCADE;
DROP TABLE IF EXISTS public.analytics_venue_daily CASCADE;
DROP TABLE IF EXISTS public.analytics_venue_daily_old CASCADE;
DROP TABLE IF EXISTS public.analytics_campaign_daily CASCADE;
DROP TABLE IF EXISTS public.analytics_campaign_daily_old CASCADE;

-- Drop old preferences tables (migrated to user_preferences)
-- Drop both original and backup versions
DROP TABLE IF EXISTS public.streaming_profiles CASCADE;
DROP TABLE IF EXISTS public.streaming_profiles_old CASCADE;
DROP TABLE IF EXISTS public.user_streaming_stats_summary CASCADE;
DROP TABLE IF EXISTS public.user_streaming_stats_summary_old CASCADE;
DROP TABLE IF EXISTS public.user_music_taste CASCADE;
DROP TABLE IF EXISTS public.music_preference_signals CASCADE;
DROP TABLE IF EXISTS public.music_preference_signals_old CASCADE;
DROP TABLE IF EXISTS public.user_recommendations_cache CASCADE;
DROP TABLE IF EXISTS public.user_recommendations_cache_old CASCADE;

-- ============================================
-- 6.3 DROP LEGACY TABLES
-- ============================================

-- Drop legacy tables that are no longer used
-- NOTE: DO NOT drop 'events' if it's the consolidated table!
-- Only drop if it's truly an old table (you can check by seeing if it has promotion fields)
-- DROP TABLE IF EXISTS public.events CASCADE; -- Commented out - only drop if confirmed to be old table
DROP TABLE IF EXISTS public.user_artists CASCADE; -- Legacy (replaced by artist_follows → relationships)
DROP TABLE IF EXISTS public.user_venues CASCADE; -- Legacy (replaced by venue_follows → relationships)
DROP TABLE IF EXISTS public.user_events CASCADE; -- Legacy (replaced by user_jambase_events → relationships)

-- Drop any tables with _new suffix (migration temporary tables)
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
-- VERIFICATION QUERIES
-- ============================================

-- Verify all old tables dropped
SELECT 
  'Old tables dropped' as status,
  COUNT(*) as remaining_old_table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
    table_name LIKE '%_old'
    OR table_name IN (
      'profiles',
      'jambase_events',
      'artist_profile',
      'venue_profile',
      'artist_follows',
      'venue_follows',
      'user_jambase_events',
      'friends',
      'friend_requests',
      'matches',
      'user_blocks',
      'user_reviews',
      'event_comments',
      'review_comments',
      'event_likes',
      'review_likes',
      'comment_likes',
      'review_shares',
      'user_swipes',
      'user_interactions',
      'analytics_user_daily',
      'analytics_event_daily',
      'analytics_artist_daily',
      'analytics_venue_daily',
      'analytics_campaign_daily',
      'streaming_profiles',
      'user_streaming_stats_summary',
      'music_preference_signals',
      'user_recommendations_cache',
      'events',
      'user_artists',
      'user_venues',
      'user_events'
    )
  );

-- Verify new consolidated tables exist
SELECT 
  'New consolidated tables exist' as status,
  COUNT(*) as new_table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users',
    'events',
    'artists',
    'venues',
    'relationships',
    'reviews',
    'comments',
    'engagements',
    'interactions',
    'analytics_daily',
    'user_preferences',
    'chats',
    'messages',
    'notifications',
    'account_permissions'
  );


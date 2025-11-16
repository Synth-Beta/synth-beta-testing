-- ============================================
-- IDENTIFY REMAINING OLD TABLES
-- ============================================
-- Lists the 4 old tables that are still present and need to be dropped

SELECT 
  'Remaining Old Tables' as audit_section,
  table_name,
  CASE 
    WHEN table_name LIKE '%_old' OR table_name LIKE '%_backup' OR table_name LIKE '%_new' THEN 'Migration Temp/Backup Table'
    WHEN table_name IN ('profiles', 'jambase_events', 'artist_profile', 'venue_profile',
                        'artist_follows', 'venue_follows', 'user_jambase_events',
                        'friends', 'friend_requests', 'matches', 'user_blocks',
                        'user_reviews', 'event_comments', 'review_comments',
                        'event_likes', 'review_likes', 'comment_likes', 'review_shares',
                        'user_interactions', 'analytics_user_daily', 'analytics_event_daily',
                        'analytics_artist_daily', 'analytics_venue_daily', 'analytics_campaign_daily',
                        'streaming_profiles', 'user_streaming_stats_summary',
                        'music_preference_signals', 'user_recommendations_cache',
                        'user_genre_interactions', 'user_artist_interactions',
                        'user_song_interactions', 'user_venue_interactions',
                        'user_artists', 'user_venues', 'user_events') THEN 'Should Be Dropped (Consolidated)'
    ELSE 'Unknown Status - Review Needed'
  END as status,
  COALESCE((
    SELECT COUNT(*)::TEXT
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = t.table_name
  ), '0') as column_count
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND (
    t.table_name LIKE '%_old'
    OR t.table_name LIKE '%_backup'
    OR t.table_name LIKE '%_new'
    OR t.table_name IN ('profiles', 'jambase_events', 'artist_profile', 'venue_profile',
                      'artist_follows', 'venue_follows', 'user_jambase_events',
                      'friends', 'friend_requests', 'matches', 'user_blocks',
                      'user_reviews', 'event_comments', 'review_comments',
                      'event_likes', 'review_likes', 'comment_likes', 'review_shares',
                      'user_interactions', 'analytics_user_daily', 'analytics_event_daily',
                      'analytics_artist_daily', 'analytics_venue_daily', 'analytics_campaign_daily',
                      'streaming_profiles', 'user_streaming_stats_summary',
                      'music_preference_signals', 'user_recommendations_cache',
                      'user_genre_interactions', 'user_artist_interactions',
                      'user_song_interactions', 'user_venue_interactions',
                      'user_artists', 'user_venues', 'user_events')
  )
  AND t.table_name NOT IN (
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences',
    'consolidation_data_stash'
  )
ORDER BY 
  CASE 
    WHEN t.table_name LIKE '%_old' OR t.table_name LIKE '%_backup' OR t.table_name LIKE '%_new' THEN 1
    WHEN t.table_name IN ('profiles', 'jambase_events', 'artist_profile', 'venue_profile',
                        'artist_follows', 'venue_follows', 'user_jambase_events',
                        'friends', 'friend_requests', 'matches', 'user_blocks',
                        'user_reviews', 'event_comments', 'review_comments',
                        'event_likes', 'review_likes', 'comment_likes', 'review_shares',
                        'user_interactions', 'analytics_user_daily', 'analytics_event_daily',
                        'analytics_artist_daily', 'analytics_venue_daily', 'analytics_campaign_daily',
                        'streaming_profiles', 'user_streaming_stats_summary',
                        'music_preference_signals', 'user_recommendations_cache',
                        'user_genre_interactions', 'user_artist_interactions',
                        'user_song_interactions', 'user_venue_interactions',
                        'user_artists', 'user_venues', 'user_events') THEN 2
    ELSE 3
  END,
  t.table_name;


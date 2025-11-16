-- ============================================
-- ANALYZE REMAINING 28 TABLES
-- ============================================
-- Comprehensive analysis of all non-consolidated tables
-- Shows structure, relationships, and row counts to help decide how to handle each

-- ============================================
-- STEP 1: LIST ALL REMAINING TABLES WITH METADATA
-- ============================================
SELECT 
  'Remaining Tables Overview' as analysis_type,
  t.table_name,
  (
    SELECT COUNT(*) 
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = t.table_name
  ) as column_count,
  (
    SELECT COUNT(DISTINCT constraint_name)
    FROM information_schema.table_constraints
    WHERE table_schema = 'public' 
      AND table_name = t.table_name
      AND constraint_type = 'FOREIGN KEY'
  ) as foreign_key_count,
  (
    SELECT COUNT(DISTINCT constraint_name)
    FROM information_schema.table_constraints
    WHERE table_schema = 'public' 
      AND table_name = t.table_name
      AND constraint_type = 'PRIMARY KEY'
  ) as has_primary_key,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = t.table_name
  ) as has_indexes
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT IN (
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences',
    'consolidation_data_stash'
  )
ORDER BY t.table_name;

-- ============================================
-- STEP 2: CATEGORIZE TABLES BY PURPOSE
-- ============================================
SELECT 
  'Table Categories' as analysis_type,
  table_name,
  CASE 
    -- Event-related supporting tables
    WHEN table_name IN ('event_groups', 'event_group_members', 'event_photos', 
                        'event_photo_comments', 'event_photo_likes', 'event_tickets',
                        'event_ticket_urls', 'event_promotions', 'event_claims',
                        'event_interests', 'event_shares', 'event_genres') 
    THEN 'Event Supporting Features'
    
    -- Review-related supporting tables
    WHEN table_name IN ('review_photos', 'review_videos', 'review_tags') 
    THEN 'Review Supporting Features'
    
    -- Moderation/Admin tables
    WHEN table_name IN ('moderation_flags', 'admin_actions') 
    THEN 'Moderation/Admin'
    
    -- Artist/Venue related
    WHEN table_name IN ('artist_genre_mapping', 'artist_genres', 'city_centers') 
    THEN 'Artist/Venue Reference Data'
    
    -- Email/Messaging
    WHEN table_name IN ('email_preferences', 'email_gate_entries') 
    THEN 'Email/Communication'
    
    -- Legacy/Lookup tables
    WHEN table_name LIKE '%_mapping' OR table_name LIKE '%_genres'
    THEN 'Reference/Mapping Tables'
    
    ELSE 'Other - Needs Review'
  END as category,
  CASE 
    WHEN table_name IN ('event_groups', 'event_group_members', 'event_photos', 
                        'event_photo_comments', 'event_photo_likes', 'event_tickets',
                        'event_ticket_urls', 'event_promotions', 'event_claims',
                        'event_interests', 'event_shares', 'event_genres',
                        'review_photos', 'review_videos', 'review_tags',
                        'moderation_flags', 'admin_actions',
                        'artist_genre_mapping', 'artist_genres', 'city_centers',
                        'email_preferences', 'email_gate_entries') 
    THEN 'Keep - Supporting Feature'
    ELSE 'Review - May Consolidate or Drop'
  END as recommendation
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name NOT IN (
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences',
    'consolidation_data_stash'
  )
ORDER BY 
  CASE 
    WHEN table_name IN ('event_groups', 'event_group_members', 'event_photos', 
                        'event_photo_comments', 'event_photo_likes', 'event_tickets',
                        'event_ticket_urls', 'event_promotions', 'event_claims',
                        'event_interests', 'event_shares', 'event_genres',
                        'review_photos', 'review_videos', 'review_tags',
                        'moderation_flags', 'admin_actions',
                        'artist_genre_mapping', 'artist_genres', 'city_centers',
                        'email_preferences', 'email_gate_entries') 
    THEN 1
    ELSE 2
  END,
  table_name;

-- ============================================
-- STEP 3: DETAILED COLUMN ANALYSIS
-- ============================================
-- Shows key columns to understand each table's purpose
SELECT 
  'Table Columns Analysis' as analysis_type,
  t.table_name,
  STRING_AGG(
    CASE 
      WHEN c.column_name IN ('id', 'user_id', 'event_id', 'artist_id', 'venue_id', 
                             'review_id', 'comment_id', 'created_by_user_id',
                             'owner_user_id', 'related_user_id', 'followed_entity_id',
                             'related_entity_id', 'entity_id', 'related_entity_type',
                             'entity_type') 
      THEN c.column_name || ' [' || c.data_type || ']'
      ELSE NULL
    END,
    ', ' ORDER BY c.ordinal_position
  ) FILTER (WHERE c.column_name IN ('id', 'user_id', 'event_id', 'artist_id', 'venue_id', 
                                     'review_id', 'comment_id', 'created_by_user_id',
                                     'owner_user_id', 'related_user_id', 'followed_entity_id',
                                     'related_entity_id', 'entity_id', 'related_entity_type',
                                     'entity_type')) as key_columns,
  STRING_AGG(
    c.column_name || ' [' || c.data_type || ']',
    ', ' ORDER BY c.ordinal_position
  ) as all_columns
FROM information_schema.tables t
JOIN information_schema.columns c
  ON t.table_name = c.table_name
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT IN (
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences',
    'consolidation_data_stash'
  )
GROUP BY t.table_name
ORDER BY t.table_name;


-- ============================================
-- LIST ALL REMAINING TABLES (NON-CONSOLIDATED)
-- ============================================
-- Lists all tables that are NOT part of the 18 consolidated tables
-- Helps us work through the remaining 28 tables systematically

SELECT 
  'All Remaining Tables' as category,
  t.table_name,
  COALESCE((
    SELECT COUNT(*)::TEXT
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = t.table_name
  ), '0') as column_count,
  -- Try to get row count (may fail for some tables, that's OK)
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t.table_name
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END as table_status
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT IN (
    -- Exclude the 18 consolidated tables
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences',
    'consolidation_data_stash'
  )
ORDER BY t.table_name;

-- ============================================
-- GET DETAILED INFO FOR EACH REMAINING TABLE
-- ============================================
-- Shows column details for each table so we can understand their structure

SELECT 
  'Table Structure Details' as info_type,
  t.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default,
  CASE 
    WHEN c.column_name IN ('id', 'user_id', 'event_id', 'artist_id', 'venue_id') THEN 'KEY'
    WHEN c.column_name LIKE '%_id' THEN 'FK'
    WHEN c.column_name IN ('created_at', 'updated_at', 'created', 'updated') THEN 'TIMESTAMP'
    ELSE 'OTHER'
  END as column_type
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
ORDER BY t.table_name, c.ordinal_position;

-- ============================================
-- CHECK FOR FOREIGN KEY RELATIONSHIPS
-- ============================================
-- Shows what these tables reference to understand dependencies

SELECT 
  'Foreign Key Relationships' as info_type,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name NOT IN (
    'users', 'events', 'artists', 'venues', 'follows', 'user_relationships',
    'relationships', 'reviews', 'comments', 'engagements', 'interactions',
    'analytics_daily', 'user_preferences', 'chats', 'messages', 'notifications',
    'account_permissions', 'monetization_tracking', 'user_genre_preferences',
    'consolidation_data_stash'
  )
ORDER BY tc.table_name, kcu.column_name;


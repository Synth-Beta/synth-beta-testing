-- ============================================
-- DATABASE CONSOLIDATION: PHASE 1 - AUDIT
-- ============================================
-- This script audits the current database state to prepare for consolidation
-- Run this BEFORE starting the migration to understand current state

-- ============================================
-- 1. TABLE INVENTORY WITH ROW COUNTS
-- ============================================

CREATE OR REPLACE FUNCTION audit_table_inventory()
RETURNS TABLE(
  table_name TEXT,
  row_count BIGINT,
  table_size TEXT,
  indexes_count INT,
  has_rls BOOLEAN
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.table_name::TEXT,
    (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text::BIGINT as row_count,
    pg_size_pretty(pg_total_relation_size(format('%I.%I', t.table_schema, t.table_name)))::TEXT as table_size,
    (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = t.table_schema AND tablename = t.table_name)::INT as indexes_count,
    (SELECT relrowsecurity FROM pg_class WHERE relname = t.table_name AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.table_schema)) as has_rls
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name;
END;
$$;

-- Run the audit and save results
SELECT * FROM audit_table_inventory();

-- ============================================
-- 2. FUNCTION INVENTORY
-- ============================================

SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;

-- ============================================
-- 3. VIEW INVENTORY
-- ============================================

SELECT 
  table_name as view_name,
  view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- ============================================
-- 4. TRIGGER INVENTORY
-- ============================================

SELECT 
  t.tgname as trigger_name,
  c.relname as table_name,
  p.proname as function_name,
  pg_get_triggerdef(t.oid) as trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- ============================================
-- 5. RLS POLICY INVENTORY
-- ============================================

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================
-- 6. FOREIGN KEY RELATIONSHIPS
-- ============================================

SELECT
  tc.table_name as source_table,
  kcu.column_name as source_column,
  ccu.table_name as target_table,
  ccu.column_name as target_column,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- ============================================
-- 7. INDEX INVENTORY
-- ============================================

SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ============================================
-- 8. ENUM TYPES INVENTORY
-- ============================================

SELECT 
  t.typname as enum_name,
  array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typtype = 'e'
GROUP BY t.typname
ORDER BY t.typname;

-- ============================================
-- 9. TABLE COLUMN INVENTORY
-- ============================================

SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default,
  character_maximum_length,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles',
    'jambase_events',
    'artists',
    'venues',
    'artist_profile',
    'venue_profile',
    'user_reviews',
    'artist_follows',
    'venue_follows',
    'user_jambase_events',
    'friends',
    'friend_requests',
    'matches',
    'user_swipes',
    'event_likes',
    'event_comments',
    'review_likes',
    'review_comments',
    'comment_likes',
    'review_shares',
    'chats',
    'messages',
    'notifications',
    'user_interactions',
    'analytics_user_daily',
    'analytics_event_daily',
    'analytics_artist_daily',
    'analytics_venue_daily',
    'analytics_campaign_daily',
    'streaming_profiles',
    'user_streaming_stats_summary',
    'user_music_taste',
    'music_preference_signals',
    'user_recommendations_cache',
    'user_blocks',
    'account_permissions'
  )
ORDER BY table_name, ordinal_position;

-- ============================================
-- 10. DATA SAMPLE FOR VERIFICATION
-- ============================================

-- Sample data from key tables for verification (with existence checks)
CREATE OR REPLACE FUNCTION audit_table_counts()
RETURNS TABLE(
  table_name TEXT,
  row_count BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  table_list TEXT[] := ARRAY[
    'profiles',
    'jambase_events',
    'artists',
    'venues',
    'artist_profile',
    'venue_profile',
    'user_reviews',
    'artist_follows',
    'venue_follows',
    'user_jambase_events',
    'friends',
    'friend_requests',
    'matches',
    'user_swipes',
    'event_likes',
    'event_comments',
    'review_likes',
    'review_comments',
    'comment_likes',
    'review_shares',
    'chats',
    'messages',
    'notifications',
    'user_interactions',
    'analytics_user_daily',
    'analytics_event_daily',
    'analytics_artist_daily',
    'analytics_venue_daily',
    'analytics_campaign_daily',
    'streaming_profiles',
    'user_streaming_stats_summary',
    'user_music_taste',
    'music_preference_signals',
    'user_recommendations_cache',
    'user_blocks',
    'account_permissions'
  ];
  table_name_item TEXT;
  table_exists BOOLEAN;
  row_count_result BIGINT;
BEGIN
  FOREACH table_name_item IN ARRAY table_list
  LOOP
    -- Check if table exists (qualify column name to avoid ambiguity)
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_name = table_name_item
    ) INTO table_exists;
    
    IF table_exists THEN
      -- Get row count safely
      EXECUTE format('SELECT COUNT(*) FROM %I', table_name_item) INTO row_count_result;
      
      table_name := table_name_item;
      row_count := row_count_result;
      RETURN NEXT;
    ELSE
      -- Table doesn't exist, return 0
      table_name := table_name_item;
      row_count := 0;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Run the audit and display results
SELECT * FROM audit_table_counts()
ORDER BY table_name;

-- Clean up function (optional - comment out if you want to keep it for future use)
-- DROP FUNCTION IF EXISTS audit_table_counts();


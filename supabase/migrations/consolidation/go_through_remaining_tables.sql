-- ============================================
-- GO THROUGH REMAINING 28 TABLES
-- ============================================
-- This script helps us systematically review each remaining table
-- Run this first to see what we're working with

-- STEP 1: List all remaining tables
SELECT 
  'STEP 1: All Remaining Tables' as step,
  t.table_name,
  (
    SELECT COUNT(*) 
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = t.table_name
  ) as column_count
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

-- STEP 2: Get detailed structure for ONE table at a time
-- Replace 'event_groups' with the table name you want to review
SELECT 
  'STEP 2: Table Structure - event_groups' as step,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'event_groups'
ORDER BY ordinal_position;


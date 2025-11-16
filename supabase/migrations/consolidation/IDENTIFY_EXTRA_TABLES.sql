-- ============================================
-- IDENTIFY EXTRA TABLES (Non-Consolidated)
-- Database Consolidation Migration
-- ============================================
-- This query shows the 28 tables that are NOT part of the 15 consolidated tables
-- These might be legitimate supporting tables or might need to be reviewed

SELECT 
  table_name,
  CASE 
    -- Common supporting/feature tables (these are probably legitimate)
    WHEN table_name IN ('event_promotions', 'event_claims', 'admin_actions', 
                        'moderation_flags', 'event_groups', 'event_group_members',
                        'event_photos', 'event_photo_comments') THEN '✅ Likely legitimate - Supporting table'
    -- Schema/system tables
    WHEN table_name LIKE 'pg_%' OR table_name LIKE '_realtime%' OR table_name LIKE '_prisma%' THEN '🔧 System table'
    -- Unknown - need review
    ELSE '⚠️  REVIEW - Check if needed'
  END as category,
  CASE 
    WHEN table_name IN ('event_promotions', 'event_claims', 'admin_actions', 
                        'moderation_flags', 'event_groups', 'event_group_members',
                        'event_photos', 'event_photo_comments') THEN 1
    WHEN table_name LIKE 'pg_%' OR table_name LIKE '_realtime%' OR table_name LIKE '_prisma%' THEN 2
    ELSE 3
  END as sort_order
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name NOT IN (
    -- 15 Consolidated tables
    'users', 'events', 'artists', 'venues', 'relationships',
    'reviews', 'comments', 'engagements', 'chats', 'messages',
    'notifications', 'interactions', 'analytics_daily',
    'user_preferences', 'account_permissions'
  )
ORDER BY sort_order, table_name;

-- Count by category
SELECT 
  'Category Summary' as info_type,
  COUNT(*) FILTER (WHERE table_name IN ('event_promotions', 'event_claims', 'admin_actions', 
                                         'moderation_flags', 'event_groups', 'event_group_members',
                                         'event_photos', 'event_photo_comments')) as supporting_tables,
  COUNT(*) FILTER (WHERE table_name LIKE 'pg_%' OR table_name LIKE '_realtime%' OR table_name LIKE '_prisma%') as system_tables,
  COUNT(*) FILTER (WHERE table_name NOT IN ('event_promotions', 'event_claims', 'admin_actions', 
                                            'moderation_flags', 'event_groups', 'event_group_members',
                                            'event_photos', 'event_photo_comments')
                     AND table_name NOT LIKE 'pg_%' 
                     AND table_name NOT LIKE '_realtime%' 
                     AND table_name NOT LIKE '_prisma%') as unknown_tables,
  COUNT(*) as total_extra_tables
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name NOT IN (
    'users', 'events', 'artists', 'venues', 'relationships',
    'reviews', 'comments', 'engagements', 'chats', 'messages',
    'notifications', 'interactions', 'analytics_daily',
    'user_preferences', 'account_permissions'
  );


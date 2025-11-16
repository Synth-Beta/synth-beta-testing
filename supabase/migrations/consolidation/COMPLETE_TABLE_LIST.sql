-- ============================================
-- COMPLETE TABLE LIST WITH CATEGORIES
-- Database Consolidation Migration
-- ============================================
-- This gives you a complete categorized view of all 43 tables

SELECT 
  table_name,
  CASE 
    -- 15 Consolidated tables
    WHEN table_name IN ('users', 'events', 'artists', 'venues', 'relationships',
                        'reviews', 'comments', 'engagements', 'chats', 'messages',
                        'notifications', 'interactions', 'analytics_daily',
                        'user_preferences', 'account_permissions') THEN '✅ Consolidated (15 tables)'
    -- Supporting/Feature tables (legitimate)
    WHEN table_name IN ('event_promotions', 'event_claims', 'admin_actions', 
                        'moderation_flags', 'event_groups', 'event_group_members',
                        'event_photos', 'event_photo_comments') THEN '✅ Supporting Table'
    -- Check for other common patterns
    WHEN table_name LIKE '%_migration%' OR table_name LIKE '%_temp%' THEN '⚠️  Migration/Temp - Review'
    WHEN table_name LIKE '%_old%' OR table_name LIKE '%_backup%' OR table_name LIKE '%_new%' THEN '🗑️  Backup/Temp - Should Drop'
    ELSE '⚠️  Other - Review'
  END as category,
  CASE 
    WHEN table_name IN ('users', 'events', 'artists', 'venues', 'relationships',
                        'reviews', 'comments', 'engagements', 'chats', 'messages',
                        'notifications', 'interactions', 'analytics_daily',
                        'user_preferences', 'account_permissions') THEN 1
    WHEN table_name IN ('event_promotions', 'event_claims', 'admin_actions', 
                        'moderation_flags', 'event_groups', 'event_group_members',
                        'event_photos', 'event_photo_comments') THEN 2
    WHEN table_name LIKE '%_old%' OR table_name LIKE '%_backup%' OR table_name LIKE '%_new%' THEN 3
    ELSE 4
  END as sort_order
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY sort_order, table_name;


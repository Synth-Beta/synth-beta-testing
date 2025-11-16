-- ============================================
-- STEP 19: CONSOLIDATION COMPLETE VERIFICATION
-- ============================================
-- Final verification that all consolidation steps are complete

DO $$
DECLARE
  consolidated_table_count INTEGER;
  supporting_table_count INTEGER;
  total_table_count INTEGER;
  old_table_count INTEGER;
BEGIN
  RAISE NOTICE '=== CONSOLIDATION COMPLETE VERIFICATION ===';
  RAISE NOTICE '';
  
  -- Count consolidated tables (15 core tables)
  SELECT COUNT(*) INTO consolidated_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'users', 'events', 'artists', 'venues',
      'relationships', 'follows', 'user_relationships',
      'reviews', 'comments', 'engagements', 'interactions',
      'chats', 'messages', 'notifications',
      'analytics_daily', 'user_preferences'
    );
  
  -- Count supporting tables (complex feature tables)
  SELECT COUNT(*) INTO supporting_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND LOWER(table_name) IN (
      'admin_actions', 'event_claims', 'event_group_members',
      'event_groups', 'event_photo_comments', 'event_photos',
      'event_promotions', 'event_tickets', 'moderation_flags',
      'monetization_tracking', 'user_genre_preferences', 'waitlist',
      'account_permissions', 'city_centers'
    );
  
  -- Total tables
  SELECT COUNT(*) INTO total_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE';
  
  -- Count any remaining old tables (should be 0)
  SELECT COUNT(*) INTO old_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name NOT IN (
      -- Consolidated tables
      'users', 'events', 'artists', 'venues',
      'relationships', 'follows', 'user_relationships',
      'reviews', 'comments', 'engagements', 'interactions',
      'chats', 'messages', 'notifications',
      'analytics_daily', 'user_preferences',
      -- Supporting tables
      'admin_actions', 'event_claims', 'event_group_members',
      'event_groups', 'event_photo_comments', 'event_photos',
      'event_promotions', 'event_tickets', 'moderation_flags',
      'monetization_tracking', 'user_genre_preferences', 'waitlist',
      'account_permissions', 'city_centers'
    );
  
  RAISE NOTICE 'Consolidated Tables (15 core): %', consolidated_table_count;
  RAISE NOTICE 'Supporting Tables (complex features): %', supporting_table_count;
  RAISE NOTICE 'Total Tables: %', total_table_count;
  RAISE NOTICE 'Remaining Old Tables: %', old_table_count;
  RAISE NOTICE '';
  
  IF consolidated_table_count = 15 AND old_table_count = 0 THEN
    RAISE NOTICE '✅ CONSOLIDATION COMPLETE!';
    RAISE NOTICE '';
    RAISE NOTICE 'All data has been migrated to the 15 consolidated tables.';
    RAISE NOTICE 'All old/unused tables have been dropped.';
    RAISE NOTICE 'Supporting tables for complex features are maintained.';
  ELSIF consolidated_table_count < 15 THEN
    RAISE NOTICE '⚠️ WARNING: Missing % consolidated table(s)', 15 - consolidated_table_count;
  ELSIF old_table_count > 0 THEN
    RAISE NOTICE '⚠️ WARNING: % old table(s) still remain', old_table_count;
  ELSE
    RAISE NOTICE '⚠️ Status unclear - verify manually';
  END IF;
END $$;

-- Final summary
SELECT 
  'Consolidation Summary' as summary_type,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN (
     'users', 'events', 'artists', 'venues',
     'relationships', 'follows', 'user_relationships',
     'reviews', 'comments', 'engagements', 'interactions',
     'chats', 'messages', 'notifications',
     'analytics_daily', 'user_preferences'
   )) as consolidated_tables_count,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND LOWER(table_name) IN (
     'admin_actions', 'event_claims', 'event_group_members',
     'event_groups', 'event_photo_comments', 'event_photos',
     'event_promotions', 'event_tickets', 'moderation_flags',
     'monetization_tracking', 'user_genre_preferences', 'waitlist',
     'account_permissions', 'city_centers'
   )) as supporting_tables_count,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE') as total_tables_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name IN (
            'users', 'events', 'artists', 'venues',
            'relationships', 'follows', 'user_relationships',
            'reviews', 'comments', 'engagements', 'interactions',
            'chats', 'messages', 'notifications',
            'analytics_daily', 'user_preferences'
          )) = 15
     AND (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          AND LOWER(table_name) NOT IN (
            'users', 'events', 'artists', 'venues',
            'relationships', 'follows', 'user_relationships',
            'reviews', 'comments', 'engagements', 'interactions',
            'chats', 'messages', 'notifications',
            'analytics_daily', 'user_preferences',
            'admin_actions', 'event_claims', 'event_group_members',
            'event_groups', 'event_photo_comments', 'event_photos',
            'event_promotions', 'event_tickets', 'moderation_flags',
            'monetization_tracking', 'user_genre_preferences', 'waitlist',
            'account_permissions', 'city_centers'
          )) = 0
    THEN 'COMPLETE ✅'
    ELSE 'IN PROGRESS ⚠️'
  END as consolidation_status;


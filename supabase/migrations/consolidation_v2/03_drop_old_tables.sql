-- ============================================
-- CONSOLIDATION V2: DROP OLD TABLES
-- ============================================
-- Drop all supporting tables after successful migration
-- NOTE: waitlist table is LEFT ALONE per user request

-- ============================================
-- PRE-DROP VERIFICATION: Check source table row counts
-- ============================================
DO $$
DECLARE
  table_name TEXT;
  row_count BIGINT;
  tables_to_check TEXT[] := ARRAY[
    'account_permissions',
    'admin_actions',
    'event_claims',
    'event_groups',
    'event_group_members',
    'event_photos',
    'event_tickets',
    'event_promotions',
    'monetization_tracking',
    'user_genre_preferences',
    'moderation_flags'
  ];
BEGIN
  RAISE NOTICE '=== PRE-DROP VERIFICATION: Checking source table row counts ===';
  RAISE NOTICE '';
  
  FOREACH table_name IN ARRAY tables_to_check
  LOOP
    DECLARE
      actual_table_name TEXT;
      check_table_name TEXT := table_name;
    BEGIN
      SELECT t.table_name INTO actual_table_name
      FROM information_schema.tables t
      WHERE t.table_schema = 'public' 
        AND LOWER(t.table_name) = LOWER(check_table_name)
      LIMIT 1;
      
      IF actual_table_name IS NOT NULL THEN
        EXECUTE format('SELECT COUNT(*) FROM public.%I', actual_table_name) INTO row_count;
        RAISE NOTICE '%: % rows', actual_table_name, row_count;
        
        IF row_count > 0 THEN
          RAISE NOTICE '  ⚠️ WARNING: % still has % rows - verify migration completed', actual_table_name, row_count;
        END IF;
      ELSE
        RAISE NOTICE '%: Table does not exist', check_table_name;
      END IF;
    END;
  END LOOP;
  
  RAISE NOTICE '';
END $$;

-- ============================================
-- DROP OLD TABLES
-- ============================================
DO $$
DECLARE
  dropped_count INTEGER := 0;
  table_to_drop TEXT;
  tables_to_check TEXT[] := ARRAY[
    'account_permissions',
    'admin_actions',
    'event_claims',
    'event_groups',
    'event_group_members',
    'event_photos',
    'event_tickets',
    'event_promotions',
    'monetization_tracking',
    'user_genre_preferences',
    'moderation_flags'
  ];
  -- waitlist is intentionally excluded
BEGIN
  RAISE NOTICE '=== CONSOLIDATION V2: DROPPING OLD TABLES ===';
  RAISE NOTICE '';
  RAISE NOTICE 'NOTE: waitlist table will be LEFT ALONE';
  RAISE NOTICE '';
  
  FOREACH table_to_drop IN ARRAY tables_to_check
  LOOP
    DECLARE
      actual_table_name TEXT;
      drop_table_name TEXT := table_to_drop;
      table_exists BOOLEAN;
    BEGIN
      -- Check if table exists
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_schema = 'public' 
          AND LOWER(t.table_name) = LOWER(drop_table_name)
      ) INTO table_exists;
      
      IF table_exists THEN
        -- Get actual table name (case-sensitive)
        SELECT t.table_name INTO actual_table_name
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND LOWER(t.table_name) = LOWER(drop_table_name)
        LIMIT 1;
        
        RAISE NOTICE 'Dropping %...', actual_table_name;
        
        BEGIN
          EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', actual_table_name);
          dropped_count := dropped_count + 1;
          RAISE NOTICE '  ✅ Dropped %', actual_table_name;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE '  ❌ ERROR dropping %: %', actual_table_name, SQLERRM;
        END;
      ELSE
        RAISE NOTICE '%: Already dropped or does not exist', drop_table_name;
      END IF;
    END;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'Dropped % table(s)', dropped_count;
  
  -- Verify waitlist is still present
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND LOWER(table_name) = 'waitlist'
  ) THEN
    RAISE NOTICE '✅ waitlist table preserved as requested';
  ELSE
    RAISE NOTICE '⚠️ waitlist table not found (may have been dropped previously)';
  END IF;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
DECLARE
  remaining_tables INTEGER;
  waitlist_exists BOOLEAN;
  all_dropped BOOLEAN;
  remaining_table_rec RECORD;
BEGIN
  -- Count remaining supporting tables (excluding waitlist)
  SELECT COUNT(*) INTO remaining_tables
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND LOWER(table_name) IN (
      'account_permissions',
      'admin_actions',
      'event_claims',
      'event_groups',
      'event_group_members',
      'event_photos',
      'event_tickets',
      'event_promotions',
      'monetization_tracking',
      'user_genre_preferences',
      'moderation_flags'
    );
  
  -- Check if waitlist exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND LOWER(table_name) = 'waitlist'
  ) INTO waitlist_exists;
  
  all_dropped := (remaining_tables = 0);
  
  RAISE NOTICE '';
  RAISE NOTICE '=== VERIFICATION ===';
  RAISE NOTICE 'Remaining supporting tables (excluding waitlist): %', remaining_tables;
  RAISE NOTICE 'waitlist table exists: %', waitlist_exists;
  RAISE NOTICE '';
  
  IF all_dropped AND waitlist_exists THEN
    RAISE NOTICE '✅ SUCCESS: All supporting tables dropped (waitlist preserved)';
  ELSIF all_dropped AND NOT waitlist_exists THEN
    RAISE NOTICE '⚠️ WARNING: All supporting tables dropped, but waitlist not found';
  ELSIF NOT all_dropped AND waitlist_exists THEN
    RAISE NOTICE '⚠️ WARNING: % supporting table(s) still exist', remaining_tables;
  ELSE
    RAISE NOTICE '⚠️ WARNING: Check status - % tables remain, waitlist status unclear', remaining_tables;
  END IF;
  
  -- List remaining tables
  RAISE NOTICE 'Remaining supporting tables:';
  FOR remaining_table_rec IN
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND LOWER(t.table_name) IN (
        'account_permissions',
        'admin_actions',
        'event_claims',
        'event_groups',
        'event_group_members',
        'event_photos',
        'event_tickets',
        'event_promotions',
        'monetization_tracking',
        'user_genre_preferences',
        'moderation_flags'
      )
    ORDER BY t.table_name
  LOOP
    RAISE NOTICE '  - %', remaining_table_rec.table_name;
  END LOOP;
END $$;

-- Diagnostic query: List remaining tables
SELECT 
  table_name as remaining_table
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND LOWER(table_name) IN (
    'account_permissions',
    'admin_actions',
    'event_claims',
    'event_groups',
    'event_group_members',
    'event_photos',
    'event_tickets',
    'event_promotions',
    'monetization_tracking',
    'user_genre_preferences',
    'moderation_flags'
  )
ORDER BY table_name;

-- Final verification query with detailed breakdown
SELECT 
  'Drop Verification' as check_type,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_type = 'BASE TABLE'
     AND LOWER(table_name) IN (
       'account_permissions',
       'admin_actions',
       'event_claims',
       'event_groups',
       'event_group_members',
       'event_photos',
       'event_tickets',
       'event_promotions',
       'monetization_tracking',
       'user_genre_preferences',
       'moderation_flags'
     )) as remaining_supporting_tables,
  (SELECT string_agg(table_name, ', ' ORDER BY table_name)
   FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_type = 'BASE TABLE'
     AND LOWER(table_name) IN (
       'account_permissions',
       'admin_actions',
       'event_claims',
       'event_groups',
       'event_group_members',
       'event_photos',
       'event_tickets',
       'event_promotions',
       'monetization_tracking',
       'user_genre_preferences',
       'moderation_flags'
     )) as remaining_table_names,
  (SELECT EXISTS (
     SELECT 1 FROM information_schema.tables 
     WHERE table_schema = 'public' 
       AND LOWER(table_name) = 'waitlist'
   )) as waitlist_preserved,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_type = 'BASE TABLE'
     AND LOWER(table_name) IN (
       'users', 'events', 'artists', 'venues',
       'relationships', 'follows', 'user_relationships',
       'reviews', 'comments', 'engagements', 'interactions',
       'chats', 'messages', 'notifications',
       'analytics_daily', 'user_preferences'
     )) as core_tables_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            AND LOWER(table_name) IN (
              'account_permissions',
              'admin_actions',
              'event_claims',
              'event_groups',
              'event_group_members',
              'event_photos',
              'event_tickets',
              'event_promotions',
              'monetization_tracking',
              'user_genre_preferences',
              'moderation_flags'
            )) = 0
     AND (SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND LOWER(table_name) = 'waitlist'
          )) = true
    THEN 'SUCCESS ✅'
    ELSE 'CHECK REQUIRED ⚠️'
  END as verification_status;


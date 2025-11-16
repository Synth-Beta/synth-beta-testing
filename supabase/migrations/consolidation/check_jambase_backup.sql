-- ============================================
-- CHECK: Does jambase_events backup exist?
-- ============================================
-- This script checks if jambase_events_old exists and how to restore

-- Table existence check - this will always return results
SELECT 
  'Table Existence Check' as check_type,
  'jambase_events' as table_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND  table_name = 'jambase_events')
    THEN 'EXISTS - Original table'
    ELSE 'DOES NOT EXIST'
  END as table_status
UNION ALL
SELECT 
  'Table Existence Check' as check_type,
  'jambase_events_old' as table_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jambase_events_old')
    THEN 'EXISTS - Backup table (renamed)'
    ELSE 'DOES NOT EXIST - Was dropped by 12_drop_old_tables.sql'
  END as table_status
UNION ALL
SELECT 
  'Table Existence Check' as check_type,
  'events' as table_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events')
    THEN 'EXISTS - Consolidated table (final)'
    ELSE 'DOES NOT EXIST'
  END as table_status
UNION ALL
SELECT 
  'Table Existence Check' as check_type,
  'events_new' as table_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events_new')
    THEN 'EXISTS - Consolidated table (temporary)'
    ELSE 'DOES NOT EXIST'
  END as table_status;

-- Check row counts for each table using a function to safely get counts
DO $$
DECLARE
  v_jambase_exists BOOLEAN;
  v_jambase_count INTEGER;
  v_jambase_old_exists BOOLEAN;
  v_jambase_old_count INTEGER;
  v_events_exists BOOLEAN;
  v_events_count INTEGER;
  v_events_new_exists BOOLEAN;
  v_events_new_count INTEGER;
BEGIN
  -- Check jambase_events
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'jambase_events'
  ) INTO v_jambase_exists;
  
  IF v_jambase_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.jambase_events' INTO v_jambase_count;
    RAISE NOTICE 'jambase_events: EXISTS with % rows', v_jambase_count;
  ELSE
    RAISE NOTICE 'jambase_events: DOES NOT EXIST';
  END IF;
  
  -- Check jambase_events_old
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'jambase_events_old'
  ) INTO v_jambase_old_exists;
  
  IF v_jambase_old_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.jambase_events_old' INTO v_jambase_old_count;
    RAISE NOTICE 'jambase_events_old: EXISTS with % rows - This is your backup!', v_jambase_old_count;
  ELSE
    RAISE NOTICE 'jambase_events_old: DOES NOT EXIST - Was dropped by 12_drop_old_tables.sql';
  END IF;
  
  -- Check events
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'events'
  ) INTO v_events_exists;
  
  IF v_events_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.events' INTO v_events_count;
    RAISE NOTICE 'events: EXISTS with % rows - Contains migrated data', v_events_count;
  ELSE
    RAISE NOTICE 'events: DOES NOT EXIST';
  END IF;
  
  -- Check events_new
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'events_new'
  ) INTO v_events_new_exists;
  
  IF v_events_new_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.events_new' INTO v_events_new_count;
    RAISE NOTICE 'events_new: EXISTS with % rows - Temporary table (should be renamed to events)', v_events_new_count;
  ELSE
    RAISE NOTICE 'events_new: DOES NOT EXIST';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== SUMMARY ===';
  IF v_jambase_old_exists THEN
    RAISE NOTICE 'RECOMMENDATION: Restore from jambase_events_old (backup exists!)';
  ELSIF v_events_exists AND v_events_count > 0 THEN
    RAISE NOTICE 'RECOMMENDATION: Restore from events table using restore_jambase_events.sql';
  ELSIF v_events_new_exists AND v_events_new_count > 0 THEN
    RAISE NOTICE 'RECOMMENDATION: Restore from events_new table using restore_jambase_events.sql';
  ELSE
    RAISE WARNING 'WARNING: No source found. Data may have been lost. Check database backups.';
  END IF;
END $$;

-- Row count summary (this will always return results)
SELECT 
  'Row Count Summary' as check_type,
  'jambase_events' as table_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jambase_events')
    THEN 'Use DO block result above'
    ELSE 'N/A - Table does not exist'
  END as row_count_info,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jambase_events')
    THEN 'EXISTS'
    ELSE 'DOES NOT EXIST'
  END as status
UNION ALL
SELECT 
  'Row Count Summary' as check_type,
  'jambase_events_old' as table_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jambase_events_old')
    THEN 'Use DO block result above'
    ELSE 'N/A - Table does not exist (dropped)'
  END as row_count_info,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jambase_events_old')
    THEN 'EXISTS - This is your backup!'
    ELSE 'DOES NOT EXIST'
  END as status
UNION ALL
SELECT 
  'Row Count Summary' as check_type,
  'events' as table_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events')
    THEN 'Use DO block result above'
    ELSE 'N/A - Table does not exist'
  END as row_count_info,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events')
    THEN 'EXISTS - Contains migrated data'
    ELSE 'DOES NOT EXIST'
  END as status
UNION ALL
SELECT 
  'Row Count Summary' as check_type,
  'events_new' as table_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events_new')
    THEN 'Use DO block result above'
    ELSE 'N/A - Table does not exist'
  END as row_count_info,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events_new')
    THEN 'EXISTS - Temporary table'
    ELSE 'DOES NOT EXIST'
  END as status;

-- Check if events table has source column to identify jambase events
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('events', 'events_new')
  ) THEN
    RAISE NOTICE 'Checking if source column exists in events table...';
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name IN ('events', 'events_new')
      AND column_name = 'source'
    ) THEN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events') THEN
        RAISE NOTICE 'events table has source column. Jambase events count: %', 
          (SELECT COUNT(*) FROM public.events WHERE COALESCE(source, 'jambase') = 'jambase');
      ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events_new') THEN
        RAISE NOTICE 'events_new table has source column. Jambase events count: %', 
          (SELECT COUNT(*) FROM public.events_new WHERE COALESCE(source, 'jambase') = 'jambase');
      END IF;
    ELSE
      RAISE WARNING 'WARNING: source column does not exist in events table. Cannot distinguish jambase events from others.';
    END IF;
  END IF;
END $$;


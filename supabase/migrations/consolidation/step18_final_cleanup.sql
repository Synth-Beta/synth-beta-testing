-- ============================================
-- STEP 18: FINAL CLEANUP
-- ============================================
-- Drop email_preferences (already migrated) and consolidation_data_stash (temporary table)

DO $$
DECLARE
  email_prefs_count BIGINT;
  consolidation_stash_count BIGINT;
  migrated_count BIGINT;
  dropped_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== FINAL CLEANUP ===';
  RAISE NOTICE '';
  
  -- ============================================
  -- 1. DROP email_preferences (already migrated)
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'email_preferences'
  ) THEN
    SELECT COUNT(*) INTO email_prefs_count FROM public.email_preferences;
    SELECT COUNT(*) INTO migrated_count 
    FROM public.user_preferences 
    WHERE email_preferences IS NOT NULL 
      AND (email_preferences ? 'enable_event_reminders' 
           OR email_preferences->>'migrated_from_table' = 'true');
    
    RAISE NOTICE 'email_preferences:';
    RAISE NOTICE '  Source rows: %', email_prefs_count;
    RAISE NOTICE '  Migrated to user_preferences.email_preferences: %', migrated_count;
    
    IF migrated_count >= email_prefs_count THEN
      RAISE NOTICE '  ✅ All preferences migrated - Dropping email_preferences...';
      DROP TABLE IF EXISTS public.email_preferences CASCADE;
      RAISE NOTICE '  ✅ email_preferences dropped';
      dropped_count := dropped_count + 1;
    ELSE
      RAISE NOTICE '  ⚠️ WARNING: Only %/% migrated - NOT dropping', migrated_count, email_prefs_count;
    END IF;
  ELSE
    RAISE NOTICE 'email_preferences: Already dropped ✅';
  END IF;
  
  RAISE NOTICE '';
  
  -- ============================================
  -- 2. DROP consolidation_data_stash (temporary migration table)
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'consolidation_data_stash'
  ) THEN
    SELECT COUNT(*) INTO consolidation_stash_count FROM public.consolidation_data_stash;
    
    RAISE NOTICE 'consolidation_data_stash:';
    RAISE NOTICE '  Row count: %', consolidation_stash_count;
    RAISE NOTICE '  Purpose: Temporary migration table storing orphaned data';
    RAISE NOTICE '  Action: Review stashed data, then drop if safe';
    RAISE NOTICE '';
    RAISE NOTICE '  ⚠️ WARNING: Dropping consolidation_data_stash will permanently delete';
    RAISE NOTICE '            any orphaned data stashed during consolidation.';
    RAISE NOTICE '            Review the data first if needed.';
    RAISE NOTICE '';
    RAISE NOTICE '  Dropping consolidation_data_stash...';
    
    DROP TABLE IF EXISTS public.consolidation_data_stash CASCADE;
    
    RAISE NOTICE '  ✅ consolidation_data_stash dropped';
    dropped_count := dropped_count + 1;
  ELSE
    RAISE NOTICE 'consolidation_data_stash: Already dropped ✅';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'Dropped % table(s)', dropped_count;
  
  IF dropped_count = 2 THEN
    RAISE NOTICE '✅ All cleanup complete!';
  ELSIF dropped_count = 1 THEN
    RAISE NOTICE '⚠️ One table dropped, one may need attention';
  ELSE
    RAISE NOTICE '⚠️ Tables not dropped - verify migrations first';
  END IF;
END $$;

-- Verification
SELECT 
  'Final Cleanup Verification' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'email_preferences'
    ) THEN 'STILL EXISTS ⚠️'
    ELSE 'DROPPED ✅'
  END as email_preferences_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'consolidation_data_stash'
    ) THEN 'STILL EXISTS ⚠️'
    ELSE 'DROPPED ✅'
  END as consolidation_data_stash_status;


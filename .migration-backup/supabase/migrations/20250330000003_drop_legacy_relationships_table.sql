-- ============================================
-- DROP legacy_relationships TABLE
-- ============================================
-- This migration drops the legacy_relationships table after verifying:
-- 1. All data has been migrated to user_event_relationships
-- 2. No code references legacy_relationships
-- 3. Migration period has passed (table is read-only)
--
-- PREREQUISITES:
-- - Migration 20250330000000 (create user_event_relationships and migrate data)
-- - Migration 20250330000001 (rename relationships to legacy_relationships)
-- - Migration 20250330000002 (make legacy_relationships read-only)
-- - Verification that all application code uses user_event_relationships
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: VERIFICATION BEFORE DROP
-- ============================================
DO $$
DECLARE
  legacy_relationships_exists BOOLEAN;
  legacy_count INTEGER := 0;
  new_count INTEGER := 0;
  difference INTEGER;
BEGIN
  -- Check if legacy_relationships table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'legacy_relationships'
  ) INTO legacy_relationships_exists;
  
  IF NOT legacy_relationships_exists THEN
    RAISE NOTICE '✅ legacy_relationships table does not exist - nothing to drop';
    RETURN;
  END IF;
  
  -- Count rows in legacy table (only event relationships)
  SELECT COUNT(*) INTO legacy_count
  FROM public.legacy_relationships
  WHERE related_entity_type = 'event';
  
  -- Count rows in new table
  SELECT COUNT(*) INTO new_count
  FROM public.user_event_relationships;
  
  difference := new_count - legacy_count;
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PRE-DROP VERIFICATION';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'legacy_relationships (events): % rows', legacy_count;
  RAISE NOTICE 'user_event_relationships: % rows', new_count;
  RAISE NOTICE 'Difference: % rows', difference;
  RAISE NOTICE '================================================';
  
  -- Warn if new table has fewer rows (shouldn't happen, but worth checking)
  IF new_count < legacy_count THEN
    RAISE WARNING '⚠️  WARNING: user_event_relationships has FEWER rows than legacy_relationships!';
    RAISE WARNING '⚠️  This may indicate data loss. Please verify before dropping.';
    RAISE EXCEPTION 'Data migration verification failed - new table has fewer rows than legacy table';
  END IF;
  
  -- Log if new table has more rows (this is OK - new data may have been added)
  IF new_count > legacy_count THEN
    RAISE NOTICE '✅ New table has more rows (expected - new data may have been added since migration)';
  END IF;
  
  IF new_count = legacy_count THEN
    RAISE NOTICE '✅ Row counts match exactly';
  END IF;
  
  RAISE NOTICE '✅ Verification passed - safe to drop legacy_relationships table';
END $$;

-- ============================================
-- STEP 2: DROP legacy_relationships TABLE
-- ============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'legacy_relationships'
  ) THEN
    -- Drop the table (CASCADE to handle any remaining dependencies like indexes, triggers, etc.)
    DROP TABLE IF EXISTS public.legacy_relationships CASCADE;
    
    RAISE NOTICE '✅ Successfully dropped legacy_relationships table';
  ELSE
    RAISE NOTICE '⚠️  legacy_relationships table does not exist - nothing to drop';
  END IF;
END $$;

-- ============================================
-- STEP 3: FINAL VERIFICATION
-- ============================================
DO $$
DECLARE
  legacy_relationships_exists BOOLEAN;
  user_event_relationships_exists BOOLEAN;
BEGIN
  -- Verify legacy table is gone
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'legacy_relationships'
  ) INTO legacy_relationships_exists;
  
  -- Verify new table still exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_event_relationships'
  ) INTO user_event_relationships_exists;
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'POST-DROP VERIFICATION';
  RAISE NOTICE '================================================';
  
  IF legacy_relationships_exists THEN
    RAISE WARNING '⚠️  legacy_relationships table still exists! Drop may have failed.';
  ELSE
    RAISE NOTICE '✅ legacy_relationships table successfully dropped';
  END IF;
  
  IF user_event_relationships_exists THEN
    RAISE NOTICE '✅ user_event_relationships table exists (as expected)';
  ELSE
    RAISE WARNING '⚠️  user_event_relationships table does not exist! This is unexpected.';
  END IF;
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Migration complete. legacy_relationships table has been removed.';
  RAISE NOTICE 'All event relationships are now stored in user_event_relationships (3NF compliant).';
  RAISE NOTICE '================================================';
END $$;

COMMIT;

-- ============================================
-- NOTES
-- ============================================
-- This migration permanently removes the legacy_relationships table.
-- All event relationship data should be in user_event_relationships table.
-- If you need to rollback, you would need to:
-- 1. Restore from database backup
-- 2. Or recreate the table structure and restore data from user_event_relationships
-- ============================================

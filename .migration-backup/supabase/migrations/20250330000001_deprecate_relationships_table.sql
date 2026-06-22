-- ============================================
-- DEPRECATE relationships TABLE
-- ============================================
-- Rename relationships table to legacy_relationships
-- This should only be run after:
-- 1. ✅ user_event_relationships table is created and populated
-- 2. ✅ All SQL functions have been updated to use user_event_relationships
-- 3. ✅ All application code has been updated (including personalized feed v4/v3)
-- 4. ✅ Data migration has been verified
-- 5. ✅ Application has been tested and works correctly
-- 
-- NOTE: Personalized feed v4 (get_personalized_feed_v4) and v3 should already
-- be using user_event_relationships table. Verify before running this migration.
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: VERIFICATION BEFORE DEPRECATION
-- ============================================
DO $$
DECLARE
  relationships_exists BOOLEAN;
  user_event_relationships_exists BOOLEAN;
  relationships_count INTEGER := 0;
  user_event_relationships_count INTEGER := 0;
BEGIN
  -- Check if relationships table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'relationships'
  ) INTO relationships_exists;
  
  -- Check if user_event_relationships table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_event_relationships'
  ) INTO user_event_relationships_exists;
  
  IF NOT user_event_relationships_exists THEN
    RAISE EXCEPTION 'user_event_relationships table does not exist. Cannot deprecate relationships table yet.';
  END IF;
  
  IF relationships_exists THEN
    -- Count event relationships in old table
    SELECT COUNT(*) INTO relationships_count
    FROM public.relationships
    WHERE related_entity_type = 'event';
    
    -- Count rows in new table
    SELECT COUNT(*) INTO user_event_relationships_count
    FROM public.user_event_relationships;
    
    RAISE NOTICE '================================================';
    RAISE NOTICE 'PRE-DEPRECATION VERIFICATION';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'relationships table (events): % rows', relationships_count;
    RAISE NOTICE 'user_event_relationships table: % rows', user_event_relationships_count;
    RAISE NOTICE '================================================';
    
    IF user_event_relationships_count < relationships_count THEN
      RAISE WARNING '⚠️ user_event_relationships has fewer rows than relationships. Data migration may be incomplete.';
    END IF;
  ELSE
    RAISE NOTICE 'relationships table does not exist, nothing to deprecate.';
    RETURN;
  END IF;
END $$;

-- ============================================
-- STEP 2: RENAME TABLE (SOFT DEPRECATION)
-- ============================================
-- Rename relationships to legacy_relationships
-- This preserves data and allows for rollback if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'relationships'
  ) THEN
    -- Rename the table
    ALTER TABLE public.relationships RENAME TO legacy_relationships;
    
    -- Rename indexes to match new table name
    ALTER INDEX IF EXISTS idx_relationships_user_id RENAME TO idx_legacy_relationships_user_id;
    ALTER INDEX IF EXISTS idx_relationships_entity_id RENAME TO idx_legacy_relationships_entity_id;
    ALTER INDEX IF EXISTS idx_relationships_type RENAME TO idx_legacy_relationships_type;
    ALTER INDEX IF EXISTS idx_relationships_user_type RENAME TO idx_legacy_relationships_user_type;
    ALTER INDEX IF EXISTS idx_relationships_created_at RENAME TO idx_legacy_relationships_created_at;
    
    -- Add deprecation comment
    COMMENT ON TABLE public.legacy_relationships IS 
    'DEPRECATED: Event relationships migrated to user_event_relationships table for 3NF compliance. This table is kept for rollback purposes only. Do not use in new code.';
    
    RAISE NOTICE '✅ Successfully renamed relationships table to legacy_relationships';
  ELSE
    RAISE NOTICE 'relationships table does not exist, skipping rename.';
  END IF;
END $$;

-- ============================================
-- STEP 3: VERIFICATION AFTER DEPRECATION
-- ============================================
DO $$
DECLARE
  relationships_exists BOOLEAN;
  legacy_relationships_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'relationships'
  ) INTO relationships_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'legacy_relationships'
  ) INTO legacy_relationships_exists;
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'POST-DEPRECATION VERIFICATION';
  RAISE NOTICE '================================================';
  
  IF relationships_exists THEN
    RAISE WARNING '⚠️ relationships table still exists!';
  ELSE
    RAISE NOTICE '✅ relationships table successfully renamed';
  END IF;
  
  IF legacy_relationships_exists THEN
    RAISE NOTICE '✅ legacy_relationships table exists';
  ELSE
    RAISE WARNING '⚠️ legacy_relationships table does not exist';
  END IF;
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Migration complete. relationships table is now legacy_relationships.';
  RAISE NOTICE 'All new code should use user_event_relationships table.';
  RAISE NOTICE '================================================';
END $$;

COMMIT;

-- ============================================
-- NOTES FOR FUTURE CLEANUP
-- ============================================
-- After a monitoring period (e.g., 30 days), if no issues are found:
-- 1. Verify no code references legacy_relationships
-- 2. Verify all data is in user_event_relationships
-- 3. Drop legacy_relationships table with:
--    DROP TABLE IF EXISTS public.legacy_relationships CASCADE;
-- ============================================


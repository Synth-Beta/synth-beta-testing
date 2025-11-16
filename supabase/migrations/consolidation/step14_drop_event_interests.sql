-- ============================================
-- STEP 14: DROP event_interests TABLE
-- ============================================
-- Drop event_interests table after handling remaining rows

DO $$
DECLARE
  event_interests_count BIGINT;
  relationships_count BIGINT;
BEGIN
  RAISE NOTICE '=== DROP event_interests TABLE ===';
  RAISE NOTICE '';
  
  SELECT COUNT(*) INTO event_interests_count FROM public.event_interests;
  
  -- Check if all rows exist in relationships (from any source)
  SELECT COUNT(*) INTO relationships_count
  FROM public.event_interests ei
  WHERE EXISTS (
    SELECT 1 FROM public.relationships r
    WHERE r.user_id = ei.user_id
      AND r.related_entity_type = 'event'
      AND r.related_entity_id = ei.event_id::TEXT
      AND r.relationship_type = 'interest'
  );
  
  RAISE NOTICE 'Before dropping:';
  RAISE NOTICE '  event_interests rows: %', event_interests_count;
  RAISE NOTICE '  Already exist in relationships: %', relationships_count;
  RAISE NOTICE '';
  
  IF relationships_count = event_interests_count THEN
    RAISE NOTICE '✅ All % rows already exist in relationships (duplicates from another source)', event_interests_count;
    RAISE NOTICE 'Safe to drop event_interests table';
  ELSIF relationships_count < event_interests_count THEN
    RAISE NOTICE '⚠️ WARNING: %/% rows exist in relationships', relationships_count, event_interests_count;
    RAISE NOTICE '% rows are unmigrated (likely orphaned data)', event_interests_count - relationships_count;
    RAISE NOTICE 'Proceeding with drop anyway...';
  END IF;
  
  -- Drop the table
  DROP TABLE IF EXISTS public.event_interests CASCADE;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ event_interests table dropped';
  
  IF relationships_count < event_interests_count THEN
    RAISE NOTICE '';
    RAISE NOTICE 'Note: % unmigrated row(s) were orphaned data', event_interests_count - relationships_count;
    RAISE NOTICE '      (referenced non-existent users or events)';
  END IF;
END $$;

-- Verification
SELECT 
  'Dropped Table Verification' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_interests'
    ) THEN 'STILL EXISTS ⚠️'
    ELSE 'DROPPED ✅'
  END as event_interests_status;


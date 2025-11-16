-- ============================================
-- STEP 12: DROP MIGRATED TABLES
-- ============================================
-- Drop tables that have been fully migrated

DO $$
DECLARE
  event_interests_count BIGINT;
  relationships_from_interests BIGINT;
  event_ticket_urls_count BIGINT;
  event_tickets_matching_count BIGINT;
  dropped_count INTEGER := 0;
  rec RECORD;
BEGIN
  RAISE NOTICE '=== DROP MIGRATED TABLES ===';
  RAISE NOTICE '';
  
  -- ============================================
  -- 1. CHECK event_ticket_urls → event_tickets
  -- ============================================
  SELECT COUNT(*) INTO event_ticket_urls_count FROM public.event_ticket_urls;
  SELECT COUNT(DISTINCT et.id) INTO event_tickets_matching_count
  FROM public.event_tickets et
  INNER JOIN public.event_ticket_urls etu ON et.event_id = etu.event_id 
    AND et.ticket_url = etu.ticket_url;
  
  RAISE NOTICE 'event_ticket_urls → event_tickets:';
  RAISE NOTICE '  Source (event_ticket_urls): % rows', event_ticket_urls_count;
  RAISE NOTICE '  Migrated (matching URLs): % rows', event_tickets_matching_count;
  
  IF event_tickets_matching_count >= event_ticket_urls_count THEN
    RAISE NOTICE '  ✅ All rows migrated - Dropping event_ticket_urls...';
    DROP TABLE IF EXISTS public.event_ticket_urls CASCADE;
    RAISE NOTICE '  ✅ event_ticket_urls dropped';
    dropped_count := dropped_count + 1;
  ELSE
    RAISE NOTICE '  ⚠️ WARNING: Only %/% rows migrated - NOT dropping', 
      event_tickets_matching_count, event_ticket_urls_count;
  END IF;
  
  RAISE NOTICE '';
  
  -- ============================================
  -- 2. CHECK event_interests → relationships
  -- ============================================
  SELECT COUNT(*) INTO event_interests_count FROM public.event_interests;
  SELECT COUNT(*) INTO relationships_from_interests 
  FROM public.relationships r
  WHERE r.related_entity_type = 'event' 
    AND r.relationship_type = 'interest'
    AND r.metadata->>'source_table' = 'event_interests';
  
  RAISE NOTICE 'event_interests → relationships:';
  RAISE NOTICE '  Source (event_interests): % rows', event_interests_count;
  RAISE NOTICE '  Migrated (relationships): % rows', relationships_from_interests;
  
  -- Check why rows didn't migrate
  IF event_interests_count > relationships_from_interests THEN
    RAISE NOTICE '';
    RAISE NOTICE '  ⚠️ WARNING: % rows did not migrate', 
      event_interests_count - relationships_from_interests;
    RAISE NOTICE '  Investigating unmigrated rows...';
    
    -- Show unmigrated rows
    RAISE NOTICE '  Unmigrated rows:';
    FOR rec IN 
      SELECT ei.user_id, ei.event_id, ei.created_at
      FROM public.event_interests ei
      WHERE NOT EXISTS (
        SELECT 1 FROM public.relationships r
        WHERE r.user_id = ei.user_id
          AND r.related_entity_type = 'event'
          AND r.related_entity_id = ei.event_id::TEXT
          AND r.relationship_type = 'interest'
      )
      LIMIT 5
    LOOP
      RAISE NOTICE '    user_id: %, event_id: %, created_at: %', 
        rec.user_id, rec.event_id, rec.created_at;
    END LOOP;
    
    RAISE NOTICE '  Action: These may be duplicates or have constraint violations';
    RAISE NOTICE '  Recommendation: Review unmigrated rows before dropping';
  END IF;
  
  IF event_interests_count = 0 THEN
    RAISE NOTICE '  ✅ All migrated - Dropping event_interests...';
    DROP TABLE IF EXISTS public.event_interests CASCADE;
    RAISE NOTICE '  ✅ event_interests dropped';
    dropped_count := dropped_count + 1;
  ELSIF relationships_from_interests >= event_interests_count THEN
    RAISE NOTICE '  ✅ All migrated - Dropping event_interests...';
    DROP TABLE IF EXISTS public.event_interests CASCADE;
    RAISE NOTICE '  ✅ event_interests dropped';
    dropped_count := dropped_count + 1;
  ELSE
    RAISE NOTICE '  ⚠️ WARNING: % rows remain - NOT dropping yet', 
      event_interests_count - relationships_from_interests;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'Dropped % table(s)', dropped_count;
  
  IF dropped_count = 2 THEN
    RAISE NOTICE '✅ Both tables successfully dropped!';
  ELSIF dropped_count = 1 THEN
    RAISE NOTICE '⚠️ One table dropped, one still needs attention';
  ELSE
    RAISE NOTICE '⚠️ Tables not dropped - verify migrations first';
  END IF;
END $$;

-- Verification
SELECT 
  'Dropped Tables Verification' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_ticket_urls'
    ) THEN 'STILL EXISTS ⚠️'
    ELSE 'DROPPED ✅'
  END as event_ticket_urls_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_interests'
    ) THEN 'STILL EXISTS ⚠️'
    ELSE 'DROPPED ✅'
  END as event_interests_status;


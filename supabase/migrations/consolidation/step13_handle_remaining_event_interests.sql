-- ============================================
-- STEP 13: HANDLE REMAINING event_interests ROWS
-- ============================================
-- Investigate and handle the 2 remaining rows that didn't migrate

DO $$
DECLARE
  event_interests_count BIGINT;
  unmigrated_count BIGINT;
  rec RECORD;
  migration_attempted INTEGER := 0;
BEGIN
  RAISE NOTICE '=== HANDLE REMAINING event_interests ROWS ===';
  RAISE NOTICE '';
  
  SELECT COUNT(*) INTO event_interests_count FROM public.event_interests;
  RAISE NOTICE 'Total event_interests rows remaining: %', event_interests_count;
  RAISE NOTICE '';
  
  -- Show all remaining rows
  RAISE NOTICE 'Remaining event_interests rows:';
  FOR rec IN 
    SELECT 
      ei.id,
      ei.user_id,
      ei.event_id,
      ei.created_at,
      EXISTS (
        SELECT 1 FROM public.relationships r
        WHERE r.user_id = ei.user_id
          AND r.related_entity_type = 'event'
          AND r.related_entity_id = ei.event_id::TEXT
          AND r.relationship_type = 'interest'
      ) as already_in_relationships,
      EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id::TEXT = ei.event_id::TEXT
      ) as event_exists,
      EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id = ei.user_id
      ) as user_exists
    FROM public.event_interests ei
    ORDER BY ei.created_at
  LOOP
    RAISE NOTICE '';
    RAISE NOTICE '  Row ID: %', rec.id;
    RAISE NOTICE '  user_id: %', rec.user_id;
    RAISE NOTICE '  event_id: %', rec.event_id;
    RAISE NOTICE '  created_at: %', rec.created_at;
    RAISE NOTICE '  Already in relationships: %', rec.already_in_relationships;
    RAISE NOTICE '  Event exists: %', rec.event_exists;
    RAISE NOTICE '  User exists: %', rec.user_exists;
    
    IF rec.already_in_relationships THEN
      RAISE NOTICE '  → Status: Already migrated (may be from different source)';
      RAISE NOTICE '  → Action: Safe to ignore, likely duplicate';
    ELSIF NOT rec.user_exists THEN
      RAISE NOTICE '  → Status: User does not exist';
      RAISE NOTICE '  → Action: Cannot migrate, orphaned data';
    ELSIF NOT rec.event_exists THEN
      RAISE NOTICE '  → Status: Event does not exist';
      RAISE NOTICE '  → Action: Cannot migrate, orphaned data';
    ELSE
      RAISE NOTICE '  → Status: Can be migrated';
      RAISE NOTICE '  → Action: Attempting migration...';
      
      -- Try to migrate this row
      BEGIN
        INSERT INTO public.relationships (
          user_id,
          related_entity_type,
          related_entity_id,
          relationship_type,
          metadata,
          created_at,
          updated_at
        )
        SELECT 
          ei.user_id,
          'event' as related_entity_type,
          ei.event_id::TEXT as related_entity_id,
          'interest' as relationship_type,
          jsonb_build_object(
            'source_table', 'event_interests',
            'event_id', ei.event_id,
            'migrated_at', NOW()
          ) as metadata,
          COALESCE(ei.created_at, NOW()) as created_at,
          COALESCE(ei.created_at, NOW()) as updated_at
        FROM public.event_interests ei
        WHERE ei.id = rec.id
        ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) 
        DO NOTHING;
        
        GET DIAGNOSTICS migration_attempted = ROW_COUNT;
        
        IF migration_attempted > 0 THEN
          RAISE NOTICE '  → ✅ Successfully migrated!';
        ELSE
          RAISE NOTICE '  → ⚠️ Migration skipped (conflict)';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  → ❌ Migration failed: %', SQLERRM;
      END;
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  
  -- Final count check
  SELECT COUNT(*) INTO unmigrated_count
  FROM public.event_interests ei
  WHERE NOT EXISTS (
    SELECT 1 FROM public.relationships r
    WHERE r.user_id = ei.user_id
      AND r.related_entity_type = 'event'
      AND r.related_entity_id = ei.event_id::TEXT
      AND r.relationship_type = 'interest'
  );
  
  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'Remaining unmigrated rows: %', unmigrated_count;
  
  IF unmigrated_count = 0 THEN
    RAISE NOTICE '✅ All rows handled - Safe to drop event_interests';
  ELSIF unmigrated_count > 0 THEN
    RAISE NOTICE '⚠️ % row(s) remain unmigrated', unmigrated_count;
    RAISE NOTICE 'These are likely orphaned (user or event does not exist)';
    RAISE NOTICE 'Recommendation: Drop event_interests anyway, data is invalid';
  END IF;
END $$;

-- Final verification
SELECT 
  'Final Check' as check_type,
  (SELECT COUNT(*) FROM public.event_interests) as event_interests_remaining,
  (SELECT COUNT(*) FROM public.relationships r
   WHERE r.related_entity_type = 'event' 
     AND r.relationship_type = 'interest'
     AND r.metadata->>'source_table' = 'event_interests') as migrated_to_relationships,
  CASE 
    WHEN (SELECT COUNT(*) FROM public.event_interests) = 0 THEN 'READY TO DROP ✅'
    ELSE 'REVIEW NEEDED ⚠️'
  END as recommendation;


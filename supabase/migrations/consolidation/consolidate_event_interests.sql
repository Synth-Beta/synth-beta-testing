-- ============================================
-- CONSOLIDATE event_interests INTO relationships
-- ============================================
-- This script migrates data from event_interests to relationships table
-- event_interests should be merged into relationships with relationship_type='interest'

DO $$
DECLARE
  migrated_count INTEGER;
  source_count INTEGER;
  skipped_count INTEGER;
BEGIN
  -- Get source count
  SELECT COUNT(*) INTO source_count FROM public.event_interests;
  
  RAISE NOTICE 'Starting migration of % rows from event_interests to relationships', source_count;
  
  -- Migrate data
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
      'event_id', ei.event_id
    ) as metadata,
    COALESCE(ei.created_at, NOW()) as created_at,
    COALESCE(ei.created_at, NOW()) as updated_at
  FROM public.event_interests ei
  ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) 
  DO NOTHING;
  
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  skipped_count := source_count - migrated_count;
  
  RAISE NOTICE 'Migration complete:';
  RAISE NOTICE '  - Migrated: % rows', migrated_count;
  RAISE NOTICE '  - Skipped (duplicates): % rows', skipped_count;
  RAISE NOTICE '  - Source total: % rows', source_count;
END $$;

-- Verification
SELECT 
  'Migration Verification' as verification_type,
  'event_interests → relationships' as consolidation,
  (
    SELECT COUNT(*) 
    FROM public.relationships 
    WHERE related_entity_type = 'event' 
      AND relationship_type = 'interest'
  ) as total_interest_relationships,
  (
    SELECT COUNT(*) 
    FROM public.relationships 
    WHERE related_entity_type = 'event' 
      AND relationship_type = 'interest'
      AND metadata->>'source_table' = 'event_interests'
  ) as migrated_from_event_interests,
  (SELECT COUNT(*) FROM public.event_interests) as old_count,
  (
    SELECT COUNT(*) 
    FROM public.event_interests ei
    WHERE NOT EXISTS (
      SELECT 1 FROM public.relationships r
      WHERE r.user_id = ei.user_id
        AND r.related_entity_type = 'event'
        AND r.related_entity_id = ei.event_id::TEXT
        AND r.relationship_type = 'interest'
    )
  ) as unmigrated_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM public.event_interests) = 0 
    THEN '✅ All migrated - Ready to drop'
    WHEN (
      SELECT COUNT(*) 
      FROM public.event_interests ei
      WHERE NOT EXISTS (
        SELECT 1 FROM public.relationships r
        WHERE r.user_id = ei.user_id
          AND r.related_entity_type = 'event'
          AND r.related_entity_id = ei.event_id::TEXT
          AND r.relationship_type = 'interest'
      )
    ) = 0
    THEN '✅ All rows exist in relationships (some may have existed already) - Ready to drop'
    ELSE '⚠️  Some rows may not have been migrated - Review needed'
  END as status;


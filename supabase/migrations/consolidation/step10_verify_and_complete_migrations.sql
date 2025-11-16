-- ============================================
-- STEP 10: VERIFY AND COMPLETE MIGRATIONS
-- ============================================
-- Verify that event_interests and event_ticket_urls migrations completed
-- Then handle remaining tables

DO $$
DECLARE
  event_interests_count BIGINT;
  relationships_from_interests BIGINT;
  event_ticket_urls_count BIGINT;
  event_tickets_count BIGINT;
  email_preferences_count BIGINT;
  email_gate_entries_count BIGINT;
  consolidation_stash_count BIGINT;
BEGIN
  RAISE NOTICE '=== VERIFY MIGRATIONS ===';
  RAISE NOTICE '';
  
  -- Check event_interests migration
  SELECT COUNT(*) INTO event_interests_count FROM public.event_interests;
  SELECT COUNT(*) INTO relationships_from_interests 
  FROM public.relationships r
  WHERE r.related_entity_type = 'event' 
    AND r.relationship_type = 'interest'
    AND r.metadata->>'source_table' = 'event_interests';
  
  RAISE NOTICE 'event_interests → relationships:';
  RAISE NOTICE '  Source (event_interests): % rows', event_interests_count;
  RAISE NOTICE '  Migrated (relationships): % rows', relationships_from_interests;
  
  IF event_interests_count = 0 THEN
    RAISE NOTICE '  ✅ All migrated - Safe to drop event_interests';
  ELSIF relationships_from_interests >= event_interests_count THEN
    RAISE NOTICE '  ✅ Migration complete - Safe to drop event_interests';
  ELSE
    RAISE NOTICE '  ⚠️ WARNING: Only %/% rows migrated', relationships_from_interests, event_interests_count;
    RAISE NOTICE '  Action: Re-run consolidate_event_interests.sql or migrate remaining rows';
  END IF;
  
  RAISE NOTICE '';
  
  -- Check event_ticket_urls migration
  SELECT COUNT(*) INTO event_ticket_urls_count FROM public.event_ticket_urls;
  -- Count tickets that match URLs from event_ticket_urls
  SELECT COUNT(DISTINCT et.id) INTO event_tickets_count
  FROM public.event_tickets et
  INNER JOIN public.event_ticket_urls etu ON et.event_id = etu.event_id 
    AND et.ticket_url = etu.ticket_url;
  
  RAISE NOTICE 'event_ticket_urls → event_tickets:';
  RAISE NOTICE '  Source (event_ticket_urls): % rows', event_ticket_urls_count;
  RAISE NOTICE '  Migrated (matching URLs in event_tickets): % rows', event_tickets_count;
  
  IF event_ticket_urls_count = 0 THEN
    RAISE NOTICE '  ✅ All migrated - Safe to drop event_ticket_urls';
  ELSIF event_tickets_count >= event_ticket_urls_count THEN
    RAISE NOTICE '  ✅ Migration complete - Safe to drop event_ticket_urls';
  ELSE
    RAISE NOTICE '  ⚠️ WARNING: Only %/% rows migrated', event_tickets_count, event_ticket_urls_count;
    RAISE NOTICE '  Action: Re-run consolidate_event_ticket_urls.sql or migrate remaining rows';
  END IF;
  
  RAISE NOTICE '';
  
  -- Check other tables
  SELECT COUNT(*) INTO email_preferences_count FROM public.email_preferences;
  SELECT COUNT(*) INTO email_gate_entries_count FROM public.email_gate_entries;
  SELECT COUNT(*) INTO consolidation_stash_count FROM public.consolidation_data_stash;
  
  RAISE NOTICE 'Other Tables:';
  RAISE NOTICE '  email_preferences: % rows (should be migrated to user_preferences.email_preferences)', email_preferences_count;
  RAISE NOTICE '  email_gate_entries: % rows (review purpose)', email_gate_entries_count;
  RAISE NOTICE '  consolidation_data_stash: % rows (temporary migration table)', consolidation_stash_count;
END $$;

-- Output summary table
SELECT 
  'Migration Verification' as check_type,
  'event_interests → relationships' as migration,
  (SELECT COUNT(*) FROM public.event_interests) as source_count,
  (SELECT COUNT(*) FROM public.relationships r
   WHERE r.related_entity_type = 'event' 
     AND r.relationship_type = 'interest'
     AND r.metadata->>'source_table' = 'event_interests') as migrated_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM public.event_interests) = 0 THEN 'READY TO DROP ✅'
    WHEN (SELECT COUNT(*) FROM public.relationships r
          WHERE r.related_entity_type = 'event' 
            AND r.relationship_type = 'interest'
            AND r.metadata->>'source_table' = 'event_interests') >= 
         (SELECT COUNT(*) FROM public.event_interests) THEN 'READY TO DROP ✅'
    ELSE 'NEEDS MIGRATION ⚠️'
  END as status

UNION ALL

SELECT 
  'Migration Verification',
  'event_ticket_urls → event_tickets',
  (SELECT COUNT(*) FROM public.event_ticket_urls) as source_count,
  (SELECT COUNT(DISTINCT et.id)
   FROM public.event_tickets et
   INNER JOIN public.event_ticket_urls etu ON et.event_id = etu.event_id 
     AND et.ticket_url = etu.ticket_url) as migrated_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM public.event_ticket_urls) = 0 THEN 'READY TO DROP ✅'
    WHEN (SELECT COUNT(DISTINCT et.id)
          FROM public.event_tickets et
          INNER JOIN public.event_ticket_urls etu ON et.event_id = etu.event_id 
            AND et.ticket_url = etu.ticket_url) >= 
         (SELECT COUNT(*) FROM public.event_ticket_urls) THEN 'READY TO DROP ✅'
    ELSE 'NEEDS MIGRATION ⚠️'
  END as status;


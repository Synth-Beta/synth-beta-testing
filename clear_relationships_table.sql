-- ============================================
-- CLEAR ONLY ORPHANED RELATIONSHIPS
-- ============================================
-- This will remove only the 24 relationships where the event doesn't exist
-- Safe operation - only deletes orphaned relationships

-- First, check how many orphaned relationships exist
-- Note: related_entity_id is TEXT, events.id is UUID
-- We need to filter for valid UUIDs only and handle invalid ones
SELECT 
  COUNT(*) as orphaned_relationships_count,
  STRING_AGG(related_entity_id, ', ') as orphaned_event_ids
FROM public.relationships r
WHERE r.related_entity_type = 'event'
  AND (
    -- Invalid UUIDs (not 36 chars or don't match UUID pattern) are considered orphaned
    LENGTH(r.related_entity_id) != 36
    OR r.related_entity_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    -- OR valid UUIDs that don't exist in events table
    OR (
      LENGTH(r.related_entity_id) = 36
      AND r.related_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND r.related_entity_id::uuid NOT IN (SELECT id FROM public.events)
    )
  );

-- Delete only orphaned relationships (where event doesn't exist)
-- Handle both invalid UUIDs and valid UUIDs that don't exist in events
DELETE FROM public.relationships
WHERE related_entity_type = 'event'
  AND (
    -- Invalid UUIDs (not valid UUID format) - these are definitely orphaned
    LENGTH(related_entity_id) != 36
    OR related_entity_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    -- OR valid UUIDs that don't exist in events table
    OR (
      LENGTH(related_entity_id) = 36
      AND related_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND related_entity_id::uuid NOT IN (SELECT id FROM public.events)
    )
  );

-- Verify the deletion - should show 0 orphaned relationships
SELECT 
  COUNT(*) as remaining_orphaned_relationships
FROM public.relationships r
WHERE r.related_entity_type = 'event'
  AND (
    LENGTH(r.related_entity_id) != 36
    OR r.related_entity_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (
      LENGTH(r.related_entity_id) = 36
      AND r.related_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND r.related_entity_id::uuid NOT IN (SELECT id FROM public.events)
    )
  );

-- Show remaining valid relationships
SELECT 
  COUNT(*) as total_valid_relationships,
  COUNT(DISTINCT user_id) as users_with_relationships,
  relationship_type,
  COUNT(*) as count_by_type
FROM public.relationships
WHERE related_entity_type = 'event'
  AND LENGTH(related_entity_id) = 36
  AND related_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND related_entity_id::uuid IN (
    SELECT id FROM public.events
  )
GROUP BY relationship_type;


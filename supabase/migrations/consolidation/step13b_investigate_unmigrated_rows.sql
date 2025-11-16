-- ============================================
-- STEP 13B: INVESTIGATE UNMIGRATED ROWS
-- ============================================
-- Show details of rows that didn't migrate

SELECT 
  'Unmigrated event_interests rows' as check_type,
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
  ) as user_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.relationships r
      WHERE r.user_id = ei.user_id
        AND r.related_entity_type = 'event'
        AND r.related_entity_id = ei.event_id::TEXT
        AND r.relationship_type = 'interest'
    ) THEN 'Duplicate - Already migrated'
    WHEN NOT EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = ei.user_id
    ) THEN 'Orphaned - User does not exist'
    WHEN NOT EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id::TEXT = ei.event_id::TEXT
    ) THEN 'Orphaned - Event does not exist'
    ELSE 'Unknown issue'
  END as reason
FROM public.event_interests ei
WHERE NOT EXISTS (
  SELECT 1 FROM public.relationships r
  WHERE r.user_id = ei.user_id
    AND r.related_entity_type = 'event'
    AND r.related_entity_id = ei.event_id::TEXT
    AND r.relationship_type = 'interest'
)
ORDER BY ei.created_at;


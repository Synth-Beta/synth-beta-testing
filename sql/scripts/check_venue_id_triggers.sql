-- ============================================
-- CHECK: Triggers that should populate venue_id
-- ============================================

-- Check all triggers on events table
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement,
  action_orientation
FROM information_schema.triggers
WHERE event_object_table = 'events'
ORDER BY trigger_name;

-- Check functions that reference venue_id
SELECT 
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (
    routine_definition LIKE '%venue_id%'
    OR routine_name LIKE '%venue%'
  )
ORDER BY routine_name;

-- Check if there's a trigger that should auto-populate venue_id from venue_name
SELECT 
  t.trigger_name,
  t.event_manipulation,
  t.action_timing,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
FROM information_schema.triggers t
JOIN pg_trigger pt ON pt.tgname = t.trigger_name
JOIN pg_proc p ON p.oid = pt.tgfoid
WHERE t.event_object_table = 'events'
  AND (
    t.trigger_name LIKE '%venue%'
    OR pg_get_functiondef(p.oid) LIKE '%venue_id%'
  )
ORDER BY t.trigger_name;


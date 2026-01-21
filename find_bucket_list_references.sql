-- ============================================
-- DIAGNOSTIC QUERY: Find all references to bl.entity_type
-- ============================================
-- Run this in Supabase SQL Editor to find what's still referencing the old column
-- ============================================

-- Find functions that reference bl.entity_type
SELECT 
    'FUNCTION' as object_type,
    routine_schema,
    routine_name,
    routine_type,
    LEFT(routine_definition, 500) as definition_preview
FROM information_schema.routines
WHERE routine_definition LIKE '%bl.entity_type%'
  AND routine_schema = 'public'
ORDER BY routine_name;

-- Find views that reference bl.entity_type
SELECT 
    'VIEW' as object_type,
    table_schema,
    table_name,
    'VIEW' as routine_type,
    LEFT(view_definition, 500) as definition_preview
FROM information_schema.views
WHERE view_definition LIKE '%bl.entity_type%'
  AND table_schema = 'public'
ORDER BY table_name;

-- Find triggers that might be calling functions with old references
SELECT 
    'TRIGGER' as object_type,
    trigger_schema,
    trigger_name,
    event_object_table,
    action_statement,
    action_timing,
    event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND (
    action_statement LIKE '%bucket%'
    OR action_statement LIKE '%notify_bucket%'
    OR action_statement LIKE '%preference%'
  )
ORDER BY event_object_table, trigger_name;

-- Find all functions that reference bucket_list at all
SELECT 
    'FUNCTION (any bucket_list ref)' as object_type,
    routine_schema,
    routine_name,
    routine_type,
    LEFT(routine_definition, 500) as definition_preview
FROM information_schema.routines
WHERE routine_definition LIKE '%bucket_list%'
  AND routine_schema = 'public'
ORDER BY routine_name;

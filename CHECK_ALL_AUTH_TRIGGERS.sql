-- Find all triggers on auth.users table that run during signup
-- One of these might be failing

SELECT 
  tgname AS trigger_name,
  tgenabled AS enabled,
  tgtype AS trigger_type,
  pg_get_triggerdef(oid) AS trigger_definition
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
ORDER BY tgname;

-- Also check for any functions that might be called by these triggers
SELECT DISTINCT
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'auth.users'::regclass;


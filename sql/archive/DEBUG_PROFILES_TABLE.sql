-- Debug script to check the profiles table structure
-- Run this to see what columns exist and their constraints

SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable,
  character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- Also check for any constraints
SELECT
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  col.column_name
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN information_schema.columns col ON col.table_name = rel.relname
WHERE rel.relname = 'profiles'
  AND con.contype IN ('c', 'u', 'p', 'f')
ORDER BY con.conname;


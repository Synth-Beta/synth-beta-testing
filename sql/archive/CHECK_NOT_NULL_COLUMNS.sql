-- Find all NOT NULL columns in profiles table that don't have defaults
-- These columns MUST be included in the INSERT statement

SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND is_nullable = 'NO'
ORDER BY column_name;


-- Check if email_preferences table exists and its structure
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'email_preferences'
ORDER BY ordinal_position;

-- Check if the table exists at all
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public'
  AND table_name = 'email_preferences'
) AS table_exists;


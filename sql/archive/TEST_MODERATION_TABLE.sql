-- Test moderation_flags table structure and data
-- Run this in Supabase SQL Editor

-- 1. Check if table exists
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'moderation_flags' 
ORDER BY ordinal_position;

-- 2. Check table constraints
SELECT 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'moderation_flags';

-- 3. Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'moderation_flags';

-- 4. Test basic query
SELECT COUNT(*) as total_flags FROM moderation_flags;

-- 5. Check if any flags exist
SELECT * FROM moderation_flags LIMIT 5;

-- 6. Check enum values
SELECT unnest(enum_range(NULL::flag_status_enum)) as flag_status_values;
SELECT unnest(enum_range(NULL::moderation_entity_type_enum)) as entity_type_values;
SELECT unnest(enum_range(NULL::moderation_flag_type_enum)) as flag_type_values;

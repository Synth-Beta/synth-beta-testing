-- ============================================================
-- CHECK VENUES TABLE SCHEMA AND RLS
-- Run this to see what columns actually exist
-- ============================================================

-- 1. Check table exists
SELECT 
  'Table Exists' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'venues'
    ) THEN '✅ Table EXISTS'
    ELSE '❌ Table DOES NOT EXIST'
  END as result;

-- 2. List all columns in venues table
SELECT 
  'Table Columns' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'venues'
ORDER BY ordinal_position;

-- 3. Check RLS status
SELECT 
  'RLS Status' as check_type,
  tablename,
  rowsecurity as rls_enabled,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'venues' AND schemaname = 'public') as policy_count
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename = 'venues';

-- 4. List all RLS policies
SELECT 
  'RLS Policies' as check_type,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'venues'
ORDER BY policyname;

-- 5. Check grants
SELECT 
  'Grants' as check_type,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' 
AND table_name = 'venues'
ORDER BY grantee, privilege_type;

-- 6. Test query (should work if everything is set up correctly)
SELECT 
  'Test Query' as check_type,
  COUNT(*) as total_venues
FROM public.venues;


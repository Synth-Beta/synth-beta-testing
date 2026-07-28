-- Check database permissions and RLS policies for profiles table
-- Run this in your Supabase SQL Editor

-- 1. Check if profiles table exists and its structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Check RLS status
SELECT 
    schemaname,
    tablename,
    rowsecurity,
    forcerowsecurity
FROM pg_tables 
WHERE tablename = 'profiles';

-- 3. Check RLS policies
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'profiles';

-- 4. Check if user can access profiles table
SELECT COUNT(*) as profile_count FROM public.profiles;

-- 5. Test insert permission (this will fail if user doesn't have permission)
-- INSERT INTO public.profiles (user_id, name) VALUES ('00000000-0000-0000-0000-000000000000', 'Test User');

-- 6. Check current user context
SELECT 
    current_user,
    session_user,
    current_setting('request.jwt.claims', true)::json->>'sub' as user_id_from_jwt;
